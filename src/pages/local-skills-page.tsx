import { useEffect, useMemo, useState } from "react";
import { fetchLocalSkills, installLocalSkillForProvider, removeLocalSkillRecord, scanLocalInstalledSkills } from "../lib/desktop-api";
import { useGuardedAction } from "../hooks/use-guarded-action";
import { StatusBanner } from "../components/status-banner";
import type { LocalInstalledSkill } from "../types/models";
import type { Locale } from "../types/locale";

type VisibleProvider = "Claude" | "Codex";
const PROVIDER_ORDER: VisibleProvider[] = ["Claude", "Codex"];

interface AggregatedLocalSkill {
  key: string;
  skillId: string;
  name: string;
  publisher?: string;
  description: string;
  sourceIds: string[];
  providers: Record<VisibleProvider, LocalInstalledSkill | null>;
  latestInstalledAt?: string;
}

const LOCAL_TEXT = {
  zh: {
    unknownTime: "未知时间",
    noDescription: "暂无描述",
    removeConfirm: (name: string) => `确认移除记录「${name}」吗？`,
    removeSuccess: (name: string, count: number) => `已移除记录: ${name}（${count} 条）`,
    scanSuccess: (scanned: number, added: number, total: number) => `扫描完成：发现 ${scanned} 条，本次新增 ${added} 条，当前共 ${total} 条`,
    pageTitle: "本地 Skill 管理",
    pageSubtitle: "技能列表按 Claude 和 Codex 并集展示；顶部数量按安装记录统计。",
    scopeTitle: "安装统计",
    actionTitle: "搜索与操作",
    searchLabel: "搜索",
    all: "全部",
    searchAria: "搜索本地 Skill",
    searchPlaceholder: "名称 / skillId / source",
    loadInstalled: "加载本机已安装 Skill",
    refresh: "刷新列表",
    collapse: "收起",
    details: "详情",
    detailTitle: "技能详情",
    close: "关闭",
    installProvider: (provider: VisibleProvider) => `安装到 ${provider}`,
    removeProvider: (provider: VisibleProvider) => `从 ${provider} 移除`,
    installProviderSuccess: (name: string, provider: VisibleProvider) => `已安装: ${name} -> ${provider}`,
    removeProviderSuccess: (name: string, provider: VisibleProvider) => `已移除: ${name} (${provider})`,
    noSeedForInstall: (provider: VisibleProvider) => `无法安装到 ${provider}：缺少可复制的已安装来源`,
    removeRecord: "移除记录",
    desc: "描述",
    publisher: "发布者",
    latestInstalledAt: "最近安装时间",
    claudePath: "Claude 安装目录",
    codexPath: "Codex 安装目录",
    claudeBranch: "Claude 安装分支",
    codexBranch: "Codex 安装分支",
    empty: "暂无匹配的本地技能记录。"
  },
  en: {
    unknownTime: "Unknown time",
    noDescription: "No description",
    removeConfirm: (name: string) => `Remove record \"${name}\"?`,
    removeSuccess: (name: string, count: number) => `Removed: ${name} (${count} records)`,
    scanSuccess: (scanned: number, added: number, total: number) => `Scan completed: detected ${scanned}, added ${added}, total ${total}`,
    pageTitle: "Local Skill Management",
    pageSubtitle: "Skill list is shown as union of Claude and Codex; top counts are installation records.",
    scopeTitle: "Installed Stats",
    actionTitle: "Search & Actions",
    searchLabel: "Search",
    all: "All",
    searchAria: "Search local skills",
    searchPlaceholder: "Name / skillId / source",
    loadInstalled: "Load Installed Skills",
    refresh: "Refresh",
    collapse: "Collapse",
    details: "Details",
    detailTitle: "Skill Details",
    close: "Close",
    installProvider: (provider: VisibleProvider) => `Install to ${provider}`,
    removeProvider: (provider: VisibleProvider) => `Remove from ${provider}`,
    installProviderSuccess: (name: string, provider: VisibleProvider) => `Installed: ${name} -> ${provider}`,
    removeProviderSuccess: (name: string, provider: VisibleProvider) => `Removed: ${name} (${provider})`,
    noSeedForInstall: (provider: VisibleProvider) => `Cannot install to ${provider}: no installed source to copy from`,
    removeRecord: "Remove Record",
    desc: "Description",
    publisher: "Publisher",
    latestInstalledAt: "Latest Installed Time",
    claudePath: "Claude Install Path",
    codexPath: "Codex Install Path",
    claudeBranch: "Claude Install Branch",
    codexBranch: "Codex Install Branch",
    empty: "No local skill records matched."
  }
} as const;

function formatInstalledAt(value: string | undefined, locale: Locale): string {
  const text = LOCAL_TEXT[locale];
  if (!value) return text.unknownTime;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text.unknownTime;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function normalizeDescription(value: string | undefined, locale: Locale): string {
  const text = LOCAL_TEXT[locale];
  const normalized = String(value ?? "").trim();
  if (!normalized) return text.noDescription;
  if (/^[>||`~_*#\-]+$/.test(normalized)) return text.noDescription;
  return normalized;
}

function summarizeDescription(input: string, maxLen = 120): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen).trimEnd()}...`;
}

function getInstalledAtEpoch(value?: string): number {
  if (!value) return 0;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : 0;
}

function pickLatest(left: LocalInstalledSkill | null, right: LocalInstalledSkill): LocalInstalledSkill {
  if (!left) return right;
  return getInstalledAtEpoch(right.installedAt) >= getInstalledAtEpoch(left.installedAt) ? right : left;
}

function toUnionKey(skill: LocalInstalledSkill): string {
  const normalizedSkillId = String(skill.skillId ?? "").trim().toLowerCase();
  if (normalizedSkillId) return normalizedSkillId;
  return String(skill.name ?? "").trim().toLowerCase() || `${skill.sourceId}:${skill.provider}`.toLowerCase();
}

function resolveVisibleProvider(skill: LocalInstalledSkill): VisibleProvider | null {
  const sourceId = String(skill.sourceId ?? "").toLowerCase();
  if (sourceId === "local-claude") return "Claude";
  if (sourceId === "local-codex") return "Codex";

  const trackedPath = `${String(skill.targetPath ?? "").toLowerCase()} ${String(skill.ssotPath ?? "").toLowerCase()}`;
  if (trackedPath.includes(".claude/skills") || trackedPath.includes(".claude\\skills")) return "Claude";
  if (trackedPath.includes(".codex/skills") || trackedPath.includes(".codex\\skills")) return "Codex";

  if (skill.provider === "Claude" || skill.provider === "Codex") return skill.provider;
  return null;
}

function oppositeProvider(provider: VisibleProvider): VisibleProvider {
  return provider === "Claude" ? "Codex" : "Claude";
}

function uniqueRecordTargets(records: LocalInstalledSkill[]): Array<{ sourceId: string; skillId: string }> {
  return Array.from(
    new Map(
      records.map((record) => [`${record.sourceId}:${record.skillId}`, { sourceId: record.sourceId, skillId: record.skillId }])
    ).values()
  );
}

export function LocalSkillsPage(props: { locale: Locale }) {
  const { locale } = props;
  const text = LOCAL_TEXT[locale];
  const localeTag = locale === "zh" ? "zh-CN" : "en-US";
  const [skills, setSkills] = useState<LocalInstalledSkill[]>([]);
  const [keyword, setKeyword] = useState("");
  const [providerFilter, setProviderFilter] = useState<"all" | VisibleProvider>("all");
  const [detailSkill, setDetailSkill] = useState<AggregatedLocalSkill | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const { run, error, loading } = useGuardedAction();

  const load = async () => {
    const payload = await run(() => fetchLocalSkills());
    if (!payload) return;
    setSkills(payload.skills);
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleProviderRecords = useMemo(() => {
    const list = skills
      .map((item) => {
        const provider = resolveVisibleProvider(item);
        if (!provider) return null;
        return { ...item, provider };
      })
      .filter((item): item is LocalInstalledSkill & { provider: VisibleProvider } => Boolean(item));
    return list;
  }, [skills]);

  const totalInstalledRecords = visibleProviderRecords.length;

  const providerRecordsByKey = useMemo(() => {
    const grouped = new Map<string, Record<VisibleProvider, LocalInstalledSkill[]>>();
    for (const record of visibleProviderRecords) {
      const key = toUnionKey(record);
      const current = grouped.get(key) ?? { Claude: [], Codex: [] };
      current[record.provider].push(record);
      grouped.set(key, current);
    }
    return grouped;
  }, [visibleProviderRecords]);

  const unionSkills = useMemo(() => {
    const map = new Map<string, {
      skillId: string;
      name: string;
      publisher?: string;
      description?: string;
      sourceIds: Set<string>;
      providers: Record<VisibleProvider, LocalInstalledSkill | null>;
    }>();

    for (const skill of visibleProviderRecords) {
      const key = toUnionKey(skill);
      const current = map.get(key) ?? {
        skillId: skill.skillId,
        name: skill.name,
        publisher: skill.publisher,
        description: skill.description,
        sourceIds: new Set<string>(),
        providers: {
          Claude: null,
          Codex: null
        }
      };

      current.providers[skill.provider] = pickLatest(current.providers[skill.provider], skill);
      current.sourceIds.add(skill.sourceId);

      if (!current.skillId && skill.skillId) current.skillId = skill.skillId;
      if (!current.publisher && skill.publisher) current.publisher = skill.publisher;
      if ((!current.description || !current.description.trim()) && skill.description?.trim()) current.description = skill.description;
      if (!current.name && skill.name) current.name = skill.name;

      map.set(key, current);
    }

    const merged: AggregatedLocalSkill[] = [];
    for (const [key, item] of map) {
      const latestInstalledAt = [item.providers.Claude, item.providers.Codex]
        .filter((value): value is LocalInstalledSkill => Boolean(value))
        .sort((left, right) => getInstalledAtEpoch(right.installedAt) - getInstalledAtEpoch(left.installedAt))[0]?.installedAt;

      merged.push({
        key,
        skillId: item.skillId || key,
        name: item.name,
        publisher: item.publisher,
        description: normalizeDescription(item.description, locale),
        sourceIds: Array.from(item.sourceIds).sort((left, right) => left.localeCompare(right)),
        providers: item.providers,
        latestInstalledAt
      });
    }

    return merged.sort((left, right) => left.name.localeCompare(right.name, localeTag, {
      numeric: true,
      sensitivity: "base"
    }));
  }, [visibleProviderRecords, locale, localeTag]);

  const providerInstalledCounts = useMemo(() => {
    return visibleProviderRecords.reduce(
      (acc, item) => {
        acc[item.provider] += 1;
        return acc;
      },
      { Claude: 0, Codex: 0 }
    );
  }, [visibleProviderRecords]);

  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return unionSkills.filter((item) => {
      if (providerFilter !== "all" && !item.providers[providerFilter]) return false;
      if (!query) return true;

      const merged = [
        item.name,
        item.skillId,
        item.sourceIds.join(" "),
        item.publisher ?? "",
        item.description,
        item.providers.Claude?.installName ?? "",
        item.providers.Codex?.installName ?? "",
        item.providers.Claude ? "claude" : "",
        item.providers.Codex ? "codex" : ""
      ]
        .join(" ")
        .toLowerCase();

      return merged.includes(query);
    });
  }, [keyword, providerFilter, unionSkills]);

  const removeRecord = async (item: AggregatedLocalSkill) => {
    if (!window.confirm(text.removeConfirm(item.name))) return;

    const records = providerRecordsByKey.get(item.key) ?? { Claude: [], Codex: [] };
    const uniqueTargets = uniqueRecordTargets([...records.Claude, ...records.Codex]);

    const result = await run(async () => {
      for (const target of uniqueTargets) {
        await removeLocalSkillRecord(target.sourceId, target.skillId);
      }
      await load();
      return true;
    });

    if (result) {
      setSuccessMessage(text.removeSuccess(item.name, uniqueTargets.length));
      if (detailSkill?.key === item.key) setDetailSkill(null);
    }
  };

  const toggleProvider = async (item: AggregatedLocalSkill, provider: VisibleProvider) => {
    const records = providerRecordsByKey.get(item.key) ?? { Claude: [], Codex: [] };
    const currentProviderRecords = records[provider];
    if (currentProviderRecords.length > 0) {
      const removeTargets = uniqueRecordTargets(currentProviderRecords);
      const removed = await run(async () => {
        for (const target of removeTargets) {
          await removeLocalSkillRecord(target.sourceId, target.skillId);
        }
        await load();
        return true;
      });
      if (removed) {
        setSuccessMessage(text.removeProviderSuccess(item.name, provider));
        if (detailSkill?.key === item.key) {
          setDetailSkill(null);
        }
      }
      return;
    }

    const seedCandidates = records[oppositeProvider(provider)];
    const seed = [...seedCandidates].sort((left, right) => getInstalledAtEpoch(right.installedAt) - getInstalledAtEpoch(left.installedAt))[0];
    if (!seed) {
      setSuccessMessage(text.noSeedForInstall(provider));
      return;
    }

    const installed = await run(async () => {
      await installLocalSkillForProvider({
        targetProvider: provider,
        seedSourceId: seed.sourceId,
        seedSkillId: seed.skillId,
        skillId: item.skillId,
        name: item.name,
        publisher: item.publisher,
        description: item.description,
        installName: seed.installName
      });
      await load();
      return true;
    });

    if (installed) {
      setSuccessMessage(text.installProviderSuccess(item.name, provider));
      if (detailSkill?.key === item.key) {
        setDetailSkill(null);
      }
    }
  };

  const loadInstalledFromDisk = async () => {
    const summary = await run(() => scanLocalInstalledSkills());
    if (!summary) return;
    await load();
    setSuccessMessage(text.scanSuccess(summary.scanned, summary.added, summary.total));
  };

  return (
    <section className="column-gap local-shell">
      <article className="panel local-intro">
        <div>
          <p className="local-intro-copy">{text.pageSubtitle}</p>
        </div>
        <div className="local-intro-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSuccessMessage("");
              void loadInstalledFromDisk();
            }}
          >
            {text.loadInstalled}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setSuccessMessage("");
              void load();
            }}
          >
            {text.refresh}
          </button>
        </div>
      </article>

      <div className="panel local-skills-panel">
        <div className="local-panel-summary">
          <span className="local-inline-label">{text.scopeTitle}</span>
          <div className="local-provider-strip">
            <button
              className={providerFilter === "all" ? "provider-pill provider-pill-active" : "provider-pill"}
              onClick={() => setProviderFilter("all")}
            >
              {text.all}: {totalInstalledRecords}
            </button>
            {PROVIDER_ORDER.map((provider) => (
              <button
                key={provider}
                className={providerFilter === provider ? `provider-pill provider-pill-active provider-${provider.toLowerCase()}` : `provider-pill provider-${provider.toLowerCase()}`}
                onClick={() => setProviderFilter(provider)}
              >
                {provider}: {providerInstalledCounts[provider]}
              </button>
            ))}
          </div>
        </div>

        <div className="local-toolbar-shell">
          <div className="local-action-inline">
            <span className="local-inline-label">{text.searchLabel}</span>
            <div className="local-toolbar">
              <input
                aria-label={text.searchAria}
                placeholder={text.searchPlaceholder}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="local-status-wrap">
          <StatusBanner error={error} loading={loading} successMessage={successMessage} locale={locale} />
        </div>

        <div className="local-skill-card-grid">
          {filtered.map((item) => {
            return (
              <article key={item.key} className="local-skill-card">
                <header className="local-card-name-block">
                  <h3 className="local-card-name">{item.name}</h3>
                </header>

                <p
                  className={item.description === text.noDescription ? "local-card-summary local-card-summary-empty" : "local-card-summary"}
                  title={item.description}
                >
                  {summarizeDescription(item.description)}
                </p>

                <div className="local-card-tags">
                  <button
                    className={item.providers.Claude ? "local-card-tag local-card-state local-card-provider-toggle local-card-tag-provider local-card-tag-provider-claude-on" : "local-card-tag local-card-state local-card-provider-toggle local-card-tag-provider local-card-tag-provider-off"}
                    onClick={() => void toggleProvider(item, "Claude")}
                    aria-label={item.providers.Claude ? text.removeProvider("Claude") : text.installProvider("Claude")}
                    title={item.providers.Claude ? text.removeProvider("Claude") : text.installProvider("Claude")}
                  >
                      Claude
                  </button>
                  <button
                    className={item.providers.Codex ? "local-card-tag local-card-state local-card-provider-toggle local-card-tag-provider local-card-tag-provider-codex-on" : "local-card-tag local-card-state local-card-provider-toggle local-card-tag-provider local-card-tag-provider-off"}
                    onClick={() => void toggleProvider(item, "Codex")}
                    aria-label={item.providers.Codex ? text.removeProvider("Codex") : text.installProvider("Codex")}
                    title={item.providers.Codex ? text.removeProvider("Codex") : text.installProvider("Codex")}
                  >
                      Codex
                  </button>
                  <button
                    className="local-card-tag local-card-action local-card-tag-action local-card-tag-icon-btn local-card-tag-detail"
                    onClick={() => setDetailSkill(item)}
                    aria-label={text.details}
                    title={text.details}
                  >
                    <svg className="local-card-tag-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 4.5c4.8 0 8.8 3.1 10.3 7.5C20.8 16.4 16.8 19.5 12 19.5S3.2 16.4 1.7 12C3.2 7.6 7.2 4.5 12 4.5Z" />
                      <circle cx="12" cy="12" r="2.8" />
                    </svg>
                  </button>
                  <button
                    className="local-card-tag local-card-action local-card-tag-action local-card-tag-icon-btn local-card-tag-remove"
                    onClick={() => void removeRecord(item)}
                    aria-label={text.removeRecord}
                    title={text.removeRecord}
                  >
                    <svg className="local-card-tag-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 7h15" />
                      <path d="M9.2 4.5h5.6" />
                      <path d="M7.5 7l.8 11.2a1 1 0 0 0 1 .8h5.4a1 1 0 0 0 1-.8L16.5 7" />
                      <path d="M10 10.3v5.8M14 10.3v5.8" />
                    </svg>
                  </button>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 ? <div className="table-empty">{text.empty}</div> : null}
        </div>
      </div>

      {detailSkill ? (
        <div className="local-detail-mask" onClick={() => setDetailSkill(null)}>
          <aside className="local-detail-panel" onClick={(event) => event.stopPropagation()}>
            <header className="local-detail-header">
              <div>
                <p className="local-detail-kicker">{text.detailTitle}</p>
                <h3>{detailSkill.name}</h3>
              </div>
              <button className="btn btn-ghost" onClick={() => setDetailSkill(null)}>
                {text.close}
              </button>
            </header>

            <p className="local-detail-summary">{detailSkill.description}</p>

            <div className="local-card-detail-grid">
              <p><span>{text.desc}</span><strong>{detailSkill.description}</strong></p>
              <p><span>{text.publisher}</span><strong>{detailSkill.publisher ?? "-"}</strong></p>
              <p><span>{text.latestInstalledAt}</span><strong>{formatInstalledAt(detailSkill.latestInstalledAt, locale)}</strong></p>
              <p><span>{text.claudePath}</span><strong>{detailSkill.providers.Claude?.targetPath ?? "-"}</strong></p>
              <p><span>{text.codexPath}</span><strong>{detailSkill.providers.Codex?.targetPath ?? "-"}</strong></p>
              <p><span>{text.claudeBranch}</span><strong>{detailSkill.providers.Claude?.installBranch ?? "-"}</strong></p>
              <p><span>{text.codexBranch}</span><strong>{detailSkill.providers.Codex?.installBranch ?? "-"}</strong></p>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
