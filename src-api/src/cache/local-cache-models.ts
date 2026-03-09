export type ISO8601 = string;

export interface CachedSkillRecord {
  skillId: string;
  publisher: string;
  name: string;
  description?: string;
  stableVersion?: string;
  betaVersion?: string;
  sourceRepo: string;
  sourceRef: string;
  updatedAt: ISO8601;
}

export interface RepoSourceRecord {
  id: string;
  name: string;
  repoUrl: string;
  curated: boolean;
  enabled: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface InstallationRecord {
  id: string;
  skillId: string;
  installedVersion: string;
  channel: "beta" | "stable";
  artifactHash: string;
  installedAt: ISO8601;
  verificationState: "verified" | "failed";
}

export interface LocalDraftRecord {
  id: string;
  skillId: string;
  versionCandidate: string;
  changelogDraft: string;
  draftPath: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export const CACHE_TABLES_SQL = {
  skills: `
CREATE TABLE IF NOT EXISTS cache_skills (
  skill_id TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  stable_version TEXT,
  beta_version TEXT,
  source_repo TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
  repoSources: `
CREATE TABLE IF NOT EXISTS cache_repo_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  curated INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
  installations: `
CREATE TABLE IF NOT EXISTS cache_installations (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  installed_version TEXT NOT NULL,
  channel TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  verification_state TEXT NOT NULL
);`,
  drafts: `
CREATE TABLE IF NOT EXISTS local_drafts (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version_candidate TEXT NOT NULL,
  changelog_draft TEXT NOT NULL,
  draft_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`
} as const;
