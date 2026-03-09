import type { RepoSourceRecord } from "../cache/local-cache-models";

export interface RepoSourceRepository {
  listAll(): Promise<RepoSourceRecord[]>;
  listEnabled(): Promise<RepoSourceRecord[]>;
  getById(id: string): Promise<RepoSourceRecord | null>;
  upsert(source: RepoSourceRecord): Promise<void>;
  deleteById(id: string): Promise<void>;
}

export class InMemoryRepoSourceRepository implements RepoSourceRepository {
  private readonly sources = new Map<string, RepoSourceRecord>();

  async listAll(): Promise<RepoSourceRecord[]> {
    return Array.from(this.sources.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  async listEnabled(): Promise<RepoSourceRecord[]> {
    const all = await this.listAll();
    return all.filter((item) => item.enabled);
  }

  async getById(id: string): Promise<RepoSourceRecord | null> {
    return this.sources.get(id) ?? null;
  }

  async upsert(source: RepoSourceRecord): Promise<void> {
    this.sources.set(source.id, source);
  }

  async deleteById(id: string): Promise<void> {
    this.sources.delete(id);
  }
}
