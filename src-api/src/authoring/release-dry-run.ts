import type { DraftBundle } from "./draft-bundle";

export interface ReleaseDryRunPreview {
  skillId: string;
  versionCandidate: string;
  changedFiles: string[];
  changelogDelta: string;
}

export function buildReleaseDryRunPreview(
  draft: DraftBundle,
  existingPaths: string[] = []
): ReleaseDryRunPreview {
  const existingSet = new Set(existingPaths);
  const changedFiles = draft.files
    .map((item) => item.path)
    .filter((path) => !existingSet.has(path));

  return {
    skillId: draft.skillId,
    versionCandidate: draft.versionCandidate,
    changedFiles,
    changelogDelta: draft.changelogDraft
  };
}
