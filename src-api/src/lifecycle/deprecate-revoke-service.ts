export type ReleaseLifecycleState = "active" | "deprecated" | "revoked";

export interface VersionLifecycleRecord {
  skillId: string;
  version: string;
  state: ReleaseLifecycleState;
  reason?: string;
  replacementVersion?: string;
  updatedAt: string;
}

export interface VersionLifecycleStore {
  get(skillId: string, version: string): Promise<VersionLifecycleRecord | null>;
  upsert(record: VersionLifecycleRecord): Promise<void>;
}

export class VersionLifecycleService {
  constructor(private readonly store: VersionLifecycleStore) {}

  async deprecate(params: {
    skillId: string;
    version: string;
    reason: string;
    replacementVersion?: string;
    now?: string;
  }): Promise<VersionLifecycleRecord> {
    const now = params.now ?? new Date().toISOString();
    const next: VersionLifecycleRecord = {
      skillId: params.skillId,
      version: params.version,
      state: "deprecated",
      reason: params.reason,
      replacementVersion: params.replacementVersion,
      updatedAt: now
    };

    await this.store.upsert(next);
    return next;
  }

  async revoke(params: {
    skillId: string;
    version: string;
    reason: string;
    replacementVersion?: string;
    now?: string;
  }): Promise<VersionLifecycleRecord> {
    const now = params.now ?? new Date().toISOString();
    const next: VersionLifecycleRecord = {
      skillId: params.skillId,
      version: params.version,
      state: "revoked",
      reason: params.reason,
      replacementVersion: params.replacementVersion,
      updatedAt: now
    };

    await this.store.upsert(next);
    return next;
  }
}
