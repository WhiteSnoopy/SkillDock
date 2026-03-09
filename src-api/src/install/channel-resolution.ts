export type ReleaseChannel = "beta" | "stable";

export interface BetaSubscriptionState {
  globalBetaEnabled: boolean;
  skillScopedBetaEnabled: Record<string, boolean>;
}

export function resolveRequestedChannel(
  skillId: string,
  state: BetaSubscriptionState
): ReleaseChannel {
  const skillOptIn = state.skillScopedBetaEnabled[skillId] === true;
  if (state.globalBetaEnabled || skillOptIn) {
    return "beta";
  }
  return "stable";
}
