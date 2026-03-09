import type { CachedSkillRecord } from "../cache/local-cache-models";

export interface RegistryChannelsSnapshot {
  skillId: string;
  stable?: string;
  beta?: string;
  updatedAt: string;
}

export interface RegistryReleaseRecord {
  releaseId: string;
  skillId: string;
  version: string;
  targetChannel: "beta" | "stable";
  createdAt: string;
}

export interface RemoteRegistryClient {
  fetchIndex(): Promise<CachedSkillRecord[]>;
  fetchChannels(): Promise<RegistryChannelsSnapshot[]>;
  fetchRecentReleases(limit: number): Promise<RegistryReleaseRecord[]>;
}

export interface LocalCacheWriter {
  upsertSkills(skills: CachedSkillRecord[]): Promise<void>;
  upsertChannels(channels: RegistryChannelsSnapshot[]): Promise<void>;
  upsertReleases(releases: RegistryReleaseRecord[]): Promise<void>;
}

export interface SyncSummary {
  skillCount: number;
  channelCount: number;
  releaseCount: number;
  syncedAt: string;
}

export class RegistrySyncService {
  constructor(
    private readonly remoteClient: RemoteRegistryClient,
    private readonly localCache: LocalCacheWriter
  ) {}

  async syncAuthorityToLocalCache(releaseLimit = 100): Promise<SyncSummary> {
    const [skills, channels, releases] = await Promise.all([
      this.remoteClient.fetchIndex(),
      this.remoteClient.fetchChannels(),
      this.remoteClient.fetchRecentReleases(releaseLimit)
    ]);

    await this.localCache.upsertSkills(skills);
    await this.localCache.upsertChannels(channels);
    await this.localCache.upsertReleases(releases);

    return {
      skillCount: skills.length,
      channelCount: channels.length,
      releaseCount: releases.length,
      syncedAt: new Date().toISOString()
    };
  }
}
