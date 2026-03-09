export interface PublishedVersionRepository {
  exists(skillId: string, version: string): Promise<boolean>;
}

export class ImmutableVersionViolationError extends Error {
  constructor(skillId: string, version: string) {
    super(`Version already exists and is immutable: ${skillId}@${version}`);
    this.name = "ImmutableVersionViolationError";
  }
}

export async function assertVersionNotPublished(params: {
  skillId: string;
  version: string;
  repository: PublishedVersionRepository;
}): Promise<void> {
  const exists = await params.repository.exists(params.skillId, params.version);
  if (exists) {
    throw new ImmutableVersionViolationError(params.skillId, params.version);
  }
}
