export type SourceHealth = "unknown" | "healthy" | "degraded" | "unreachable";

export interface RepoSource {
  id: string;
  name: string;
  repoUrl: string;
  description?: string;
  repoBranch?: string;
  skillsPath?: string;
  curated: boolean;
  enabled: boolean;
}

export interface GeneralSettings {
  teamRepoUrl: string;
}

export interface SourceReachability {
  reachable: boolean;
  reason?: string;
}

export interface LocalApiHealth {
  status: "ok" | "degraded" | "error";
  ready: boolean;
}

export interface MarketSkill {
  skillId: string;
  name: string;
  publisher: string;
  stableVersion?: string;
  betaVersion?: string;
  sourceId: string;
  sourceHealth: SourceHealth;
  description?: string;
}

export interface InstallSkillRequest {
  skillId: string;
  sourceId: string;
  channel: "stable" | "beta";
}

export interface InstallSkillResponse {
  skillId: string;
  sourceId: string;
  channel: "stable" | "beta";
  installedVersion: string;
  status: "queued" | "installed";
}

export type LocalSkillProvider = "Claude" | "Codex" | "Cursor" | "Gemini" | "OpenCode" | "Other";
export type LocalSkillInstallProvider = "Claude" | "Codex" | "Cursor";

export interface LocalInstalledSkill {
  sourceId: string;
  skillId: string;
  name: string;
  publisher?: string;
  description?: string;
  provider: LocalSkillProvider;
  channel: "stable" | "beta";
  installedVersion: string;
  installName: string;
  installBranch?: string;
  installedAt?: string;
  ssotPath?: string;
  targetPath?: string;
}

export interface LocalSkillsResponse {
  skills: LocalInstalledSkill[];
  providers: Record<LocalSkillProvider, number>;
}

export interface LocalSkillScanSummary {
  scanned: number;
  added: number;
  total: number;
}

export interface InstallLocalSkillForProviderRequest {
  targetProvider: LocalSkillInstallProvider;
  seedSourceId: string;
  seedSkillId: string;
  skillId?: string;
  name?: string;
  publisher?: string;
  description?: string;
  installName?: string;
}

export interface BetaReleaseRequest {
  skillId?: string;
  version: string;
  releaseId?: string;
  skillPath: string;
  requestedBy?: string;
}

export type BetaReleaseChecklistStatus = "passed" | "warning" | "failed" | "pending";

export interface BetaReleaseChecklistItem {
  id: string;
  title: string;
  status: BetaReleaseChecklistStatus;
  detail?: string;
}

export interface BetaReleaseDryRunResponse {
  changedFiles: string[];
  changelogDelta: string;
  checklist?: BetaReleaseChecklistItem[];
}

export interface PromoteStableEvidence {
  feedbackSummary: string;
  testEnvironment: string;
  checklist: string[];
  logsUrl: string;
  decision: "approve" | "reject";
  riskNote: string;
}

export interface PromoteStableRequest {
  skillId: string;
  version: string;
  releaseId: string;
  requestedBy: string;
  isOwner: boolean;
  evidence: PromoteStableEvidence;
}

export interface MarketSyncSummary {
  indexedSources: number;
  indexedSkills: number;
  failedSources: Array<{ sourceId: string; reason: string }>;
}

export interface GuardedError {
  code:
    | "OFFLINE_BLOCKED"
    | "OWNER_ONLY"
    | "SUPERVISOR_APPROVAL_REQUIRED"
    | "UNREACHABLE_SOURCE"
    | "NETWORK_ERROR"
    | "VALIDATION_ERROR"
    | "UNKNOWN";
  message: string;
}
