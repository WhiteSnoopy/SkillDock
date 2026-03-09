import type { CachedSkillRecord, RepoSourceRecord } from "../cache/local-cache-models";
import type { RepoSourceRepository } from "../repositories/repo-source-repository";

export interface SourceSkillFetcher {
  fetchBySource(source: RepoSourceRecord): Promise<CachedSkillRecord[]>;
}

export interface IndexedSkill extends CachedSkillRecord {
  sourceId: string;
}

export interface ReindexSummary {
  indexedSources: number;
  indexedSkills: number;
  failedSources: Array<{ sourceId: string; reason: string }>;
}

export class MarketIndexingService {
  private readonly indexedBySource = new Map<string, IndexedSkill[]>();

  constructor(
    private readonly sourceRepo: RepoSourceRepository,
    private readonly fetcher: SourceSkillFetcher
  ) {}

  async reindexEnabledSources(): Promise<ReindexSummary> {
    const enabledSources = await this.sourceRepo.listEnabled();
    const failedSources: Array<{ sourceId: string; reason: string }> = [];
    let indexedSkills = 0;

    for (const source of enabledSources) {
      try {
        const skills = await this.fetcher.fetchBySource(source);
        const normalized = skills.map((item) => ({ ...item, sourceId: source.id }));
        this.indexedBySource.set(source.id, normalized);
        indexedSkills += normalized.length;
      } catch (error) {
        failedSources.push({
          sourceId: source.id,
          reason: error instanceof Error ? error.message : "unknown"
        });
      }
    }

    return {
      indexedSources: enabledSources.length,
      indexedSkills,
      failedSources
    };
  }

  filterBySources(sourceIds: string[]): IndexedSkill[] {
    const selected = new Set(sourceIds);
    const all = Array.from(this.indexedBySource.entries());

    return all.flatMap(([sourceId, skills]) => {
      if (selected.size > 0 && !selected.has(sourceId)) {
        return [];
      }
      return skills;
    });
  }
}
