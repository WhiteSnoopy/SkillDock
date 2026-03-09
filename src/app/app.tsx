import { useEffect, useState } from "react";
import { MarketPage } from "../pages/market-page";
import { LocalSkillsPage } from "../pages/local-skills-page";
import { SkillCampPage } from "../pages/skill-camp-page";
import { ReleaseCenterPage } from "../pages/release-center-page";
import { APP_LOCALE_STORAGE_KEY, resolveInitialLocale } from "../types/locale";
import type { Locale } from "../types/locale";
import "./app.css";
import "./redesign.css";

type Page = "market" | "local" | "camp" | "release";

const APP_TEXT = {
  zh: {
    heroKicker: "SkillDock Workspace",
    heroTitle: "Skill Agent",
    heroSubtitle: {
      market: "发现并安装技能，统一管理市场源与版本。",
      local: "聚合本机技能，按 Claude 与 Codex 双端编排。",
      camp: "创作新技能、沉淀模板、规范产物交付。",
      release: "按发布流程预检并创建可审计的发布 PR。"
    },
    navAria: "主导航",
    tabs: {
      market: "市场",
      local: "本地 Skill 管理",
      camp: "Skill 创造营",
      release: "发布中心"
    },
    settings: "通用设置",
    settingsTitle: "应用设置",
    language: "应用语言",
    close: "关闭"
  },
  en: {
    heroKicker: "SkillDock Workspace",
    heroTitle: "Skill Agent",
    heroSubtitle: {
      market: "Discover and install skills with source and version control.",
      local: "Manage local skills across Claude and Codex in one place.",
      camp: "Create new skills, iterate templates, and standardize delivery.",
      release: "Run release checks and create auditable release PRs."
    },
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
    close: "Close"
  }
} as const;

export function App() {
  const [page, setPage] = useState<Page>("market");
  const [locale, setLocale] = useState<Locale>(resolveInitialLocale);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const text = APP_TEXT[locale];

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
  }, [locale]);

  return (
    <main className="layout">
      <section className="shell-frame shell-frame-ultra">
        <header className="shell-ultra-bar">
          <div className="shell-brand shell-brand-ultra">
            <span className="shell-brand-mark" aria-hidden="true" />
            <h1 className="shell-title-mini">{text.heroTitle}</h1>
          </div>

          <nav className="primary-tabs primary-tabs-ultra" aria-label={text.navAria}>
            <button
              className={page === "market" ? "btn btn-tab btn-tab-active" : "btn btn-tab"}
              aria-current={page === "market" ? "page" : undefined}
              onClick={() => setPage("market")}
            >
              {text.tabs.market}
            </button>
            <button
              className={page === "local" ? "btn btn-tab btn-tab-active" : "btn btn-tab"}
              aria-current={page === "local" ? "page" : undefined}
              onClick={() => setPage("local")}
            >
              {text.tabs.local}
            </button>
            <button
              className={page === "camp" ? "btn btn-tab btn-tab-active" : "btn btn-tab"}
              aria-current={page === "camp" ? "page" : undefined}
              onClick={() => setPage("camp")}
            >
              {text.tabs.camp}
            </button>
            <button
              className={page === "release" ? "btn btn-tab btn-tab-active" : "btn btn-tab"}
              aria-current={page === "release" ? "page" : undefined}
              onClick={() => setPage("release")}
            >
              {text.tabs.release}
            </button>
          </nav>

          <div className="shell-actions">
            <button className="btn btn-ghost shell-settings-btn" onClick={() => setSettingsOpen(true)} aria-label={text.settings}>
              <svg className="shell-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.8 2.8h2.4l.5 2.2c.5.2 1 .4 1.5.6l2-1.1 1.7 1.7-1.1 2c.3.5.5 1 .7 1.6l2.2.5v2.4l-2.2.5c-.2.6-.4 1.1-.7 1.6l1.1 2-1.7 1.7-2-1.1c-.5.3-1 .5-1.5.6l-.5 2.2h-2.4l-.5-2.2c-.5-.2-1-.4-1.5-.6l-2 1.1-1.7-1.7 1.1-2c-.3-.5-.5-1-.7-1.6L2.8 13v-2.4l2.2-.5c.2-.6.4-1.1.7-1.6l-1.1-2 1.7-1.7 2 1.1c.5-.3 1-.5 1.5-.6l.5-2.2Z" />
                <circle cx="12" cy="12" r="3.1" />
              </svg>
              <span className="shell-settings-label">{text.settings}</span>
            </button>
          </div>
        </header>
      </section>

      <section className="page-shell">
        {page === "market"
          ? <MarketPage locale={locale} />
          : page === "local"
            ? <LocalSkillsPage locale={locale} />
            : page === "camp"
              ? <SkillCampPage locale={locale} />
              : <ReleaseCenterPage locale={locale} />}
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
          </aside>
        </div>
      ) : null}
    </main>
  );
}
