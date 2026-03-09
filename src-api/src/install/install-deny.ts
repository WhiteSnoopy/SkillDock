export type InstallDenyReasonCode =
  | "POLICY_EXPLICIT_BLOCK"
  | "POLICY_DEFAULT_BLOCK"
  | "OFFLINE_UNVERIFIED_ARTIFACT"
  | "INTEGRITY_CHECKSUM_FAILED"
  | "INTEGRITY_PROVENANCE_FAILED"
  | "CHANNEL_NOT_ALLOWED";

export interface InstallDenyResult {
  allowed: false;
  reasonCode: InstallDenyReasonCode;
  message: string;
  metadata?: Record<string, string>;
}

export function denyInstall(
  reasonCode: InstallDenyReasonCode,
  message: string,
  metadata?: Record<string, string>
): InstallDenyResult {
  return {
    allowed: false,
    reasonCode,
    message,
    metadata
  };
}
