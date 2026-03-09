import { BetaReleasePanel } from "../components/beta-release-panel";
import type { Locale } from "../types/locale";

const RELEASE_TEXT = {
  zh: {
    subtitle: "单 Skill 发布流程，覆盖准备信息、预检清单和 PR 创建。"
  },
  en: {
    subtitle: "Single-skill release flow with preparation, precheck, and PR creation."
  }
} as const;

export function ReleaseCenterPage(props: { locale: Locale }) {
  const { locale } = props;
  const text = RELEASE_TEXT[locale];

  return (
    <section className="column-gap release-center-shell release-layout-stable-shell">
      <article className="panel release-center-intro">
        <p className="release-intro-copy">{text.subtitle}</p>
      </article>
      <BetaReleasePanel locale={locale} />
    </section>
  );
}
