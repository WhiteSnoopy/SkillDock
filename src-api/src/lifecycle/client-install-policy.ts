import type { VersionLifecycleRecord } from "./deprecate-revoke-service";

export interface InstallLifecycleDecision {
  allowed: boolean;
  message?: string;
  guidance?: string;
}

export function decideInstallForLifecycle(
  lifecycle: VersionLifecycleRecord | null
): InstallLifecycleDecision {
  if (!lifecycle || lifecycle.state === "active") {
    return { allowed: true };
  }

  if (lifecycle.state === "deprecated") {
    return {
      allowed: true,
      message: lifecycle.reason ?? "This version is deprecated",
      guidance: lifecycle.replacementVersion
        ? `Upgrade to ${lifecycle.replacementVersion}`
        : "Upgrade to a newer version"
    };
  }

  return {
    allowed: false,
    message: lifecycle.reason ?? "This version has been revoked",
    guidance: lifecycle.replacementVersion
      ? `Install ${lifecycle.replacementVersion} instead`
      : "Install the latest stable version"
  };
}
