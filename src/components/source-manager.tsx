import { useEffect, useMemo, useRef, useState } from "react";
import { checkSourceReachability, deleteSource, upsertSource } from "../lib/desktop-api";
import { useGuardedAction } from "../hooks/use-guarded-action";
import type { RepoSource, SourceReachability } from "../types/models";
import { StatusBanner } from "./status-banner";

type Locale = "zh" | "en";
type ReadmeState = {
  status: "loading" | "loaded" | "missing";
  content?: string;
};

type SourceInterpretation = {
  summary: string;
  highlights: string[];
  keywords: string[];
  suggestions: string[];
};

const EN_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "when", "from", "into", "then", "than",
  "have", "has", "will", "your", "you", "are", "was", "were", "can", "could", "should",
  "use", "using", "used", "user", "users", "their", "them", "they", "its", "our", "not",
  "any", "all", "also", "just", "more", "less", "only", "does", "done", "via", "per",
  "repo", "readme", "skill", "skills"
]);

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
    readmeLoading: "加载中...",
    readmeEmpty: "暂无摘要",
    readMore: "更多",
    close: "关闭",
    fullIntroTitle: "完整介绍",
    oneClickInterpret: "一键解读",
    refreshInterpret: "重新解读",
    interpretTitle: "仓库源解读",
    interpretHint: "点击“一键解读”生成摘要、关键词和使用建议。",
    interpretSummary: "摘要",
    interpretHighlights: "关键信息",
    interpretKeywords: "关键词",
    interpretSuggestions: "使用建议",
    fullIntroEmpty: "暂无完整介绍。",
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
    readmeLoading: "Loading...",
    readmeEmpty: "No summary available",
    readMore: "More",
    close: "Close",
    fullIntroTitle: "Full Intro",
    oneClickInterpret: "One-click Explain",
    refreshInterpret: "Re-run Explain",
    interpretTitle: "Source Interpretation",
    interpretHint: "Click to generate summary, keywords, and usage suggestions.",
    interpretSummary: "Summary",
    interpretHighlights: "Highlights",
    interpretKeywords: "Keywords",
    interpretSuggestions: "Usage Tips",
    fullIntroEmpty: "No full introduction available.",
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

function parseGithubRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(repoUrl);
    if (parsed.hostname !== "github.com") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    return {
      owner: segments[0],
      repo: segments[1].replace(/\.git$/i, "")
    };
  } catch {
    return null;
  }
}

function uniqueValues(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildReadmeCandidates(source: RepoSource): string[] {
  const repo = parseGithubRepo(source.repoUrl);
  if (!repo) return [];
  const branches = uniqueValues([source.repoBranch, "main", "master"]);
  const files = ["README.md", "Readme.md", "readme.md", "README.MD"];
  return branches.flatMap((branch) =>
    files.map((filename) =>
      `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${encodeURIComponent(branch)}/${filename}`
    )
  );
}

async function fetchSourceReadme(source: RepoSource, signal: AbortSignal): Promise<string | null> {
  const candidates = buildReadmeCandidates(source);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        method: "GET",
        signal,
        headers: { Accept: "text/plain" }
      });
      if (!response.ok) continue;
      const content = (await response.text()).trim();
      if (!content) continue;
      return content.slice(0, 5000);
    } catch {
      if (signal.aborted) return null;
    }
  }
  return null;
}

function toPreviewText(raw: string): string {
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, 320).trimEnd();
}

function toReadableReadme(raw: string): string {
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*\d+\.\s+/gm, "- ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, 4200).trimEnd();
}

function shorten(input: string, maxLen: number): string {
  const text = input.trim().replace(/\s+/g, " ");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}...`;
}

function firstSentence(input: string): string {
  const text = input.trim().replace(/\s+/g, " ");
  const [sentence] = text.split(/[.!?。；;]+/);
  return sentence?.trim() ?? "";
}

function extractSourceKeywords(source: RepoSource, sourceText: string): string[] {
  const merged = `${source.name} ${source.id} ${source.repoUrl} ${sourceText}`.toLowerCase();
  const tokens = merged.split(/[^a-z0-9\u4e00-\u9fa5-]+/i).filter(Boolean);
  const picked: string[] = [];
  for (const token of tokens) {
    if (picked.length >= 8) break;
    if (/^\d+$/.test(token)) continue;
    if (/^[a-z]/.test(token) && (token.length < 3 || EN_STOPWORDS.has(token))) continue;
    if (!picked.includes(token)) {
      picked.push(token);
    }
  }
  return picked;
}

function buildSourceInterpretation(
  source: RepoSource,
  fullIntro: string,
  locale: Locale
): SourceInterpretation {
  const primary = firstSentence(fullIntro);
  const keywords = extractSourceKeywords(source, fullIntro);
  const branch = source.repoBranch?.trim() || (locale === "zh" ? "自动" : "Auto");
  const path = source.skillsPath?.trim() || (locale === "zh" ? "仓库根目录" : "Repository root");

  if (locale === "zh") {
    return {
      summary: fullIntro
        ? shorten(fullIntro, 180)
        : "该仓库源暂无介绍内容，建议先验证可达性后再启用。",
      highlights: [
        primary ? `能力焦点：${shorten(primary, 80)}` : `能力焦点：面向 ${source.name} 的技能同步与管理。`,
        `仓库地址：${source.repoUrl}`,
        `同步参数：分支 ${branch} / 子目录 ${path}`
      ],
      keywords: keywords.length > 0 ? keywords.slice(0, 6) : [source.name, source.id],
      suggestions: [
        "先看完整介绍，再决定是否启用该源。",
        "首次接入建议先在测试环境做一次市场同步。",
        "若 README 较长，可优先按关键词过滤目标技能。"
      ]
    };
  }

  return {
    summary: fullIntro
      ? shorten(fullIntro, 210)
      : "No source introduction is available. Check reachability before enabling.",
    highlights: [
      primary ? `Core focus: ${shorten(primary, 96)}` : `Core focus: synchronize and manage skills from ${source.name}.`,
      `Repository URL: ${source.repoUrl}`,
      `Sync params: branch ${branch} / path ${path}`
    ],
    keywords: keywords.length > 0 ? keywords.slice(0, 6) : [source.name, source.id],
    suggestions: [
      "Read the full intro first, then decide whether to enable this source.",
      "For first-time onboarding, sync in a staging environment before production.",
      "If README is long, search by keywords to narrow target skills."
    ]
  };
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
  const [readmeBySource, setReadmeBySource] = useState<Record<string, ReadmeState>>({});
  const readmeBySourceRef = useRef<Record<string, ReadmeState>>({});
  const [detailSourceId, setDetailSourceId] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<SourceInterpretation | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const { run, error, loading } = useGuardedAction();

  const customSources = useMemo(
    () => props.sources.filter((source) => !source.curated),
    [props.sources]
  );
  const detailSource = useMemo(
    () => customSources.find((source) => source.id === detailSourceId) ?? null,
    [customSources, detailSourceId]
  );
  const detailRepoIntro = detailSource ? String(detailSource.description ?? "").trim() : "";
  const detailReadmeState = detailSource ? readmeBySource[detailSource.id] : undefined;
  const detailReadableReadme = detailReadmeState?.status === "loaded" && detailReadmeState.content
    ? toReadableReadme(detailReadmeState.content)
    : "";
  const detailFullIntro = useMemo(() => {
    if (!detailSource) return "";
    if (detailReadableReadme) {
      return [detailRepoIntro, detailReadableReadme].filter(Boolean).join("\n\n");
    }
    if (detailReadmeState?.status === "loading") {
      return detailRepoIntro ? `${detailRepoIntro}\n\n${text.readmeLoading}` : text.readmeLoading;
    }
    if (detailRepoIntro) return detailRepoIntro;
    return text.fullIntroEmpty;
  }, [detailReadableReadme, detailReadmeState?.status, detailRepoIntro, detailSource, text.fullIntroEmpty, text.readmeLoading]);

  useEffect(() => {
    readmeBySourceRef.current = readmeBySource;
  }, [readmeBySource]);

  useEffect(() => {
    setInterpretation(null);
  }, [detailSourceId, props.locale]);

  useEffect(() => {
    const candidates = customSources.filter((source) => !readmeBySourceRef.current[source.id]);
    if (candidates.length === 0) return;

    const controllers: AbortController[] = [];
    let disposed = false;

    for (const source of candidates) {
      const controller = new AbortController();
      controllers.push(controller);

      setReadmeBySource((prev) => {
        if (prev[source.id]) return prev;
        return {
          ...prev,
          [source.id]: { status: "loading" }
        };
      });

      void fetchSourceReadme(source, controller.signal).then((content) => {
        if (disposed || controller.signal.aborted) return;
        setReadmeBySource((prev) => ({
          ...prev,
          [source.id]: content
            ? { status: "loaded", content }
            : { status: "missing" }
        }));
      });
    }

    return () => {
      disposed = true;
      for (const controller of controllers) {
        controller.abort();
      }
    };
  }, [customSources]);

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

  const openSourceDetail = (sourceId: string) => {
    setDetailSourceId(sourceId);
    setInterpretation(null);
  };

  const closeSourceDetail = () => {
    setDetailSourceId(null);
    setInterpretation(null);
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
              const repoIntro = String(source.description ?? "").trim();
              const readmeState = readmeBySource[source.id];
              const readmePreview = readmeState?.status === "loaded" && readmeState.content
                ? toPreviewText(readmeState.content)
                : "";

              return (
                <li key={source.id} className="source-item">
                  <div className="source-item-main">
                    <p className="source-title">
                      <strong className="source-name">{source.name}</strong>
                      <span className="source-id-tag">{source.id}</span>
                      <span className={source.enabled ? "source-status source-on" : "source-status source-off"}>
                        {source.enabled ? text.statusEnabled : text.statusDisabled}
                      </span>
                    </p>
                    {repoIntro ? <p className="source-intro"><span>{text.repoIntro}</span>{repoIntro}</p> : null}
                    <section className="source-readme" aria-label="Repository summary">
                      {readmeState?.status === "loading" ? (
                        <p className="source-readme-empty">{text.readmeLoading}</p>
                      ) : readmePreview ? (
                        <p className="source-readme-content">{readmePreview}</p>
                      ) : (
                        <p className="source-readme-empty">{text.readmeEmpty}</p>
                      )}
                      <div className="source-readme-footer">
                        <button
                          className="btn btn-ghost source-readme-more"
                          onClick={() => openSourceDetail(source.id)}
                        >
                          {text.readMore}
                        </button>
                      </div>
                    </section>
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

      {detailSource ? (
        <div className="skill-detail-mask source-detail-mask" onClick={closeSourceDetail}>
          <aside className="skill-detail-panel source-detail-panel" onClick={(event) => event.stopPropagation()}>
            <header className="source-detail-header">
              <div>
                <h3>{detailSource.name}</h3>
                <p className="source-detail-path">{detailSource.id}</p>
              </div>
              <button className="btn btn-ghost" onClick={closeSourceDetail}>
                {text.close}
              </button>
            </header>

            <div className="source-detail-kpis">
              <span className="skill-detail-pill">URL: {detailSource.repoUrl}</span>
              <span className="skill-detail-pill">
                {text.branch}: {detailSource.repoBranch?.trim() || text.auto}
              </span>
              <span className="skill-detail-pill">
                {text.subDir}: {detailSource.skillsPath?.trim() || text.rootDir}
              </span>
            </div>

            <section className="source-detail-intro">
              <div className="source-detail-intro-header">
                <h4>{text.fullIntroTitle}</h4>
              </div>
              <pre className="source-detail-intro-content">{detailFullIntro}</pre>
            </section>

            <section className="interpret-panel">
              <div className="interpret-header">
                <h4>{text.interpretTitle}</h4>
                <button
                  className="btn btn-secondary"
                  onClick={() => setInterpretation(buildSourceInterpretation(detailSource, detailFullIntro, props.locale))}
                >
                  {interpretation ? text.refreshInterpret : text.oneClickInterpret}
                </button>
              </div>
              {interpretation ? (
                <div className="interpret-content">
                  <article className="interpret-card interpret-card-wide">
                    <h5>{text.interpretSummary}</h5>
                    <p>{interpretation.summary}</p>
                  </article>
                  <article className="interpret-card">
                    <h5>{text.interpretHighlights}</h5>
                    <ul className="interpret-list">
                      {interpretation.highlights.map((item) => (
                        <li key={`source-highlight:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="interpret-card">
                    <h5>{text.interpretKeywords}</h5>
                    <ul className="interpret-list">
                      {interpretation.keywords.map((item) => (
                        <li key={`source-keyword:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="interpret-card interpret-card-wide">
                    <h5>{text.interpretSuggestions}</h5>
                    <ul className="interpret-list">
                      {interpretation.suggestions.map((item) => (
                        <li key={`source-suggestion:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              ) : (
                <p className="panel-subtitle">{text.interpretHint}</p>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
