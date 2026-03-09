import type {
  BetaReleaseDryRunResponse,
  BetaReleaseRequest,
  GuardedError,
  InstallSkillRequest,
  InstallSkillResponse,
  InstallLocalSkillForProviderRequest,
  LocalInstalledSkill,
  LocalSkillScanSummary,
  LocalSkillsResponse,
  LocalApiHealth,
  MarketSyncSummary,
  MarketSkill,
  PromoteStableRequest,
  RepoSource,
  SourceHealth,
  SourceReachability
} from "../types/models";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: InvokeFn;
      };
    };
  }
}

const FALLBACK_HEALTH: Record<string, SourceHealth> = {};

function getInvoke(): InvokeFn {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    return async () => {
      throw {
        code: "OFFLINE_BLOCKED",
        message: "Tauri bridge is unavailable"
      } satisfies GuardedError;
    };
  }
  return invoke;
}

function toGuardedError(raw: unknown): GuardedError {
  if (typeof raw === "string") {
    return {
      code: "UNKNOWN",
      message: raw
    };
  }
  if (raw instanceof Error) {
    return {
      code: "UNKNOWN",
      message: raw.message
    };
  }
  const err = raw as Partial<GuardedError> | null | undefined;
  return {
    code: err?.code ?? "UNKNOWN",
    message: err?.message ?? "Unknown desktop bridge error"
  };
}

async function invokeGuarded<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = getInvoke();
  try {
    return await invoke<T>(cmd, args);
  } catch (raw) {
    throw toGuardedError(raw);
  }
}

export async function fetchSources(): Promise<RepoSource[]> {
  return invokeGuarded<RepoSource[]>("list_repo_sources");
}

export async function fetchLocalApiHealth(): Promise<LocalApiHealth> {
  return invokeGuarded<LocalApiHealth>("local_api_health");
}

export async function upsertSource(source: RepoSource): Promise<RepoSource> {
  return invokeGuarded<RepoSource>("upsert_repo_source", { source });
}

export async function deleteSource(sourceId: string): Promise<void> {
  await invokeGuarded<void>("delete_repo_source", { sourceId });
}

export async function checkSourceReachability(source: Pick<RepoSource, "id" | "name" | "repoUrl">): Promise<SourceReachability> {
  return invokeGuarded<SourceReachability>("check_repo_source", { source });
}

export async function syncMarketIndex(sourceIds: string[]): Promise<MarketSyncSummary> {
  return invokeGuarded<MarketSyncSummary>("sync_market_index", { sourceIds });
}

export async function fetchMarketSkills(sourceIds: string[]): Promise<{ skills: MarketSkill[]; sourceHealth: Record<string, SourceHealth> }> {
  const payload = await invokeGuarded<{ skills: MarketSkill[]; sourceHealth?: Record<string, SourceHealth> }>(
    "get_market_skills",
    { sourceIds }
  );
  return {
    skills: payload.skills,
    sourceHealth: payload.sourceHealth ?? FALLBACK_HEALTH
  };
}

export async function installMarketSkill(request: InstallSkillRequest): Promise<InstallSkillResponse> {
  return invokeGuarded<InstallSkillResponse>("install_market_skill", { request });
}

const EMPTY_LOCAL_PROVIDER_COUNTS: LocalSkillsResponse["providers"] = {
  Claude: 0,
  Codex: 0,
  Gemini: 0,
  OpenCode: 0,
  Other: 0
};

function normalizeProvider(raw: unknown): LocalSkillsResponse["skills"][number]["provider"] {
  if (raw === "Claude" || raw === "Codex" || raw === "Gemini" || raw === "OpenCode") {
    return raw;
  }
  return "Other";
}

export async function fetchLocalSkills(): Promise<LocalSkillsResponse> {
  const payload = await invokeGuarded<{ skills?: LocalInstalledSkill[]; providers?: Partial<LocalSkillsResponse["providers"]> }>(
    "list_local_skills"
  );
  const normalizedSkills = (Array.isArray(payload.skills) ? payload.skills : []).map((item) => ({
    ...item,
    provider: normalizeProvider(item?.provider)
  }));

  return {
    skills: normalizedSkills,
    providers: {
      ...EMPTY_LOCAL_PROVIDER_COUNTS,
      ...(payload.providers ?? {})
    }
  };
}

export async function removeLocalSkillRecord(sourceId: string, skillId: string): Promise<void> {
  await invokeGuarded("remove_local_skill_record", { sourceId, skillId });
}

export async function installLocalSkillForProvider(request: InstallLocalSkillForProviderRequest): Promise<LocalInstalledSkill> {
  return invokeGuarded<LocalInstalledSkill>("install_local_skill_for_provider", { request });
}

export async function scanLocalInstalledSkills(): Promise<LocalSkillScanSummary> {
  return invokeGuarded<LocalSkillScanSummary>("scan_local_skills_from_disk");
}

export async function pickSkillFolder(): Promise<string | null> {
  const selected = await invokeGuarded<string | null>("pick_skill_folder");
  if (typeof selected !== "string") return null;
  const normalized = selected.trim();
  return normalized ? normalized : null;
}

export async function createBetaReleasePr(req: BetaReleaseRequest): Promise<{
  prTitle: string;
  prBody: string;
  prUrl?: string;
  repoUrl?: string;
  branch?: string;
  bundlePath?: string;
  bundledFiles?: number;
  changedFiles?: string[];
  warning?: string;
}> {
  return invokeGuarded<{
    prTitle: string;
    prBody: string;
    prUrl?: string;
    repoUrl?: string;
    branch?: string;
    bundlePath?: string;
    bundledFiles?: number;
    changedFiles?: string[];
    warning?: string;
  }>("create_beta_release_pr", { request: req });
}

export async function dryRunBetaRelease(req: BetaReleaseRequest): Promise<BetaReleaseDryRunResponse> {
  return invokeGuarded<BetaReleaseDryRunResponse>("dry_run_beta_release", { request: req });
}

export async function createPromoteStablePr(req: PromoteStableRequest): Promise<{ prTitle: string; prBody: string }> {
  return invokeGuarded<{ prTitle: string; prBody: string }>("create_promote_stable_pr", { request: req });
}
