import type { Locale } from "../types/locale";

const CAMP_TEXT = {
  zh: {
    kicker: "Skill Studio",
    title: "Skill 创造营",
    subtitle: "面向团队的技能创作工作台，覆盖定义、实现、评审与发布预备。",
    primaryAction: "创建新 Skill（即将上线）",
    secondaryAction: "导入模板（即将上线）",
    flowTitle: "创作流程",
    flowItems: [
      { title: "定义场景", desc: "先明确触发词、边界和成功标准，避免后续返工。" },
      { title: "生成骨架", desc: "自动初始化 SKILL.md、示例输入和脚本目录。" },
      { title: "质量校验", desc: "在本地完成可读性、可运行性与触发准确率检查。" }
    ],
    workshopTitle: "模板工坊",
    workshopItems: [
      { name: "数据处理模板", type: "Automation", desc: "适合批量清洗、转换和同步类任务。" },
      { name: "前端设计模板", type: "UI/UX", desc: "用于页面重设计、组件交互与视觉规范落地。" },
      { name: "发布流程模板", type: "Release", desc: "内置 dry-run、版本校验和发布清单结构。" }
    ],
    roadmapTitle: "近期建设",
    roadmap: [
      "多角色协作与审阅记录",
      "模板参数化与版本快照",
      "跨仓库技能依赖检测"
    ]
  },
  en: {
    kicker: "Skill Studio",
    title: "Skill Camp",
    subtitle: "Team-oriented workspace for skill definition, implementation, review, and release readiness.",
    primaryAction: "Create New Skill (Coming Soon)",
    secondaryAction: "Import Template (Coming Soon)",
    flowTitle: "Creation Flow",
    flowItems: [
      { title: "Define Scenarios", desc: "Clarify triggers, boundaries, and success criteria first." },
      { title: "Generate Skeleton", desc: "Bootstrap SKILL.md, sample prompts, and script folders." },
      { title: "Quality Gate", desc: "Run readability, runtime, and trigger-accuracy checks locally." }
    ],
    workshopTitle: "Template Workshop",
    workshopItems: [
      { name: "Data Workflow Template", type: "Automation", desc: "For bulk cleanup, transformation, and sync jobs." },
      { name: "Frontend Design Template", type: "UI/UX", desc: "For page redesign, component interaction, and visual system work." },
      { name: "Release Flow Template", type: "Release", desc: "Includes dry-run, version validation, and publish checklist structures." }
    ],
    roadmapTitle: "Near-term Roadmap",
    roadmap: [
      "Multi-role collaboration with review logs",
      "Template parameterization and version snapshots",
      "Cross-repo skill dependency checks"
    ]
  }
} as const;

export function SkillCampPage(props: { locale: Locale }) {
  const text = CAMP_TEXT[props.locale];

  return (
    <section className="column-gap camp-shell">
      <div className="panel camp-hero">
        <div>
          <p className="camp-subtitle camp-subtitle-only">{text.subtitle}</p>
        </div>
        <div className="camp-hero-actions">
          <button className="btn btn-primary" disabled>{text.primaryAction}</button>
          <button className="btn btn-ghost" disabled>{text.secondaryAction}</button>
        </div>
      </div>

      <div className="camp-grid">
        <article className="panel camp-card">
          <h3>{text.flowTitle}</h3>
          <div className="camp-flow-list">
            {text.flowItems.map((item, index) => (
              <section key={item.title} className="camp-flow-item">
                <span className="camp-flow-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </div>
              </section>
            ))}
          </div>
        </article>

        <article className="panel camp-card">
          <h3>{text.workshopTitle}</h3>
          <div className="camp-workshop-list">
            {text.workshopItems.map((item) => (
              <section key={item.name} className="camp-workshop-item">
                <div className="camp-workshop-top">
                  <h4>{item.name}</h4>
                  <span>{item.type}</span>
                </div>
                <p>{item.desc}</p>
              </section>
            ))}
          </div>
        </article>

        <article className="panel camp-card camp-card-roadmap">
          <h3>{text.roadmapTitle}</h3>
          <ul className="plain-list camp-roadmap-list">
            {text.roadmap.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
