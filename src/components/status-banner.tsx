import type { GuardedError } from "../types/models";

type Locale = "zh" | "en";

function buildActionHint(error: GuardedError, locale: Locale): string | null {
  switch (error.code) {
    case "OFFLINE_BLOCKED":
      return locale === "zh"
        ? "请恢复网络连接后重试远端发布操作。"
        : "Reconnect to the network and retry the remote release action.";
    case "OWNER_ONLY":
      return locale === "zh"
        ? "请使用所有者账号执行该发布操作。"
        : "Use an owner account to run this release action.";
    case "UNREACHABLE_SOURCE":
      return locale === "zh"
        ? "请检查仓库地址与访问权限。"
        : "Check the repository URL and access permissions.";
    case "VALIDATION_ERROR":
      return locale === "zh"
        ? "请补全必填项后重试。"
        : "Complete the required fields and try again.";
    default:
      return null;
  }
}

export function StatusBanner(props: {
  error: GuardedError | null;
  loading?: boolean;
  successMessage?: string;
  locale?: Locale;
}) {
  const locale = props.locale ?? "zh";

  if (props.loading) {
    return <div className="status status-loading">{locale === "zh" ? "处理中..." : "Processing..."}</div>;
  }

  if (props.error) {
    const actionHint = buildActionHint(props.error, locale);
    return (
      <div className="status status-error">
        <strong>{props.error.code}</strong>: {props.error.message}
        {actionHint ? <div>{actionHint}</div> : null}
      </div>
    );
  }

  if (props.successMessage) {
    return <div className="status status-success">{props.successMessage}</div>;
  }

  return null;
}
