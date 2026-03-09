import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  createBetaReleasePr,
  dryRunBetaRelease,
  fetchLocalSkills,
  pickSkillFolder
} from "../lib/desktop-api";
import { useGuardedAction } from "../hooks/use-guarded-action";
import { StatusBanner } from "./status-banner";
import type { BetaReleaseChecklistItem, BetaReleaseDryRunResponse, LocalInstalledSkill } from "../types/models";
import type { Locale } from "../types/locale";

type DryRunPreview = BetaReleaseDryRunResponse;
type CreatedPr = {
  prTitle: string;
  prBody: string;
  prUrl?: string;
  repoUrl?: string;
  branch?: string;
  bundlePath?: string;
  bundledFiles?: number;
  changedFiles?: string[];
  warning?: string;
};
type CopyKind = "title" | "body" | "link" | null;
type SourceMode = "local" | "manual";
type PendingAction = "dryRun" | "createPr" | null;
type ReleaseStageKey = "prepare" | "check" | "publish";

interface FolderOption {
  key: string;
  label: string;
  skillId: string;
  path: string;
  provider: string;
  sourceId: string;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;

const TEXT = {
  zh: {
    stageTitle: "发布阶段",
    stageProgress: (current: number, total: number) => `阶段 ${current}/${total}`,
    stagePrepareName: "准备发布信息",
    stagePrepareDesc: "选择 skill 与填写版本",
    stageCheckName: "预检清单",
    stageCheckDesc: "执行 dry run 并确认变更",
    stagePublishName: "创建发布 PR",
    stagePublishDesc: "确认后发起单 skill PR",
    prevStage: "上一步",
    nextStage: "下一步",
    sourceTitle: "选择单个本地 Skill",
    sourceDesc: "从本机安装目录选择一个 skill，或手动指定单个 skill 文件夹路径。",
    modeLocal: "本机已安装",
    modeManual: "手动路径",
    localFolder: "Skill 文件夹",
    manualPath: "手动填写目录路径",
    browseFolder: "浏览文件夹",
    browsingFolder: "正在打开...",
    folderMeta: (provider: string, sourceId: string) => `来源: ${provider} · ${sourceId}`,
    folderEmpty: "未检测到本地 skill，可先到“本地 Skill 管理”加载。",
    selectedPath: (value: string) => `当前目录: ${value || "-"}`,

    metaTitle: "发布标识",
    metaDesc: "默认只需填写版本号，其他标识由系统自动推导。",
    version: "版本号",
    autoSkillId: "技能 ID（自动）",
    autoMetaHint: "发布 ID 与申请人默认自动生成，无需手动填写。",
    metaNoteVersion: "版本号建议使用语义化格式，并在 dry run 后保持稳定。",
    metaNoteSkillId: "技能 ID 会随目录路径自动推导，无需手填。",

    checkTitle: "Skill Publisher 对齐检查清单",
    checkDesc: "对齐 skill-publisher 的核心发布前检查；当前仅针对单个 skill，最终创建 PR。",
    checkFolder: "验证 SKILL.md 的 YAML frontmatter（name + description）",
    checkPublishPath: "发布路径校验（创建分支并提交 PR）",
    checkDiscoverability: "安装可发现性检查（映射 npx 验证）",
    runDryRun: "执行预检",
    runningDryRun: "预检中...",
    rerunDryRun: "重新预检",
    dryRunHint: "预检通过后再创建 PR。",
    runningDryRunHint: "预检执行中，请稍候...",
    dryRunPassed: (count: number) => `预检完成 · 发现 ${count} 个仓库变更`,
    changedFiles: "变更文件",
    changelogDelta: "预检摘要",
    moreFiles: (count: number) => `还有 ${count} 个文件未展开`,
    previewEmptyTitle: "尚未执行预检",
    previewEmptyDesc: "点击“执行预检”后，这里会展示将提交到仓库的文件清单。",

    publishTitle: "提交单 Skill 发布 PR",
    publishDesc: "不会直接提交到 main，仅为当前这个 skill 创建独立分支并发起 PR。",
    publishSummarySkillId: "技能 ID",
    publishSummaryVersion: "版本号",
    publishSummaryPath: "Skill 目录",
    publishSummaryPrecheck: "预检状态",
    confirmLabel: "我已确认目录、版本与预检清单一致",
    actionState: (previewReady: boolean, canCreate: boolean) =>
      `预检: ${previewReady ? "已完成" : "未执行"} · 创建 PR: ${canCreate ? "可执行" : "不可执行"}`,
    createPr: "创建该 Skill 的发布 PR",
    creatingPr: "创建中...",
    resultTitle: "发布结果",
    resultHint: "以下信息可直接发到评审群。",
    prTitle: "PR 标题",
    prBody: "PR 内容",
    prLink: "PR 链接",
    repoTarget: "目标仓库",
    branchName: "发布分支",
    bundlePath: "打包目录",
    bundledFiles: "打包文件数",
    warning: "提示",
    copyTitle: "复制标题",
    copyBody: "复制内容",
    copyLink: "复制链接",
    copied: "已复制",
    publishEmptyTitle: "等待创建发布 PR",
    publishEmptyDesc: "勾选确认并点击创建按钮后，这里会展示 PR 结果与复制入口。",
    publishEmptyStepOne: "先在左侧确认目录、版本与预检状态。",
    publishEmptyStepTwo: "点击“创建该 Skill 的发布 PR”发起发布。",
    publishEmptyStepThree: "创建完成后可直接复制标题、内容与链接。",
    prCreated: (title: string) => `PR 已创建: ${title}`
  },
  en: {
    stageTitle: "Release Stages",
    stageProgress: (current: number, total: number) => `Stage ${current}/${total}`,
    stagePrepareName: "Prepare Inputs",
    stagePrepareDesc: "Choose skill and version",
    stageCheckName: "Precheck",
    stageCheckDesc: "Run dry run and review delta",
    stagePublishName: "Create PR",
    stagePublishDesc: "Confirm and open single-skill PR",
    prevStage: "Previous",
    nextStage: "Next",
    sourceTitle: "Select One Local Skill",
    sourceDesc: "Pick one installed skill or provide one skill folder path.",
    modeLocal: "Local Installed",
    modeManual: "Manual Path",
    localFolder: "Skill Folder",
    manualPath: "Manual folder path",
    browseFolder: "Browse Folder",
    browsingFolder: "Opening...",
    folderMeta: (provider: string, sourceId: string) => `Source: ${provider} · ${sourceId}`,
    folderEmpty: "No local skill detected. Load it first in Local Skill Management.",
    selectedPath: (value: string) => `Current path: ${value || "-"}`,

    metaTitle: "Release Metadata",
    metaDesc: "By default only version is required. Other metadata is auto-resolved.",
    version: "Version",
    autoSkillId: "Skill ID (Auto)",
    autoMetaHint: "Release ID and requester are auto-generated. No manual fields required.",
    metaNoteVersion: "Use semantic versioning and keep it stable after dry run.",
    metaNoteSkillId: "Skill ID is inferred from folder path automatically.",

    checkTitle: "Skill Publisher Aligned Checklist",
    checkDesc: "Aligned to Skill Publisher's core preflight checks for a single skill; final action is PR creation.",
    checkFolder: "Validate SKILL.md YAML frontmatter (name + description)",
    checkPublishPath: "Publish path validation (branch + PR)",
    checkDiscoverability: "Install discoverability check (mapped from npx verification)",
    runDryRun: "Run Precheck",
    runningDryRun: "Running...",
    rerunDryRun: "Run Again",
    dryRunHint: "Create PR after precheck succeeds.",
    runningDryRunHint: "Precheck is running. Please wait...",
    dryRunPassed: (count: number) => `Precheck done · ${count} repository changes`,
    changedFiles: "Changed Files",
    changelogDelta: "Precheck Summary",
    moreFiles: (count: number) => `${count} more files hidden`,
    previewEmptyTitle: "Precheck Not Run",
    previewEmptyDesc: "Run precheck to preview repository file changes here.",

    publishTitle: "Submit Single-Skill Release PR",
    publishDesc: "No direct push to main. A dedicated branch and PR are created for this single skill.",
    publishSummarySkillId: "Skill ID",
    publishSummaryVersion: "Version",
    publishSummaryPath: "Skill Folder",
    publishSummaryPrecheck: "Precheck",
    confirmLabel: "I confirm folder, version, and precheck manifest are aligned",
    actionState: (previewReady: boolean, canCreate: boolean) =>
      `Precheck: ${previewReady ? "done" : "not run"} · Create PR: ${canCreate ? "ready" : "blocked"}`,
    createPr: "Create PR for This Skill",
    creatingPr: "Creating...",
    resultTitle: "Release Output",
    resultHint: "Share this in review channels.",
    prTitle: "PR Title",
    prBody: "PR Body",
    prLink: "PR Link",
    repoTarget: "Target Repository",
    branchName: "Release Branch",
    bundlePath: "Bundle Path",
    bundledFiles: "Bundled Files",
    warning: "Warning",
    copyTitle: "Copy Title",
    copyBody: "Copy Body",
    copyLink: "Copy Link",
    copied: "Copied",
    publishEmptyTitle: "Waiting to Create PR",
    publishEmptyDesc: "After confirmation and creating PR, result details and copy actions appear here.",
    publishEmptyStepOne: "Confirm folder, version, and precheck status on the left.",
    publishEmptyStepTwo: "Click “Create PR for This Skill” to open the release PR.",
    publishEmptyStepThree: "Copy title, body, and link once PR is created.",
    prCreated: (title: string) => `PR created: ${title}`
  }
} as const;

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function buildDateStamp(now: Date): string {
  const year = now.getFullYear();
  const month = padNumber(now.getMonth() + 1);
  const day = padNumber(now.getDate());
  return `${year}${month}${day}`;
}

function generateDefaultVersion(now: Date = new Date()): string {
  return `0.1.0-rc.${buildDateStamp(now)}.1`;
}

function deriveSkillIdFromPath(folderPath: string): string {
  const normalized = String(folderPath ?? "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  const name = normalized.split("/").pop() ?? "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-");
}

function toFolderOption(item: LocalInstalledSkill): FolderOption | null {
  const folderPath = String(item.targetPath ?? item.ssotPath ?? "").trim();
  if (!folderPath) return null;
  return {
    key: `${item.sourceId}:${item.skillId}:${folderPath}`,
    label: `${item.name} · ${item.provider} · ${folderPath}`,
    skillId: item.skillId,
    path: folderPath,
    provider: item.provider,
    sourceId: item.sourceId
  };
}

export function BetaReleasePanel(props?: { locale?: Locale }) {
  const locale = props?.locale ?? "zh";
  const text = TEXT[locale];

  const [sourceMode, setSourceMode] = useState<SourceMode>("local");
  const [localSkills, setLocalSkills] = useState<LocalInstalledSkill[]>([]);
  const [selectedFolderKey, setSelectedFolderKey] = useState("");
  const [manualFolderPath, setManualFolderPath] = useState("");
  const [pickingFolder, setPickingFolder] = useState(false);

  const [version, setVersion] = useState(() => generateDefaultVersion());

  const [preview, setPreview] = useState<DryRunPreview | null>(null);
  const [confirmBeforeSubmit, setConfirmBeforeSubmit] = useState(false);
  const [createdPr, setCreatedPr] = useState<CreatedPr | null>(null);
  const [copiedKind, setCopiedKind] = useState<CopyKind>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [activeStage, setActiveStage] = useState<ReleaseStageKey>("prepare");

  const { run, error, loading } = useGuardedAction();

  const folderOptions = useMemo(() => {
    const options = localSkills
      .filter((item) => item.provider === "Claude" || item.provider === "Codex")
      .map(toFolderOption)
      .filter((item): item is FolderOption => Boolean(item));
    return options.sort((left, right) =>
      left.label.localeCompare(right.label, "zh-CN", { sensitivity: "base" })
    );
  }, [localSkills]);

  const selectedFolder = useMemo(
    () => folderOptions.find((item) => item.key === selectedFolderKey) ?? null,
    [folderOptions, selectedFolderKey]
  );
  const currentFolderPath = sourceMode === "local" ? (selectedFolder?.path ?? "") : manualFolderPath.trim();
  const resolvedSkillId = (selectedFolder?.skillId || deriveSkillIdFromPath(currentFolderPath)).trim();

  const hasFolder = Boolean(currentFolderPath);
  const hasVersion = Boolean(version.trim());
  const versionLooksValid = VERSION_PATTERN.test(version.trim());
  const hasSkillId = Boolean(resolvedSkillId);
  const canDryRun = hasFolder && hasVersion && versionLooksValid && hasSkillId;
  const canCreatePr = canDryRun && Boolean(preview) && confirmBeforeSubmit;
  const isDryRunning = pendingAction === "dryRun";
  const isCreatingPr = pendingAction === "createPr";

  const visibleFiles = preview?.changedFiles.slice(0, 10) ?? [];
  const hiddenFileCount = Math.max((preview?.changedFiles.length ?? 0) - visibleFiles.length, 0);
  const publishStateText = text.actionState(Boolean(preview), canCreatePr);
  const releaseResultItems = createdPr
    ? [
      { key: "prTitle", label: text.prTitle, value: createdPr.prTitle },
      { key: "prBody", label: text.prBody, value: createdPr.prBody },
      { key: "prUrl", label: text.prLink, value: createdPr.prUrl },
      { key: "repoUrl", label: text.repoTarget, value: createdPr.repoUrl },
      { key: "branch", label: text.branchName, value: createdPr.branch },
      { key: "bundlePath", label: text.bundlePath, value: createdPr.bundlePath },
      {
        key: "bundledFiles",
        label: text.bundledFiles,
        value: typeof createdPr.bundledFiles === "number" ? String(createdPr.bundledFiles) : undefined
      },
      { key: "warning", label: text.warning, value: createdPr.warning }
    ].reduce<Array<{ key: string; label: string; value: string }>>((items, item) => {
      if (item.value) items.push({ key: item.key, label: item.label, value: item.value });
      return items;
    }, [])
    : [];

  const checks: BetaReleaseChecklistItem[] = preview?.checklist?.length
      ? preview.checklist
      : [
        { id: "skill-frontmatter", title: text.checkFolder, status: "pending" },
        { id: "publish-path", title: text.checkPublishPath, status: "pending" },
        { id: "discoverability", title: text.checkDiscoverability, status: "pending" }
      ];

  const stages = [
    { key: "prepare" as const, name: text.stagePrepareName, desc: text.stagePrepareDesc },
    { key: "check" as const, name: text.stageCheckName, desc: text.stageCheckDesc },
    { key: "publish" as const, name: text.stagePublishName, desc: text.stagePublishDesc }
  ];
  const activeStageIndex = stages.findIndex((item) => item.key === activeStage);
  const activeStagePosition = activeStageIndex >= 0 ? activeStageIndex + 1 : 1;
  const stageProgressPercent = stages.length > 1
    ? (Math.max(activeStageIndex, 0) / (stages.length - 1)) * 100
    : 0;
  const hasPrevStage = activeStageIndex > 0;
  const hasNextStage = activeStageIndex >= 0 && activeStageIndex < stages.length - 1;
  const precheckActionLabel = isDryRunning ? text.runningDryRun : (preview ? text.rerunDryRun : text.runDryRun);

  const resetReleaseResult = () => {
    setPreview(null);
    setCreatedPr(null);
    setConfirmBeforeSubmit(false);
    setCopiedKind(null);
  };

  const loadLocalFolders = async () => {
    const payload = await run(() => fetchLocalSkills());
    if (!payload) return;
    setLocalSkills(payload.skills);
  };

  const browseManualFolder = async () => {
    if (pickingFolder) return;
    setPickingFolder(true);
    try {
      const selected = await run(() => pickSkillFolder());
      if (!selected) return;
      setManualFolderPath(selected);
      resetReleaseResult();
    } finally {
      setPickingFolder(false);
    }
  };

  useEffect(() => {
    void loadLocalFolders();
  }, []);

  useEffect(() => {
    if (sourceMode !== "local") return;
    if (!selectedFolderKey && folderOptions.length > 0) {
      setSelectedFolderKey(folderOptions[0].key);
    }
  }, [sourceMode, selectedFolderKey, folderOptions]);

  const onSelectFolder = (nextKey: string) => {
    setSelectedFolderKey(nextKey);
    resetReleaseResult();
  };

  const doDryRun = async () => {
    if (!canDryRun || isDryRunning || isCreatingPr) return;
    setPendingAction("dryRun");
    try {
      const response = await run(() =>
        dryRunBetaRelease({
          skillId: resolvedSkillId || undefined,
          version,
          skillPath: currentFolderPath
        })
      );
      if (!response) return;
      setPreview(response);
      setConfirmBeforeSubmit(false);
      setCreatedPr(null);
      setCopiedKind(null);
    } finally {
      setPendingAction((current) => (current === "dryRun" ? null : current));
    }
  };

  const createPr = async () => {
    if (!canCreatePr || isDryRunning || isCreatingPr) return;
    setPendingAction("createPr");
    try {
      const response = await run(() =>
        createBetaReleasePr({
          skillId: resolvedSkillId || undefined,
          version,
          skillPath: currentFolderPath
        })
      );
      if (!response) return;
      setCreatedPr(response);
    } finally {
      setPendingAction((current) => (current === "createPr" ? null : current));
    }
  };

  const copyText = async (kind: Exclude<CopyKind, null>, value: string) => {
    if (!value.trim() || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKind(kind);
    } catch {
      setCopiedKind(null);
    }
  };

  const goToPrevStage = () => {
    if (!hasPrevStage) return;
    const next = stages[activeStageIndex - 1];
    if (next) setActiveStage(next.key);
  };

  const goToNextStage = () => {
    if (!hasNextStage) return;
    const next = stages[activeStageIndex + 1];
    if (next) setActiveStage(next.key);
  };

  return (
    <section className={`panel release-workbench publisher-workbench release-layout-stable release-stage-${activeStage}`}>
      <div className="release-flow-horizontal-shell">
        <div className="release-flow-header">
          <div className="release-flow-current">
            <p className="release-flow-title">{text.stageTitle}</p>
            <p className="release-flow-current-kicker">{text.stageProgress(activeStagePosition, stages.length)}</p>
          </div>
          <div className="release-stage-nav-buttons">
            {hasPrevStage ? (
              <button className="btn btn-ghost" onClick={goToPrevStage}>{text.prevStage}</button>
            ) : null}
            {hasNextStage ? (
              <button className="btn btn-secondary" onClick={goToNextStage}>{text.nextStage}</button>
            ) : null}
          </div>
        </div>
        <div
          className="release-stage-track"
          role="tablist"
          aria-label={text.stageTitle}
          style={{ "--stage-progress": `${stageProgressPercent / 100}` } as CSSProperties}
        >
          <span className="release-stage-track-line" aria-hidden />
          <span className="release-stage-track-fill" aria-hidden />
          {stages.map((stage, index) => {
            const isActive = stage.key === activeStage;
            const isDone = index < activeStageIndex;
            return (
              <button
                key={stage.key}
                role="tab"
                aria-selected={isActive}
                className={
                  isActive
                    ? "release-stage-node release-stage-node-active"
                    : isDone
                      ? "release-stage-node release-stage-node-done"
                      : "release-stage-node"
                }
                onClick={() => setActiveStage(stage.key)}
              >
                <span className="release-stage-node-dot">{padNumber(index + 1)}</span>
                <strong className="release-stage-node-name">{stage.name}</strong>
                <span className="release-stage-node-desc">{stage.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="publisher-grid publisher-grid-single">
        {activeStage === "prepare" ? (
          <article className="form-step publisher-step-card publisher-step-card-full publisher-step-card-prepare">
            <div className="publisher-stage-grid">
              <section className="publisher-stage-section publisher-stage-section-source">
                <h5>{text.sourceTitle}</h5>
                <p className="state-line">{text.sourceDesc}</p>

                <div className="release-source-switch" role="group" aria-label={text.sourceTitle}>
                  <button
                    className={sourceMode === "local" ? "btn btn-ghost release-source-option release-source-option-active" : "btn btn-ghost release-source-option"}
                    onClick={() => {
                      setSourceMode("local");
                      resetReleaseResult();
                    }}
                  >
                    {text.modeLocal}
                  </button>
                  <button
                    className={sourceMode === "manual" ? "btn btn-ghost release-source-option release-source-option-active" : "btn btn-ghost release-source-option"}
                    onClick={() => {
                      setSourceMode("manual");
                      resetReleaseResult();
                    }}
                  >
                    {text.modeManual}
                  </button>
                </div>

                {sourceMode === "local" ? (
                  <label className="field">
                    <select aria-label={text.localFolder} value={selectedFolderKey} onChange={(event) => onSelectFolder(event.target.value)}>
                      {folderOptions.length === 0 ? <option value="">{text.folderEmpty}</option> : null}
                      {folderOptions.map((item) => (
                        <option key={item.key} value={item.key}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="publisher-inline-grid">
                    <label className="field">
                      <input
                        placeholder="/Users/you/.codex/skills/my-skill"
                        value={manualFolderPath}
                        onChange={(event) => {
                          setManualFolderPath(event.target.value);
                          resetReleaseResult();
                        }}
                      />
                    </label>
                    <button className="btn btn-secondary" disabled={pickingFolder} onClick={() => void browseManualFolder()}>
                      {pickingFolder ? text.browsingFolder : text.browseFolder}
                    </button>
                  </div>
                )}

                <p className="release-folder-meta">
                  {sourceMode === "local"
                    ? (selectedFolder ? text.folderMeta(selectedFolder.provider, selectedFolder.sourceId) : text.folderEmpty)
                    : (currentFolderPath ? text.selectedPath(currentFolderPath) : text.folderEmpty)}
                </p>
                {sourceMode === "local" ? (
                  <p className="release-folder-meta">{text.selectedPath(currentFolderPath)}</p>
                ) : null}
              </section>

              <section
                className="publisher-stage-section publisher-stage-section-divider publisher-stage-section-meta"
              >
                <h5>{text.metaTitle}</h5>
                <p className="state-line">{text.metaDesc}</p>

                <div className="publisher-meta-grid">
                  <label className="field">
                    <span>{text.version}</span>
                    <input
                      placeholder="1.2.0-rc.1"
                      value={version}
                      onChange={(event) => {
                        setVersion(event.target.value);
                        resetReleaseResult();
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>{text.autoSkillId}</span>
                    <input value={resolvedSkillId} readOnly />
                  </label>
                </div>

                <div className="release-meta-notes">
                  <p className="release-inline-hint">{text.autoMetaHint}</p>
                  <ul className="plain-list release-meta-note-list">
                    <li>{text.metaNoteVersion}</li>
                    <li>{text.metaNoteSkillId}</li>
                  </ul>
                </div>
              </section>
            </div>
          </article>
        ) : null}

        {activeStage === "check" ? (
          <article className="form-step publisher-step-card publisher-step-card-full publisher-step-card-check">
            <div className="publisher-check-shell">
              <div className="publisher-check-left">
                <div className="release-check-grid">
                  {checks.map((item) => (
                    <p
                      key={item.id}
                      className={
                        item.status === "passed"
                          ? "release-check-item release-check-pass"
                          : item.status === "warning"
                            ? "release-check-item release-check-warning"
                            : item.status === "failed"
                              ? "release-check-item release-check-fail"
                              : "release-check-item release-check-pending"
                      }
                    >
                      <span>{item.status === "passed" ? "✓" : item.status === "warning" ? "!" : item.status === "failed" ? "×" : "•"}</span>
                      <span className="release-check-copy">
                        <strong>{item.title}</strong>
                        {item.detail ? <em>{item.detail}</em> : null}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
              <div className="publisher-check-right">
                {preview ? (
                  <div className="release-preview-box">
                    <p className="release-preview-summary">{text.dryRunPassed(preview.changedFiles.length)}</p>
                    <p><strong>{text.changedFiles}</strong></p>
                    <ul className="plain-list release-files-list">
                      {visibleFiles.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    {hiddenFileCount > 0 ? <p className="state-line">{text.moreFiles(hiddenFileCount)}</p> : null}
                    <p><strong>{text.changelogDelta}</strong></p>
                    <pre>{preview.changelogDelta}</pre>
                    <div className="release-preview-actions release-stage-card-actions release-stage-card-actions-inline">
                      <button
                        className={isDryRunning ? "btn btn-secondary btn-with-spinner" : "btn btn-secondary"}
                        disabled={!canDryRun || isDryRunning || isCreatingPr}
                        onClick={() => void doDryRun()}
                        aria-busy={isDryRunning}
                      >
                        {isDryRunning ? <span className="btn-inline-spinner" aria-hidden /> : null}
                        <span>{precheckActionLabel}</span>
                      </button>
                    </div>
                  </div>
                ) : isDryRunning ? (
                  <div className="publisher-preview-empty publisher-preview-loading">
                    <p className="release-preview-summary">
                      <span className="release-preview-spinner" aria-hidden />
                      <span>{text.runningDryRun}</span>
                    </p>
                    <p className="state-line">{text.runningDryRunHint}</p>
                    <div className="release-preview-actions release-stage-card-actions release-stage-card-actions-inline">
                      <button
                        className="btn btn-secondary btn-with-spinner"
                        disabled
                        onClick={() => void doDryRun()}
                        aria-busy
                      >
                        <span className="btn-inline-spinner" aria-hidden />
                        <span>{precheckActionLabel}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="publisher-preview-empty">
                    <p className="release-preview-summary">{text.previewEmptyTitle}</p>
                    <p className="state-line">{text.previewEmptyDesc}</p>
                    <div className="release-preview-actions release-stage-card-actions release-stage-card-actions-inline">
                      <button
                        className={isDryRunning ? "btn btn-secondary btn-with-spinner" : "btn btn-secondary"}
                        disabled={!canDryRun || isDryRunning || isCreatingPr}
                        onClick={() => void doDryRun()}
                        aria-busy={isDryRunning}
                      >
                        {isDryRunning ? <span className="btn-inline-spinner" aria-hidden /> : null}
                        <span>{precheckActionLabel}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </article>
        ) : null}

        {activeStage === "publish" ? (
          <article className="form-step publisher-step-card publisher-step-card-full publisher-step-card-publish">
            <div className="publisher-publish-shell">
              <section className="publisher-publish-left">
                <div className="publisher-publish-summary">
                  <h5>{text.publishTitle}</h5>
                  <p className="state-line">{text.publishDesc}</p>
                  <div className="publisher-publish-summary-grid">
                    <p className="publisher-publish-summary-item">
                      <span>{text.publishSummarySkillId}</span>
                      <strong>{resolvedSkillId || "-"}</strong>
                    </p>
                    <p className="publisher-publish-summary-item">
                      <span>{text.publishSummaryVersion}</span>
                      <strong>{version.trim() || "-"}</strong>
                    </p>
                    <p className="publisher-publish-summary-item publisher-publish-summary-item-wide">
                      <span>{text.publishSummaryPath}</span>
                      <strong>{currentFolderPath || "-"}</strong>
                    </p>
                    <p className="publisher-publish-summary-item publisher-publish-summary-item-wide">
                      <span>{text.publishSummaryPrecheck}</span>
                      <strong>{publishStateText}</strong>
                    </p>
                  </div>
                </div>
              </section>

              <section className="publisher-publish-right">
                <div className="publisher-publish-action publisher-publish-action-right">
                  <label className="confirm-check">
                    <input
                      type="checkbox"
                      checked={confirmBeforeSubmit}
                      disabled={isDryRunning || isCreatingPr}
                      onChange={(event) => setConfirmBeforeSubmit(event.target.checked)}
                    />
                    {text.confirmLabel}
                  </label>
                  <div className="release-stage-card-actions release-stage-card-actions-inline">
                    <button
                      className={isCreatingPr ? "btn btn-primary btn-with-spinner" : "btn btn-primary"}
                      disabled={!canCreatePr || isDryRunning || isCreatingPr}
                      onClick={() => void createPr()}
                      aria-busy={isCreatingPr}
                    >
                      {isCreatingPr ? <span className="btn-inline-spinner" aria-hidden /> : null}
                      <span>{isCreatingPr ? text.creatingPr : text.createPr}</span>
                    </button>
                  </div>
                </div>
                {createdPr ? (
                  <div className="release-result-box">
                    <h4>{text.resultTitle}</h4>
                    <p className="muted-copy">{text.resultHint}</p>
                    <div className="release-result-grid">
                      {releaseResultItems.map((item) => (
                        <div key={item.key} className="release-result-item">
                          <p className="release-result-item-label">{item.label}</p>
                          <pre>{item.value}</pre>
                        </div>
                      ))}
                    </div>

                    <div className="action-row">
                      <button className="btn btn-ghost" onClick={() => void copyText("title", createdPr.prTitle)}>
                        {copiedKind === "title" ? text.copied : text.copyTitle}
                      </button>
                      <button className="btn btn-ghost" onClick={() => void copyText("body", createdPr.prBody)}>
                        {copiedKind === "body" ? text.copied : text.copyBody}
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={!createdPr.prUrl}
                        onClick={() => void copyText("link", createdPr.prUrl ?? "")}
                      >
                        {copiedKind === "link" ? text.copied : text.copyLink}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="publisher-preview-empty publisher-preview-empty-publish">
                    <p className="release-preview-summary">{text.publishEmptyTitle}</p>
                    <p className="state-line">{text.publishEmptyDesc}</p>
                    <ul className="plain-list publisher-publish-empty-list">
                      <li>{text.publishEmptyStepOne}</li>
                      <li>{text.publishEmptyStepTwo}</li>
                      <li>{text.publishEmptyStepThree}</li>
                    </ul>
                  </div>
                )}
              </section>
            </div>
          </article>
        ) : null}
      </div>

      <StatusBanner
        error={error}
        loading={loading}
        successMessage={createdPr ? text.prCreated(createdPr.prTitle) : undefined}
        locale={locale}
      />
    </section>
  );
}
