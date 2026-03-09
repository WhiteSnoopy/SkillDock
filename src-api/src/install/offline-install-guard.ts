export interface VerifiedArtifactStore {
  hasVerifiedArtifact(artifactHash: string): Promise<boolean>;
}

export async function canInstallWhileOffline(params: {
  artifactHash: string;
  verifiedStore: VerifiedArtifactStore;
}): Promise<boolean> {
  return params.verifiedStore.hasVerifiedArtifact(params.artifactHash);
}
