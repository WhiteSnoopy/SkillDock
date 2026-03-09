import { useState } from "react";
import { createPromoteStablePr } from "../lib/desktop-api";
import { useGuardedAction } from "../hooks/use-guarded-action";
import { StatusBanner } from "./status-banner";

export function PromoteStablePanel(props: { isOwner: boolean }) {
  const [requestedBy, setRequestedBy] = useState("skill-owner");
  const [skillId, setSkillId] = useState("");
  const [version, setVersion] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [feedbackSummary, setFeedbackSummary] = useState("");
  const [testEnvironment, setTestEnvironment] = useState("");
  const [logsUrl, setLogsUrl] = useState("");
  const [riskNote, setRiskNote] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [confirmBeforeSubmit, setConfirmBeforeSubmit] = useState(false);
  const [createdPr, setCreatedPr] = useState("");

  const { run, error, loading } = useGuardedAction();

  const basicInfoComplete = requestedBy.trim() && skillId.trim() && version.trim() && releaseId.trim();
  const evidenceInfoComplete =
    feedbackSummary.trim() &&
    testEnvironment.trim() &&
    logsUrl.trim() &&
    riskNote.trim() &&
    checklistText.trim();
  const isEvidenceComplete = Boolean(basicInfoComplete && evidenceInfoComplete && confirmBeforeSubmit);
  const checklistItems = checklistText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const resetConfirmation = () => {
    setConfirmBeforeSubmit(false);
    setCreatedPr("");
  };

  const submit = async () => {
    const res = await run(() =>
      createPromoteStablePr({
        skillId,
        version,
        releaseId,
        requestedBy,
        isOwner: props.isOwner,
        evidence: {
          feedbackSummary,
          testEnvironment,
          checklist: checklistItems,
          logsUrl,
          decision: "approve",
          riskNote
        }
      })
    );

    if (res) {
      setCreatedPr(res.prTitle);
    }
  };

  if (!props.isOwner) {
    return (
      <section className="panel">
        <h3>晋升 Stable</h3>
        <p className="inline-error state-line">只有所有者可以发起 promote-stable PR。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>晋升 Stable 工作流</h3>
        <p className="panel-subtitle">必须由所有者发起，并附带完整证据材料。</p>
      </div>
      <ul className="progress-list">
        <li className={basicInfoComplete ? "progress-item progress-done" : "progress-item"}>1. 填写晋升信息</li>
        <li className={evidenceInfoComplete ? "progress-item progress-done" : "progress-item"}>2. 证据材料完整</li>
        <li className={confirmBeforeSubmit ? "progress-item progress-done" : "progress-item"}>3. 提交前确认</li>
      </ul>

      <div className="form-step">
        <h4>1. 填写晋升信息</h4>
        <div className="grid-three">
          <label className="field">
            <span>申请人</span>
            <input
              placeholder="requested-by"
              value={requestedBy}
              onChange={(e) => {
                setRequestedBy(e.target.value);
                resetConfirmation();
              }}
            />
          </label>
          <label className="field">
            <span>技能 ID</span>
            <input
              placeholder="skill-id"
              value={skillId}
              onChange={(e) => {
                setSkillId(e.target.value);
                resetConfirmation();
              }}
            />
          </label>
          <label className="field">
            <span>版本号</span>
            <input
              placeholder="1.2.0-beta.1"
              value={version}
              onChange={(e) => {
                setVersion(e.target.value);
                resetConfirmation();
              }}
            />
          </label>
        </div>
        <label className="field">
          <span>发布 ID</span>
          <input
            placeholder="release-id"
            value={releaseId}
            onChange={(e) => {
              setReleaseId(e.target.value);
              resetConfirmation();
            }}
          />
        </label>
      </div>

      <div className="form-step">
        <h4>2. 证据材料</h4>
        <label className="field">
          <span>用户反馈摘要</span>
          <textarea
            placeholder="请描述 beta 阶段反馈结论"
            value={feedbackSummary}
            onChange={(e) => {
              setFeedbackSummary(e.target.value);
              resetConfirmation();
            }}
          />
        </label>
        <label className="field">
          <span>测试环境</span>
          <input
            placeholder="OS/应用/Agent 版本"
            value={testEnvironment}
            onChange={(e) => {
              setTestEnvironment(e.target.value);
              resetConfirmation();
            }}
          />
        </label>
        <label className="field">
          <span>检查项（每行一条）</span>
          <textarea
            placeholder="- 已完成回归测试"
            value={checklistText}
            onChange={(e) => {
              setChecklistText(e.target.value);
              resetConfirmation();
            }}
          />
        </label>
        <label className="field">
          <span>日志链接</span>
          <input
            placeholder="Logs URL"
            value={logsUrl}
            onChange={(e) => {
              setLogsUrl(e.target.value);
              resetConfirmation();
            }}
          />
        </label>
        <label className="field">
          <span>风险说明</span>
          <textarea
            placeholder="潜在风险和回滚方案"
            value={riskNote}
            onChange={(e) => {
              setRiskNote(e.target.value);
              resetConfirmation();
            }}
          />
        </label>
      </div>

      <div className="form-step">
        <h4>3. 提交晋升 PR</h4>
        <div className="confirm-box">
          <p className="confirm-title">提交前确认摘要</p>
          <p className="state-line">
            技能: {skillId || "-"} · 版本: {version || "-"} · 发布 ID: {releaseId || "-"}
          </p>
          <p className="state-line">
            申请人: {requestedBy || "-"} · 检查项数量: {checklistItems.length} · 日志: {logsUrl ? "已填写" : "未填写"}
          </p>
          <p className="state-line">
            测试环境: {testEnvironment || "-"}
          </p>
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={confirmBeforeSubmit}
              onChange={(event) => setConfirmBeforeSubmit(event.target.checked)}
            />
            我已确认以上证据完整且可追溯
          </label>
        </div>
        <div className="action-row">
          <button className="btn btn-primary" disabled={!isEvidenceComplete} onClick={submit}>
            创建 promote-stable PR
          </button>
        </div>
      </div>

      <StatusBanner
        error={error}
        loading={loading}
        successMessage={createdPr ? `PR 已创建: ${createdPr}` : undefined}
      />
    </section>
  );
}
