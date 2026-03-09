import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { fetchGeneralSettings, updateGeneralSettings } from "../lib/desktop-api";
import { MarketPage } from "../pages/market-page";
import { LocalSkillsPage } from "../pages/local-skills-page";
import { SkillCampPage } from "../pages/skill-camp-page";
import { ReleaseCenterPage } from "../pages/release-center-page";
import { APP_LOCALE_STORAGE_KEY, resolveInitialLocale } from "../types/locale";
import type { Locale } from "../types/locale";
import appIcon from "../assets/app-icon.png";
import "./app.css";
import "./redesign.css";

type Page = "market" | "local" | "camp" | "release";
const PAGE_ORDER: Page[] = ["market", "local", "camp", "release"];

const APP_TEXT = {
  zh: {
    heroKicker: "SkillDock Workspace",
    heroTitle: "SkillDock",
    heroSubtitle: {
      market: "发现并安装技能，统一管理市场源与版本。",
      local: "聚合本机技能，按 Claude、Codex 与 Cursor 多端编排。",
      camp: "创作新技能、沉淀模板、规范产物交付。",
      release: "按发布流程预检并创建可审计的发布 PR。"
    },
    boardTitle: "看板",
    navAria: "主导航",
    tabs: {
      market: "市场",
      local: "本地 Skill 管理",
      camp: "技能创造营",
      release: "发布中心"
    },
    settings: "通用设置",
    settingsTitle: "应用设置",
    language: "应用语言",
    teamRepoHint: "发布中心后续会使用这里配置的仓库地址作为目标仓库。",
    teamRepoUrl: "团队仓库地址（GitHub）",
    settingsSave: "保存配置",
    settingsSaving: "保存中...",
    settingsSaved: "已保存，后续发布将使用该仓库地址。",
    settingsLoadFailed: "加载通用配置失败",
    settingsInvalidRepoUrl: "请输入有效的 GitHub HTTPS 仓库地址",
    close: "关闭"
  },
  en: {
    heroKicker: "SkillDock Workspace",
    heroTitle: "SkillDock",
    heroSubtitle: {
      market: "Discover and install skills with source and version control.",
      local: "Manage local skills across Claude, Codex, and Cursor in one place.",
      camp: "Create new skills, iterate templates, and standardize delivery.",
      release: "Run release checks and create auditable release PRs."
    },
    boardTitle: "Boards",
    navAria: "Main navigation",
    tabs: {
      market: "Market",
      local: "Local Skills",
      camp: "Skill Camp",
      release: "Release Center"
    },
    settings: "Settings",
    settingsTitle: "App Settings",
    language: "App Language",
    teamRepoHint: "Release flows will use this repository URL as the publishing target.",
    teamRepoUrl: "Team Repository URL (GitHub)",
    settingsSave: "Save",
    settingsSaving: "Saving...",
    settingsSaved: "Saved. Subsequent releases will use this repository URL.",
    settingsLoadFailed: "Failed to load general settings",
    settingsInvalidRepoUrl: "Enter a valid GitHub HTTPS repository URL",
    close: "Close"
  }
} as const;

function getErrorMessage(raw: unknown, fallback: string): string {
  if (raw && typeof raw === "object" && "message" in raw) {
    const message = String((raw as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  if (raw instanceof Error && raw.message.trim()) {
    return raw.message.trim();
  }
  return fallback;
}

function isValidGithubRepoUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") return false;
    return parsed.pathname.split("/").filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

function renderTabIcon(page: Page) {
  switch (page) {
    case "market":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 7.4h13l-1 8.4H4.5l-1-8.4Z" />
          <path d="M7 7.4V6a3 3 0 0 1 6 0v1.4" />
        </svg>
      );
    case "local":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M2.9 6.9h5l1.4 1.8h8.1v6.5a2 2 0 0 1-2 2H4.9a2 2 0 0 1-2-2V6.9Z" />
          <path d="M2.9 6.9a2 2 0 0 1 2-2h2.5l1.2 2h8.8" />
        </svg>
      );
    case "camp":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4.4 15.6l7.9-7.9" />
          <path d="M10.8 4.1l.8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.9-1.6.9.3-1.7L8.3 6l1.7-.3.8-1.6Z" />
          <path d="M13.6 12.3l.5 1 .9.2-.7.7.2 1-.9-.5-.9.5.2-1-.7-.7.9-.2.5-1Z" />
          <circle cx="4.2" cy="15.8" r="1.2" />
        </svg>
      );
    case "release":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M12.8 5.1c1.8.4 3.2 1.8 3.6 3.6L12 13.1 6.9 8l4.4-4.4c.4.4 1 .9 1.5 1.5Z" />
          <circle cx="11.8" cy="8.3" r="1.2" />
          <path d="M8 12 5.1 14.9" />
          <path d="M6.5 9.9 4.2 10.4 3.4 8.6l2.3-.5" />
          <path d="M9.8 13.5 9.3 15.8l1.8.8.5-2.3" />
        </svg>
      );
  }
}

export function App() {
  const [page, setPage] = useState<Page>("market");
  const [locale, setLocale] = useState<Locale>(resolveInitialLocale);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teamRepoUrl, setTeamRepoUrl] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const text = APP_TEXT[locale];
  const tabs = useMemo(() => PAGE_ORDER.map((key) => ({
    key,
    label: text.tabs[key]
  })), [text.tabs]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: Page) => {
    const index = PAGE_ORDER.indexOf(current);
    if (index < 0) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + direction + PAGE_ORDER.length) % PAGE_ORDER.length;
      setPage(PAGE_ORDER[nextIndex]);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setPage(PAGE_ORDER[0]);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setPage(PAGE_ORDER[PAGE_ORDER.length - 1]);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
  }, [locale]);

  useEffect(() => {
    if (!settingsOpen) return;

    let active = true;
    setSettingsSaved(false);
    setSettingsError("");

    const loadGeneralSettings = async () => {
      try {
        const settings = await fetchGeneralSettings();
        if (!active) return;
        setTeamRepoUrl(String(settings.teamRepoUrl ?? "").trim());
      } catch (error) {
        if (!active) return;
        setSettingsError(getErrorMessage(error, text.settingsLoadFailed));
      }
    };

    void loadGeneralSettings();
    return () => {
      active = false;
    };
  }, [settingsOpen, text.settingsLoadFailed]);

  const saveGeneralSettings = async () => {
    const normalized = teamRepoUrl.trim();
    setSettingsSaved(false);
    setSettingsError("");

    if (!isValidGithubRepoUrl(normalized)) {
      setSettingsError(text.settingsInvalidRepoUrl);
      return;
    }

    setSettingsSaving(true);
    try {
      const saved = await updateGeneralSettings({ teamRepoUrl: normalized });
      setTeamRepoUrl(String(saved.teamRepoUrl ?? "").trim());
      setSettingsSaved(true);
    } catch (error) {
      setSettingsError(getErrorMessage(error, text.settingsLoadFailed));
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <main className="layout layout-board">
      <aside className="shell-rail" aria-label={text.navAria}>
        <div className="rail-logo" aria-hidden="true" title="SkillDock">
          <img src={appIcon} alt="" />
        </div>
        <header className="rail-head">
          <button
            className="btn btn-ghost rail-avatar-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label={text.settings}
            title={text.settings}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M7.84 1.804A1.5 1.5 0 0 1 9.25.75h1.5a1.5 1.5 0 0 1 1.41 1.054l.173.52c.21.63.88.975 1.5.772l.404-.133a1.5 1.5 0 0 1 1.64.428l1.06 1.06a1.5 1.5 0 0 1 .427 1.64l-.133.405a1.125 1.125 0 0 0 .773 1.499l.518.173a1.5 1.5 0 0 1 1.055 1.41v1.5a1.5 1.5 0 0 1-1.055 1.41l-.517.173a1.125 1.125 0 0 0-.773 1.498l.133.406a1.5 1.5 0 0 1-.427 1.64l-1.06 1.06a1.5 1.5 0 0 1-1.64.427l-.404-.133a1.125 1.125 0 0 0-1.5.772l-.173.52a1.5 1.5 0 0 1-1.41 1.053h-1.5a1.5 1.5 0 0 1-1.41-1.054l-.173-.519a1.125 1.125 0 0 0-1.5-.772l-.404.133a1.5 1.5 0 0 1-1.64-.427l-1.06-1.06a1.5 1.5 0 0 1-.427-1.64l.133-.406a1.125 1.125 0 0 0-.773-1.498l-.517-.173A1.5 1.5 0 0 1 .75 10.75v-1.5a1.5 1.5 0 0 1 1.054-1.41l.517-.173a1.125 1.125 0 0 0 .773-1.498l-.133-.406a1.5 1.5 0 0 1 .427-1.64l1.06-1.06a1.5 1.5 0 0 1 1.64-.427l.404.133a1.125 1.125 0 0 0 1.5-.772l.173-.52ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              />
            </svg>
            <span className="rail-avatar-dot" />
          </button>
        </header>

        <nav className="primary-tabs primary-tabs-ultra rail-tabs" aria-label={text.navAria} role="tablist" aria-orientation="vertical">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                id={`primary-tab-${tab.key}`}
                role="tab"
                aria-selected={page === tab.key}
                aria-controls={`primary-panel-${tab.key}`}
                aria-label={tab.label}
                title={tab.label}
                className={page === tab.key ? "btn btn-tab rail-tab btn-tab-active" : "btn btn-tab rail-tab"}
                aria-current={page === tab.key ? "page" : undefined}
                onClick={() => setPage(tab.key)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
              >
                <span className={`rail-tab-icon rail-tab-icon-${tab.key}`}>{renderTabIcon(tab.key)}</span>
                <span className="rail-tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
      </aside>

      <section
        className="page-shell board-content"
        id={`primary-panel-${page}`}
        role="tabpanel"
        aria-labelledby={`primary-tab-${page}`}
      >
        <div className="board-content-scale">
          {page === "market"
            ? <MarketPage locale={locale} />
            : page === "local"
              ? <LocalSkillsPage locale={locale} />
              : page === "camp"
                ? <SkillCampPage locale={locale} />
                : <ReleaseCenterPage locale={locale} />}
        </div>
      </section>

      {settingsOpen ? (
        <div className="settings-mask" onClick={() => setSettingsOpen(false)}>
          <aside className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <header className="settings-header">
              <h3>{text.settingsTitle}</h3>
              <button className="btn btn-ghost" onClick={() => setSettingsOpen(false)}>
                {text.close}
              </button>
            </header>
            <div className="settings-row">
              <p>{text.language}</p>
              <div className="lang-toggle" role="group" aria-label={text.language}>
                <button
                  className={locale === "zh" ? "btn btn-ghost btn-lang btn-lang-active" : "btn btn-ghost btn-lang"}
                  onClick={() => setLocale("zh")}
                >
                  中
                </button>
                <button
                  className={locale === "en" ? "btn btn-ghost btn-lang btn-lang-active" : "btn btn-ghost btn-lang"}
                  onClick={() => setLocale("en")}
                >
                  EN
                </button>
              </div>
            </div>
            <div className="settings-row">
              <p>{text.teamRepoHint}</p>
              <label className="field">
                <span>{text.teamRepoUrl}</span>
                <input
                  value={teamRepoUrl}
                  placeholder="https://github.com/org/repo"
                  onChange={(event) => {
                    setTeamRepoUrl(event.target.value);
                    setSettingsSaved(false);
                    if (settingsError) setSettingsError("");
                  }}
                />
              </label>
              <div className="settings-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void saveGeneralSettings()}
                  disabled={settingsSaving}
                >
                  {settingsSaving ? text.settingsSaving : text.settingsSave}
                </button>
              </div>
              {settingsError ? (
                <p className="settings-feedback settings-feedback-error">{settingsError}</p>
              ) : null}
              {settingsSaved ? (
                <p className="settings-feedback settings-feedback-ok">{text.settingsSaved}</p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
