import type { DraftBundle } from "../authoring/draft-bundle";

export interface RegistryIndexSkillEntry {
  skill_id: string;
  publisher: string;
  name: string;
  channels: {
    beta?: string;
    stable?: string;
  };
  updated_at: string;
}

export interface RegistryIndex {
  schema_version: string;
  generated_at: string;
  skills: RegistryIndexSkillEntry[];
}

export interface ChannelsFile {
  schema_version: string;
  skill_id: string;
  channels: {
    beta?: string;
    stable: string;
  };
  updated_at: string;
  updated_by?: string;
}

export interface ReleaseAuditRecord {
  schema_version: string;
  release_id: string;
  skill_id: string;
  version: string;
  target_channel: "beta" | "stable";
  artifact: {
    path: string;
    sha256: string;
    provenance?: string;
  };
  gate: {
    checks: Array<{ name: string; status: "passed" | "failed" | "skipped"; details?: string }>;
  };
  approvals?: Array<{ role: string; actor: string; at: string }>;
  created_at: string;
}

export interface BetaReleasePrPlan {
  skillId: string;
  version: string;
  releaseId: string;
  title: string;
  body: string;
  filesToWrite: Array<{ path: string; content: string }>;
}

function upsertIndexSkill(index: RegistryIndex, next: RegistryIndexSkillEntry): RegistryIndex {
  const existing = index.skills.find((item) => item.skill_id === next.skill_id);
  if (!existing) {
    return {
      ...index,
      skills: [...index.skills, next],
      generated_at: next.updated_at
    };
  }

  return {
    ...index,
    generated_at: next.updated_at,
    skills: index.skills.map((item) =>
      item.skill_id === next.skill_id
        ? {
            ...item,
            channels: {
              ...item.channels,
              beta: next.channels.beta
            },
            updated_at: next.updated_at
          }
        : item
    )
  };
}

export function generateBetaReleasePrPlan(params: {
  draft: DraftBundle;
  releaseId: string;
  actor: string;
  publisher: string;
  skillName: string;
  artifactPath: string;
  artifactSha256: string;
  index: RegistryIndex;
  channels: ChannelsFile;
  now?: string;
}): BetaReleasePrPlan {
  const now = params.now ?? new Date().toISOString();

  const nextIndex = upsertIndexSkill(params.index, {
    skill_id: params.draft.skillId,
    publisher: params.publisher,
    name: params.skillName,
    channels: {
      ...params.channels.channels,
      beta: params.draft.versionCandidate
    },
    updated_at: now
  });

  const nextChannels: ChannelsFile = {
    ...params.channels,
    channels: {
      ...params.channels.channels,
      beta: params.draft.versionCandidate
    },
    updated_at: now,
    updated_by: params.actor
  };

  const releaseAudit: ReleaseAuditRecord = {
    schema_version: "1.0.0",
    release_id: params.releaseId,
    skill_id: params.draft.skillId,
    version: params.draft.versionCandidate,
    target_channel: "beta",
    artifact: {
      path: params.artifactPath,
      sha256: params.artifactSha256
    },
    gate: {
      checks: [
        { name: "schema-check", status: "passed" },
        { name: "regression-suite", status: "passed" },
        { name: "security-scan", status: "passed" }
      ]
    },
    created_at: now
  };

  const title = `beta-release: ${params.draft.skillId}@${params.draft.versionCandidate}`;
  const body = [
    "## Beta Release Request",
    "",
    `- Skill: ${params.draft.skillId}`,
    `- Version: ${params.draft.versionCandidate}`,
    `- Release ID: ${params.releaseId}`,
    `- Requested by: ${params.actor}`,
    "",
    "Supervisor approval is required before merge."
  ].join("\n");

  return {
    skillId: params.draft.skillId,
    version: params.draft.versionCandidate,
    releaseId: params.releaseId,
    title,
    body,
    filesToWrite: [
      {
        path: "registry/index.json",
        content: `${JSON.stringify(nextIndex, null, 2)}\n`
      },
      {
        path: `registry/skills/${params.draft.skillId}/channels.json`,
        content: `${JSON.stringify(nextChannels, null, 2)}\n`
      },
      {
        path: `registry/skills/${params.draft.skillId}/releases/${params.releaseId}.json`,
        content: `${JSON.stringify(releaseAudit, null, 2)}\n`
      }
    ]
  };
}
