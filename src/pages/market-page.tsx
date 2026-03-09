import { useEffect, useMemo, useState } from "react";
import { fetchMarketSkills, fetchSources, installMarketSkill, syncMarketIndex } from "../lib/desktop-api";
import type { MarketSkill, RepoSource, SourceHealth } from "../types/models";
import type { Locale } from "../types/locale";
import { SourceManager } from "../components/source-manager";
import { useGuardedAction } from "../hooks/use-guarded-action";
import { StatusBanner } from "../components/status-banner";

interface SkillInterpretation {
  summary: string;
  scenarios: string[];
  triggers: string[];
  suggestions: string[];
}

const EN_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "when", "from", "into", "then", "than",
  "have", "has", "will", "your", "you", "are", "was", "were", "can", "could", "should",
  "use", "using", "used", "user", "users", "their", "them", "they", "its", "our", "not",
  "any", "all", "also", "just", "more", "less", "only", "does", "done", "via", "per"
]);

function shorten(input: string, maxLen: number): string {
  const text = input.trim().replace(/\s+/g, " ");
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen).trimEnd()}...`;
}

function firstSentence(input: string): string {
  const text = input.trim().replace(/\s+/g, " ");
  const [sentence] = text.split(/[.!?。；;]+/);
  return sentence?.trim() ?? "";
}

function extractTriggerKeywords(skill: MarketSkill): string[] {
  const merged = `${skill.name} ${skill.skillId} ${skill.publisher} ${skill.description ?? ""}`.toLowerCase();
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

function getAvailableVersions(skill: MarketSkill): string[] {
  const versions = [skill.stableVersion, skill.betaVersion].filter((item): item is string => Boolean(item));
  return Array.from(new Set(versions));
}

function getPreferredVersion(skill: MarketSkill): string {
  const versions = getAvailableVersions(skill);
  return versions[0] ?? "-";
}

function buildSkillInterpretation(skill: MarketSkill, locale: Locale): SkillInterpretation {
  const description = (skill.description ?? "").trim();
  const focus = firstSentence(description);
  const triggers = extractTriggerKeywords(skill);
  if (locale === "zh") {
    return {
      summary: description
        ? shorten(description, 150)
        : "该技能暂无描述，建议先看发布者、来源和版本后再安装。",
      scenarios: [
        focus ? `能力焦点：${shorten(focus, 70)}` : `能力焦点：围绕 ${skill.name} 相关任务提供能力支持。`,
        `适用来源：${skill.sourceId}`,
        `适合在涉及 ${skill.publisher} 生态或相关工具链时优先尝试。`
      ],
      triggers: triggers.length > 0 ? triggers.slice(0, 6) : [skill.name, skill.skillId, skill.publisher],
      suggestions: [
        "先用详情确认边界，再决定是否安装。",
        `优先安装推荐版本（${getPreferredVersion(skill)}），有需要再尝试其它版本。`,
        "可把关键词加入提示词，提升路由命中率。"
      ]
    };
  }

  return {
    summary: description
      ? shorten(description, 180)
      : "No description is provided. Check publisher, source, and versions before installing.",
    scenarios: [
      focus ? `Core focus: ${shorten(focus, 88)}` : `Core focus: tasks related to ${skill.name}.`,
      `Best source context: ${skill.sourceId}`,
      `Prefer this skill when your workflow is close to ${skill.publisher}.`
    ],
    triggers: triggers.length > 0 ? triggers.slice(0, 6) : [skill.name, skill.skillId, skill.publisher],
    suggestions: [
      "Open details first to confirm capability boundaries.",
      `Start with the recommended version (${getPreferredVersion(skill)}) and try alternatives only when needed.`,
      "Include trigger keywords in prompts to improve routing hit rate."
    ]
  };
}

const MARKET_TEXT = {
  zh: {
    pageTitle: "技能市场",
    pageSubtitle: "统一技能市场视图，按来源与推荐版本进行安装。",
    languageLabel: "语言",
    enabledSources: "已启用仓库源",
    effectiveSources: "生效筛选源",
    visibleSkills: "可见技能",
    browseTab: "技能浏览",
    sourceTab: "源管理",
    skillList: "技能列表",
    lastSync: "上次同步",
    notSynced: "尚未同步",
    syncMarket: "同步市场索引",
    syncedSummary: (sourceCount: number, skillCount: number) => `已同步 ${sourceCount} 个源 / ${skillCount} 个技能`,
    syncedFailed: (value: string) => `同步完成，但存在失败源: ${value}`,
    installSubmitted: (name: string, version: string) => `安装任务已提交: ${name} @ ${version}`,
    installFinished: (name: string, version: string) => `安装完成: ${name} @ ${version}`,
    search: "搜索",
    searchPlaceholder: "名称 / 发布者 / 来源",
    sortField: "排序字段",
    sortDirection: "排序方向",
    sortByName: "名称",
    sortByPublisher: "发布者",
    sortByVersion: "推荐版本",
    sortBySource: "来源",
    sourceFilter: "来源",
    allEffectiveSources: "全部生效源",
    asc: "升序",
    desc: "降序",
    defaultDescCard: "暂无描述，点击“详情”了解更多技能信息。",
    view: "详情",
    install: "安装",
    noMatch: "没有匹配结果。请调整搜索词、排序或筛选源。",
    close: "关闭",
    detailFallback: "该技能暂未提供详细说明。",
    publisher: "发布者",
    recommendedVersion: "推荐版本",
    availableVersions: "可用版本",
    source: "来源",
    sourceHealth: "源状态",
    installSkill: "安装此技能",
    oneClickInterpret: "一键解读",
    refreshInterpret: "重新解读",
    interpretTitle: "技能解读",
    interpretHint: "点击“一键解读”生成用途、触发词和安装建议。",
    interpretSummary: "摘要",
    interpretScenarios: "适用场景",
    interpretTriggers: "触发关键词",
    interpretSuggestions: "使用建议",
    health: {
      healthy: "健康",
      degraded: "降级",
      unreachable: "不可达",
      unknown: "未知"
    }
  },
  en: {
    pageTitle: "Skill Market",
    pageSubtitle: "Unified skill market view with source and recommended-version based install.",
    languageLabel: "Language",
    enabledSources: "Enabled Sources",
    effectiveSources: "Active Filter Sources",
    visibleSkills: "Visible Skills",
    browseTab: "Browse Skills",
    sourceTab: "Source Manager",
    skillList: "Skill List",
    lastSync: "Last synced",
    notSynced: "Not synced yet",
    syncMarket: "Sync Market Index",
    syncedSummary: (sourceCount: number, skillCount: number) => `Synced ${sourceCount} sources / ${skillCount} skills`,
    syncedFailed: (value: string) => `Sync completed with failed sources: ${value}`,
    installSubmitted: (name: string, version: string) => `Install task submitted: ${name} @ ${version}`,
    installFinished: (name: string, version: string) => `Installed: ${name} @ ${version}`,
    search: "Search",
    searchPlaceholder: "Name / Publisher / Source",
    sortField: "Sort By",
    sortDirection: "Order",
    sortByName: "Name",
    sortByPublisher: "Publisher",
    sortByVersion: "Recommended Version",
    sortBySource: "Source",
    sourceFilter: "Source",
    allEffectiveSources: "All Active Sources",
    asc: "Ascending",
    desc: "Descending",
    defaultDescCard: "No description yet. Click Details for full information.",
    view: "Details",
    install: "Install",
    noMatch: "No matching results. Try adjusting search, sort, or source filter.",
    close: "Close",
    detailFallback: "No detailed description is provided for this skill.",
    publisher: "Publisher",
    recommendedVersion: "Recommended Version",
    availableVersions: "Available Versions",
    source: "Source",
    sourceHealth: "Source Health",
    installSkill: "Install Skill",
    oneClickInterpret: "One-click Explain",
    refreshInterpret: "Re-run Explain",
    interpretTitle: "Skill Interpretation",
    interpretHint: "Click to generate usage, trigger keywords, and install guidance.",
    interpretSummary: "Summary",
    interpretScenarios: "Use Cases",
    interpretTriggers: "Trigger Keywords",
    interpretSuggestions: "Usage Tips",
    health: {
      healthy: "Healthy",
      degraded: "Degraded",
      unreachable: "Unreachable",
      unknown: "Unknown"
    }
  }
} as const;

export function MarketPage(props: { locale: Locale }) {
  const { locale } = props;
  const [view, setView] = useState<"catalog" | "sources">("catalog");
  const [sources, setSources] = useState<RepoSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [skills, setSkills] = useState<MarketSkill[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "publisher" | "version" | "source">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [health, setHealth] = useState<Record<string, SourceHealth>>({});
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [selectedSkill, setSelectedSkill] = useState<MarketSkill | null>(null);
  const [interpretation, setInterpretation] = useState<SkillInterpretation | null>(null);
  const { run, error, loading } = useGuardedAction();
  const text = MARKET_TEXT[locale];
  const localeTag = locale === "zh" ? "zh-CN" : "en-US";

  const sourceOptions = useMemo(() => sources.filter((item) => item.enabled), [sources]);
  const effectiveSourceIds = useMemo(() => {
    if (selectedSourceId) {
      return [selectedSourceId];
    }
    return sourceOptions.map((item) => item.id);
  }, [selectedSourceId, sourceOptions]);

  const formatSourceHealth = (sourceHealth: SourceHealth | undefined): string => {
    switch (sourceHealth) {
      case "healthy":
        return text.health.healthy;
      case "degraded":
        return text.health.degraded;
      case "unreachable":
        return text.health.unreachable;
      default:
        return text.health.unknown;
    }
  };

  const loadSources = async () => {
    const data = await run(() => fetchSources());
    if (data) {
      setSources(data);
    }
  };

  const refreshSkills = async () => {
    const data = await run(() => fetchMarketSkills(effectiveSourceIds));
    if (data) {
      setSkills(data.skills);
      setHealth(data.sourceHealth);
      setLastSyncAt(new Date().toISOString());
    }
  };

  const doSync = async () => {
    const summary = await run(() => syncMarketIndex(effectiveSourceIds));
    if (summary) {
      setSyncMessage(text.syncedSummary(summary.indexedSources, summary.indexedSkills));
      if (summary.failedSources.length > 0) {
        setSyncMessage(
          text.syncedFailed(
            summary.failedSources
              .map((item) => `${item.sourceId}(${item.reason})`)
              .join(", ")
          )
        );
      }
      await refreshSkills();
    }
  };

  const doInstall = async (skill: MarketSkill) => {
    const channel = skill.stableVersion ? "stable" : "beta";
    const result = await run(() =>
      installMarketSkill({
        skillId: skill.skillId,
        sourceId: skill.sourceId,
        channel
      })
    );
    if (result) {
      setSyncMessage(
        result.status === "installed"
          ? text.installFinished(skill.name, result.installedVersion)
          : text.installSubmitted(skill.name, result.installedVersion)
      );
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    void refreshSkills();
  }, [effectiveSourceIds]);

  useEffect(() => {
    setInterpretation(null);
  }, [selectedSkill?.skillId, selectedSkill?.sourceId]);

  useEffect(() => {
    if (!selectedSkill) return;
    setInterpretation((prev) => (prev ? buildSkillInterpretation(selectedSkill, locale) : prev));
  }, [locale, selectedSkill?.skillId, selectedSkill?.sourceId]);

  const formattedSyncTime = useMemo(
    () =>
      lastSyncAt
        ? new Intl.DateTimeFormat(localeTag, {
            dateStyle: "medium",
            timeStyle: "short"
          }).format(new Date(lastSyncAt))
        : "",
    [lastSyncAt, localeTag]
  );

  const sourceNameById = useMemo(
    () =>
      new Map(
        sources.map((source) => [source.id, source.name])
      ),
    [sources]
  );

  const visibleSkills = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const filtered = skills.filter((skill) => {
      if (!query) return true;
      const sourceName = sourceNameById.get(skill.sourceId) ?? "";
      return [
        skill.name,
        skill.publisher,
        skill.sourceId,
        sourceName,
        skill.stableVersion ?? "",
        skill.betaVersion ?? ""
      ].some((value) => value.toLowerCase().includes(query));
    });

    const readComparable = (skill: MarketSkill): string => {
      switch (sortBy) {
        case "publisher":
          return skill.publisher;
        case "version":
          return getPreferredVersion(skill);
        case "source":
          return skill.sourceId;
        case "name":
        default:
          return skill.name;
      }
    };

    return [...filtered].sort((left, right) => {
      const compared = readComparable(left).localeCompare(readComparable(right), localeTag, {
        numeric: true,
        sensitivity: "base"
      });
      return sortDirection === "asc" ? compared : -compared;
    });
  }, [keyword, skills, sortBy, sortDirection, sourceNameById, localeTag]);
  const isSingleSkillResult = visibleSkills.length === 1;

  return (
    <section className="column-gap market-shell">
      <article className="panel market-intro">
        <div>
          <p className="market-intro-copy">{text.pageSubtitle}</p>
        </div>
        <div className="market-intro-right">
          <p className="market-intro-time">
            {lastSyncAt ? `${text.lastSync}: ${formattedSyncTime}` : text.notSynced}
          </p>
          <button className="btn btn-primary" onClick={() => void doSync()}>
            {text.syncMarket}
          </button>
        </div>
      </article>

      <div className="panel market-overview">
        <div className="metric-strip market-metric-strip">
          <div className="metric-card">
            <span className="metric-label">{text.enabledSources}</span>
            <strong className="metric-value">{sourceOptions.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">{text.effectiveSources}</span>
            <strong className="metric-value">{effectiveSourceIds.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">{text.visibleSkills}</span>
            <strong className="metric-value">{visibleSkills.length}</strong>
          </div>
        </div>

        <div className="secondary-tabs market-tabs" role="tablist" aria-label={text.pageTitle}>
          <button
            role="tab"
            aria-selected={view === "catalog"}
            className={view === "catalog" ? "btn btn-tab btn-tab-active" : "btn btn-tab"}
            onClick={() => setView("catalog")}
          >
            {text.browseTab}
          </button>
          <button
            role="tab"
            aria-selected={view === "sources"}
            className={view === "sources" ? "btn btn-tab btn-tab-active" : "btn btn-tab"}
            onClick={() => setView("sources")}
          >
            {text.sourceTab}
          </button>
        </div>
      </div>

      {view === "catalog" ? (
        <div className="panel market-panel">
          <div className="row-between market-panel-header">
            <div>
              <h3>{text.skillList}</h3>
              {lastSyncAt ? (
                <p className="panel-subtitle">{text.lastSync}: {formattedSyncTime}</p>
              ) : (
                <p className="panel-subtitle">{text.notSynced}</p>
              )}
            </div>
          </div>

          {syncMessage ? <p className="muted-copy market-sync-message">{syncMessage}</p> : null}
          <StatusBanner error={error} loading={loading} locale={locale} />
          <div className="table-toolbar market-toolbar">
            <label className="field field-compact field-search">
              <span>{text.search}</span>
              <input
                placeholder={text.searchPlaceholder}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <label className="field field-compact">
              <span>{text.sortField}</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "name" | "publisher" | "version" | "source")}>
                <option value="name">{text.sortByName}</option>
                <option value="publisher">{text.sortByPublisher}</option>
                <option value="version">{text.sortByVersion}</option>
                <option value="source">{text.sortBySource}</option>
              </select>
            </label>
            <label className="field field-compact">
              <span>{text.sourceFilter}</span>
              <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
                <option value="">{text.allEffectiveSources}</option>
                {sourceOptions.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} ({formatSourceHealth(health[source.id])})
                  </option>
                ))}
              </select>
            </label>
            <div className="field field-compact field-action">
              <span>{text.sortDirection}</span>
              <button
                className="btn btn-ghost"
                onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
              >
                {sortDirection === "asc" ? text.asc : text.desc}
              </button>
            </div>
          </div>

          <div
            className={
              isSingleSkillResult
                ? "skill-card-grid market-skill-grid market-skill-grid-single"
                : "skill-card-grid market-skill-grid"
            }
          >
            {visibleSkills.map((skill) => (
              <article
                key={`${skill.skillId}:${skill.sourceId}`}
                className={isSingleSkillResult ? "skill-card skill-card-single" : "skill-card"}
              >
                <div className="skill-card-main">
                  <h4>{skill.name}</h4>
                  <p className="skill-meta">
                    {skill.sourceId}/{skill.skillId}
                  </p>
                  <p className="skill-desc">{skill.description ?? text.defaultDescCard}</p>
                  <div className="skill-tags">
                    <span className="skill-tag">{text.publisher}: {skill.publisher}</span>
                    <span className="skill-tag">{text.recommendedVersion}: {getPreferredVersion(skill)}</span>
                  </div>
                </div>
                <div className="skill-card-actions">
                  <button className="btn btn-ghost" onClick={() => setSelectedSkill(skill)}>
                    {text.view}
                  </button>
                  <button className="btn btn-primary" onClick={() => void doInstall(skill)}>
                    {text.install}
                  </button>
                </div>
              </article>
            ))}
            {visibleSkills.length === 0 ? (
              <div className="table-empty">
                {text.noMatch}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <SourceManager
          locale={locale}
          sources={sources}
          onChanged={async () => {
            await loadSources();
            await refreshSkills();
          }}
        />
      )}

      {selectedSkill ? (
        <div className="skill-detail-mask" onClick={() => setSelectedSkill(null)}>
          <aside className="skill-detail-panel" onClick={(event) => event.stopPropagation()}>
            <header className="skill-detail-header">
              <div>
                <h3>{selectedSkill.name}</h3>
                <p className="skill-detail-path">{selectedSkill.sourceId}/{selectedSkill.skillId}</p>
              </div>
              <div className="skill-detail-header-actions">
                <button className="btn btn-primary" onClick={() => void doInstall(selectedSkill)}>
                  {text.installSkill}
                </button>
                <button className="btn btn-ghost" onClick={() => setSelectedSkill(null)}>
                  {text.close}
                </button>
              </div>
            </header>

            <div className="skill-detail-kpis">
              <span className="skill-detail-pill">{text.publisher}: {selectedSkill.publisher}</span>
              <span className="skill-detail-pill">{text.source}: {selectedSkill.sourceId}</span>
              <span className="skill-detail-pill">{text.recommendedVersion}: {getPreferredVersion(selectedSkill)}</span>
              <span className={`skill-detail-pill health health-${selectedSkill.sourceHealth}`}>
                {text.sourceHealth}: {formatSourceHealth(selectedSkill.sourceHealth)}
              </span>
            </div>

            <p className="skill-detail-lead">{selectedSkill.description ?? text.detailFallback}</p>

            <section className="interpret-panel">
              <div className="interpret-header">
                <h4>{text.interpretTitle}</h4>
                <button
                  className="btn btn-secondary"
                  onClick={() => setInterpretation(buildSkillInterpretation(selectedSkill, locale))}
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
                    <h5>{text.interpretScenarios}</h5>
                    <ul className="interpret-list">
                      {interpretation.scenarios.map((item) => (
                        <li key={`scenario:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="interpret-card">
                    <h5>{text.interpretTriggers}</h5>
                    <ul className="interpret-list">
                      {interpretation.triggers.map((item) => (
                        <li key={`trigger:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="interpret-card">
                    <h5>{text.interpretSuggestions}</h5>
                    <ul className="interpret-list">
                      {interpretation.suggestions.map((item) => (
                        <li key={`suggestion:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              ) : (
                <p className="panel-subtitle">{text.interpretHint}</p>
              )}
            </section>

            <div className="detail-grid">
              <article className="detail-item">
                <p>{text.publisher}</p>
                <strong>{selectedSkill.publisher}</strong>
              </article>
              <article className="detail-item">
                <p>{text.recommendedVersion}</p>
                <strong>{getPreferredVersion(selectedSkill)}</strong>
              </article>
              <article className="detail-item">
                <p>{text.availableVersions}</p>
                <strong>{getAvailableVersions(selectedSkill).join(" / ") || "-"}</strong>
              </article>
              <article className="detail-item">
                <p>{text.source}</p>
                <strong>{selectedSkill.sourceId}</strong>
              </article>
            </div>

          </aside>
        </div>
      ) : null}
    </section>
  );
}
