import type { SkillCreatorResult } from "./skill-creator-adapter";

export interface DraftBundle {
  draftId: string;
  skillId: string;
  versionCandidate: string;
  changelogDraft: string;
  files: Array<{ path: string; content: string }>;
  generatedAt: string;
}

export function buildDraftBundle(params: {
  draftId: string;
  versionCandidate: string;
  creatorResult: SkillCreatorResult;
  changelogDraft: string;
  generatedAt?: string;
}): DraftBundle {
  return {
    draftId: params.draftId,
    skillId: params.creatorResult.skillId,
    versionCandidate: params.versionCandidate,
    changelogDraft: params.changelogDraft,
    files: params.creatorResult.files,
    generatedAt: params.generatedAt ?? new Date().toISOString()
  };
}
