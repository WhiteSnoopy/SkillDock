import type { RepoSourceRecord } from "../cache/local-cache-models";
import type { RepoSourceRepository } from "../repositories/repo-source-repository";
import {
  assertSourceReachable,
  type RepoSourceInput,
  type SourceReachabilityChecker,
  validateRepoSourceInput
} from "./source-validator";

export const DEFAULT_CURATED_SOURCES: ReadonlyArray<Omit<RepoSourceRecord, "createdAt" | "updatedAt">> = [
  {
    id: "official-market",
    name: "Official Market",
    repoUrl: "https://github.com/example/official-skills",
    curated: true,
    enabled: true
  },
  {
    id: "community-top",
    name: "Community Top Skills",
    repoUrl: "https://github.com/example/community-skills",
    curated: true,
    enabled: true
  }
];

export class RepoSourceService {
  constructor(
    private readonly repo: RepoSourceRepository,
    private readonly reachabilityChecker: SourceReachabilityChecker
  ) {}

  async bootstrapCuratedSources(now = new Date().toISOString()): Promise<number> {
    let created = 0;

    for (const source of DEFAULT_CURATED_SOURCES) {
      const exists = await this.repo.getById(source.id);
      if (exists) {
        continue;
      }
      await this.repo.upsert({ ...source, createdAt: now, updatedAt: now });
      created += 1;
    }

    return created;
  }

  async createCustomSource(
    input: RepoSourceInput,
    now = new Date().toISOString()
  ): Promise<RepoSourceRecord> {
    validateRepoSourceInput(input);
    await assertSourceReachable(input, this.reachabilityChecker);

    const existing = await this.repo.getById(input.id);
    if (existing) {
      throw new Error(`Source already exists: ${input.id}`);
    }

    const source: RepoSourceRecord = {
      id: input.id,
      name: input.name,
      repoUrl: input.repoUrl,
      curated: false,
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    await this.repo.upsert(source);
    return source;
  }

  async updateSource(
    id: string,
    patch: Partial<Pick<RepoSourceRecord, "name" | "repoUrl" | "enabled">>,
    now = new Date().toISOString()
  ): Promise<RepoSourceRecord> {
    const current = await this.repo.getById(id);
    if (!current) {
      throw new Error(`Source not found: ${id}`);
    }

    const next: RepoSourceRecord = {
      ...current,
      ...patch,
      updatedAt: now
    };

    validateRepoSourceInput({ id: next.id, name: next.name, repoUrl: next.repoUrl });
    if (patch.repoUrl) {
      await assertSourceReachable(
        { id: next.id, name: next.name, repoUrl: next.repoUrl },
        this.reachabilityChecker
      );
    }

    await this.repo.upsert(next);
    return next;
  }

  async removeSource(id: string): Promise<void> {
    const source = await this.repo.getById(id);
    if (!source) {
      return;
    }

    if (source.curated) {
      throw new Error(`Curated source cannot be removed: ${id}`);
    }

    await this.repo.deleteById(id);
  }

  async listSources(includeDisabled = true): Promise<RepoSourceRecord[]> {
    if (includeDisabled) {
      return this.repo.listAll();
    }
    return this.repo.listEnabled();
  }
}
