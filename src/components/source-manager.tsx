import { useMemo, useState } from "react";
import { checkSourceReachability, deleteSource, upsertSource } from "../lib/desktop-api";
import { useGuardedAction } from "../hooks/use-guarded-action";
import type { RepoSource, SourceReachability } from "../types/models";
import { StatusBanner } from "./status-banner";

type Locale = "zh" | "en";

const SOURCE_TEXT = {
  zh: {
    sourceIdRule: "源 ID 仅支持小写字母、数字和连字符",
    sourceNameRequired: "源名称不能为空",
    sourceUrlMustHttps: "源地址必须使用 HTTPS",
    sourceUrlInvalid: "源地址格式无效",
    sourceUnreachable: "仓库源不可达",
    confirmDelete: (name: string) => `确认删除仓库源「${name}」吗？`,
    successSaved: (name: string, editing: boolean) => `源「${name}」已${editing ? "更新" : "保存"}`,
    successToggled: (name: string, enabled: boolean) => `源「${name}」已${enabled ? "禁用" : "启用"}`,
    successDeleted: (name: string) => `源「${name}」已删除`,
    title: "仓库源管理",
    subtitle: "维护自定义源并在技能市场中进行筛选。",
    customSourceCount: "自定义源",
    editSource: "编辑仓库源",
    addSource: "新增仓库源",
    displayName: "显示名称",
    repoUrl: "仓库地址",
    repoIdHint: "源 ID 将自动生成并用于内部存储，无需手动填写。",
    branchOptional: "分支（可选）",
    skillsPathOptional: "技能子目录（可选）",
    skillsPathHint: "留空时默认扫描仓库根目录，并自动按 main/master 兜底分支。",
    updateSource: "更新源",
    saveSource: "保存源",
    probeSource: "检查可达性",
    cancelEdit: "取消编辑",
    reachability: "可达性",
    reachable: "可达",
    unreachable: "不可达",
    noDetail: "无详情",
    customSourceList: "自定义源列表",
    statusEnabled: "已启用",
    statusDisabled: "已禁用",
    branch: "分支",
    auto: "自动",
    subDir: "子目录",
    rootDir: "仓库根目录",
    repoIntro: "仓库介绍",
    untested: "未检测",
    edit: "编辑",
    disable: "禁用",
    enable: "启用",
    remove: "删除",
    noCustomSource: "暂无自定义源。"
  },
  en: {
    sourceIdRule: "Source ID supports lowercase letters, numbers, and hyphens only",
    sourceNameRequired: "Source name is required",
    sourceUrlMustHttps: "Source URL must use HTTPS",
    sourceUrlInvalid: "Invalid source URL",
    sourceUnreachable: "Repository source is unreachable",
    confirmDelete: (name: string) => `Delete repository source "${name}"?`,
    successSaved: (name: string, editing: boolean) => `Source "${name}" ${editing ? "updated" : "saved"}`,
    successToggled: (name: string, enabled: boolean) => `Source "${name}" ${enabled ? "disabled" : "enabled"}`,
    successDeleted: (name: string) => `Source "${name}" deleted`,
    title: "Repository Source Management",
    subtitle: "Maintain custom sources and filter them in the skill market.",
    customSourceCount: "Custom sources",
    editSource: "Edit source",
    addSource: "Add source",
    displayName: "Display name",
    repoUrl: "Repository URL",
    repoIdHint: "Source ID is auto-generated for internal storage; no manual input required.",
    branchOptional: "Branch (optional)",
    skillsPathOptional: "Skills subdirectory (optional)",
    skillsPathHint: "Empty means scanning repo root, with main/master fallback.",
    updateSource: "Update source",
    saveSource: "Save source",
    probeSource: "Check reachability",
    cancelEdit: "Cancel",
    reachability: "Reachability",
    reachable: "Reachable",
    unreachable: "Unreachable",
    noDetail: "No details",
    customSourceList: "Custom source list",
    statusEnabled: "Enabled",
    statusDisabled: "Disabled",
    branch: "Branch",
    auto: "Auto",
    subDir: "Subdirectory",
    rootDir: "Repository root",
    repoIntro: "Repository intro",
    untested: "Not tested",
    edit: "Edit",
    disable: "Disable",
    enable: "Enable",
    remove: "Delete",
    noCustomSource: "No custom sources yet."
  }
} as const;

function normalizeSourceId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-$/g, "");
}

function suggestSourceId(name: string, repoUrl: string): string {
  const fromName = normalizeSourceId(name);
  if (fromName) return fromName;
  try {
    const parsed = new URL(repoUrl);
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    return normalizeSourceId(`${owner ?? ""}-${repo ?? ""}`);
  } catch {
    return "";
  }
}

function allocateSourceId(
  form: { id: string; name: string; repoUrl: string },
  editingId: string | null,
  sources: RepoSource[]
): string {
  const fixedId = normalizeSourceId(form.id);
  if (fixedId) return fixedId;
  if (editingId) return editingId;

  const base = suggestSourceId(form.name, form.repoUrl) || "source";
  const existing = new Set(sources.map((source) => source.id));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function validateSourceInput(
  input: { id: string; name: string; repoUrl: string },
  locale: Locale
): string | null {
  const text = SOURCE_TEXT[locale];
  if (!/^[a-z0-9-]+$/.test(input.id)) return text.sourceIdRule;
  if (!input.name.trim()) return text.sourceNameRequired;
  try {
    const parsed = new URL(input.repoUrl);
    if (parsed.protocol !== "https:") return text.sourceUrlMustHttps;
  } catch {
    return text.sourceUrlInvalid;
  }
  return null;
}

function normalizeOptionalBranch(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized;
}

function normalizeOptionalSkillsPath(value: string): string | undefined {
  const normalized = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) return undefined;
  return normalized;
}

function deriveRepoSlug(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      return `${segments[0]}/${segments[1].replace(/\.git$/i, "")}`;
    }
    return parsed.hostname;
  } catch {
    return "repository";
  }
}

function buildRepoIntro(source: RepoSource, locale: Locale, text: typeof SOURCE_TEXT["zh"] | typeof SOURCE_TEXT["en"]): string {
  const explicit = String(source.description ?? "").trim();
  if (explicit) return explicit;

  const repo = deriveRepoSlug(source.repoUrl);
  const branch = source.repoBranch ?? text.auto;
  const subDir = source.skillsPath ?? text.rootDir;
  if (locale === "zh") {
    return `从 ${repo} 同步 Skill（分支：${branch}，目录：${subDir}）。`;
  }
  return `Sync skills from ${repo} (branch: ${branch}, path: ${subDir}).`;
}

export function SourceManager(props: {
  locale: Locale;
  sources: RepoSource[];
  onChanged: () => Promise<void>;
}) {
  const text = SOURCE_TEXT[props.locale];
  const [form, setForm] = useState({
    id: "",
    name: "",
    repoUrl: "",
    repoBranch: "",
    skillsPath: "",
    enabled: true
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [reachability, setReachability] = useState<SourceReachability | null>(null);
  const [reachabilityBySource, setReachabilityBySource] = useState<Record<string, SourceReachability>>({});
  const [successMessage, setSuccessMessage] = useState<string>("");
  const { run, error, loading } = useGuardedAction();

  const customSources = useMemo(
    () => props.sources.filter((source) => !source.curated),
    [props.sources]
  );

  const clearForm = () => {
    setForm({
      id: "",
      name: "",
      repoUrl: "",
      repoBranch: "",
      skillsPath: "",
      enabled: true
    });
    setEditingId(null);
    setReachability(null);
  };

  const probe = async (payload: { id: string; name: string; repoUrl: string }) => {
    const validationError = validateSourceInput(payload, props.locale);
    setInlineError(validationError);
    if (validationError) {
      setReachability(null);
      return null;
    }

    const checked = await run(() => checkSourceReachability(payload));
    if (!checked) {
      return null;
    }
    setReachability(checked);
    return checked;
  };

  const submit = async () => {
    const payload = {
      id: allocateSourceId(form, editingId, props.sources),
      name: form.name.trim(),
      repoUrl: form.repoUrl.trim()
    };
    const validationError = validateSourceInput(payload, props.locale);
    setInlineError(validationError);
    if (validationError) return;

    const checked = await probe(payload);
    if (!checked) {
      return;
    }
    if (!checked.reachable) {
      setInlineError(checked.reason ?? text.sourceUnreachable);
      return;
    }

    const result = await run(async () => {
      await upsertSource({
        id: payload.id,
        name: payload.name,
        repoUrl: payload.repoUrl,
        repoBranch: normalizeOptionalBranch(form.repoBranch),
        skillsPath: normalizeOptionalSkillsPath(form.skillsPath),
        curated: false,
        enabled: form.enabled
      });
      await props.onChanged();
      return true;
    });

    if (result) {
      setReachabilityBySource((prev) => ({
        ...prev,
        [payload.id]: checked
      }));
      setSuccessMessage(text.successSaved(payload.name, Boolean(editingId)));
      clearForm();
    }
  };

  const editSource = (source: RepoSource) => {
    setEditingId(source.id);
    setForm({
      id: source.id,
      name: source.name,
      repoUrl: source.repoUrl,
      repoBranch: source.repoBranch ?? "",
      skillsPath: source.skillsPath ?? "",
      enabled: source.enabled
    });
    setInlineError(null);
    setReachability(reachabilityBySource[source.id] ?? null);
  };

  const toggleSourceEnabled = async (source: RepoSource) => {
    const result = await run(async () => {
      await upsertSource({
        ...source,
        enabled: !source.enabled
      });
      await props.onChanged();
      return true;
    });

    if (result) {
      setSuccessMessage(text.successToggled(source.name, source.enabled));
    }
  };

  const remove = async (source: RepoSource) => {
    if (!window.confirm(text.confirmDelete(source.name))) {
      return;
    }

    const result = await run(async () => {
      await deleteSource(source.id);
      await props.onChanged();
      return true;
    });

    if (result) {
      setSuccessMessage(text.successDeleted(source.name));
    }
  };

  return (
    <section className="panel source-manager">
      <div className="panel-header source-heading">
        <div>
          <h3>{text.title}</h3>
          <p className="panel-subtitle">{text.subtitle}</p>
        </div>
        <span className="source-count">{text.customSourceCount} {customSources.length}</span>
      </div>

      <div className="source-layout">
        <section className="source-editor">
          <h4>{editingId ? text.editSource : text.addSource}</h4>
          <div className="source-fields">
            <label className="field">
              <span>{text.displayName}</span>
              <input
                placeholder="e.g. Team Registry"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>{text.repoUrl}</span>
              <input
                placeholder="https://github.com/org/repo"
                value={form.repoUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, repoUrl: e.target.value }))}
              />
            </label>
            <p className="muted-copy">{text.repoIdHint}</p>
            <label className="field">
              <span>{text.branchOptional}</span>
              <input
                placeholder="main"
                value={form.repoBranch}
                onChange={(e) => setForm((prev) => ({ ...prev, repoBranch: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>{text.skillsPathOptional}</span>
              <input
                placeholder="skills"
                value={form.skillsPath}
                onChange={(e) => setForm((prev) => ({ ...prev, skillsPath: e.target.value }))}
              />
            </label>
            <p className="muted-copy">{text.skillsPathHint}</p>
          </div>

          <div className="source-actions">
            <button className="btn btn-primary" onClick={submit}>
              {editingId ? text.updateSource : text.saveSource}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const payload = {
                  id: allocateSourceId(form, editingId, props.sources),
                  name: form.name.trim(),
                  repoUrl: form.repoUrl.trim()
                };
                void probe(payload);
              }}
            >
              {text.probeSource}
            </button>
            {editingId ? (
              <button className="btn btn-ghost" onClick={clearForm}>
                {text.cancelEdit}
              </button>
            ) : null}
          </div>

          {inlineError && <p className="inline-error state-line">{inlineError}</p>}
          {reachability ? (
            <p className={reachability.reachable ? "state-line" : "inline-error state-line"}>
              {text.reachability}: {reachability.reachable ? text.reachable : `${text.unreachable} (${reachability.reason ?? text.noDetail})`}
            </p>
          ) : null}
          <StatusBanner error={error} loading={loading} successMessage={successMessage} locale={props.locale} />
        </section>

        <section className="source-list-panel">
          <div className="source-list-head">
            <h4>{text.customSourceList}</h4>
          </div>
          <ul className="plain-list source-list">
            {customSources.map((source) => {
              const reachability = reachabilityBySource[source.id];
              const reachabilityLabel = reachability
                ? (reachability.reachable ? text.reachable : text.unreachable)
                : text.untested;
              const reachabilityClass = reachability
                ? (reachability.reachable ? "source-status source-reach-ok" : "source-status source-reach-bad")
                : "source-status source-reach-unknown";
              const repoIntro = buildRepoIntro(source, props.locale, text);

              return (
                <li key={source.id} className="source-item">
                  <div className="source-item-main">
                    <p className="source-title">
                      <strong className="source-name">{source.name}</strong>
                      <span className="source-id-tag">{source.id}</span>
                      <span className={source.enabled ? "source-status source-on" : "source-status source-off"}>
                        {source.enabled ? text.statusEnabled : text.statusDisabled}
                      </span>
                      <span className={reachabilityClass}>
                        {text.reachability}: {reachabilityLabel}
                      </span>
                    </p>
                    <p className="source-url">{source.repoUrl}</p>
                    <div className="source-facts">
                      <p className="source-fact">
                        <span>{text.branch}</span>
                        <strong>{source.repoBranch ?? text.auto}</strong>
                      </p>
                      <p className="source-fact">
                        <span>{text.subDir}</span>
                        <strong>{source.skillsPath ?? text.rootDir}</strong>
                      </p>
                      <p className="source-fact source-fact-wide">
                        <span>{text.repoIntro}</span>
                        <strong>{repoIntro}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="source-item-actions">
                    <button className="btn btn-secondary" onClick={() => editSource(source)}>{text.edit}</button>
                    <button className="btn btn-ghost" onClick={() => void toggleSourceEnabled(source)}>
                      {source.enabled ? text.disable : text.enable}
                    </button>
                    <button className="btn btn-danger" onClick={() => void remove(source)}>{text.remove}</button>
                  </div>
                </li>
              );
            })}
            {customSources.length === 0 ? <li className="muted-copy">{text.noCustomSource}</li> : null}
          </ul>
        </section>
      </div>
    </section>
  );
}
