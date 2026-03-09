import type { DraftBundle } from "./draft-bundle";

export interface DraftValidationIssue {
  field: string;
  message: string;
}

export interface DraftValidationResult {
  valid: boolean;
  issues: DraftValidationIssue[];
}

function isSemverCandidate(version: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}

export function validateDraftBundle(bundle: DraftBundle): DraftValidationResult {
  const issues: DraftValidationIssue[] = [];

  if (!bundle.skillId.match(/^[a-z0-9-]+$/)) {
    issues.push({
      field: "skillId",
      message: "skillId must use lowercase letters, numbers, and hyphens"
    });
  }

  if (!isSemverCandidate(bundle.versionCandidate)) {
    issues.push({
      field: "versionCandidate",
      message: "versionCandidate must be a valid semantic version"
    });
  }

  if (!bundle.changelogDraft.trim()) {
    issues.push({
      field: "changelogDraft",
      message: "changelogDraft must not be empty"
    });
  }

  if (bundle.files.length === 0) {
    issues.push({
      field: "files",
      message: "draft must include at least one generated file"
    });
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
