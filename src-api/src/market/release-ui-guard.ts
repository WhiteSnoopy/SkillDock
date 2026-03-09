export interface ReleaseActionAvailability {
  canCreateBetaReleasePr: boolean;
  canCreatePromoteStablePr: boolean;
  canDirectPublishStable: boolean;
}

export function resolveReleaseActionAvailability(params: {
  isOwner: boolean;
  online: boolean;
}): ReleaseActionAvailability {
  return {
    canCreateBetaReleasePr: params.online,
    canCreatePromoteStablePr: params.online && params.isOwner,
    canDirectPublishStable: false
  };
}
