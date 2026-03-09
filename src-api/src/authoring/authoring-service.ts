import {
  requireConfiguredEmbeddedProvider,
  type EmbeddedProviderConfig
} from "./provider-gate";
import {
  SkillCreatorAdapter,
  type SkillCreatorRequest,
  type SkillCreatorResult
} from "./skill-creator-adapter";
import { buildDraftBundle, type DraftBundle } from "./draft-bundle";
import { validateDraftBundle, type DraftValidationResult } from "./draft-validator";
import { buildReleaseDryRunPreview, type ReleaseDryRunPreview } from "./release-dry-run";

export class AuthoringService {
  constructor(private readonly skillCreator: SkillCreatorAdapter) {}

  async generateDraft(params: {
    providers: EmbeddedProviderConfig[];
    preferredProviderId?: string;
    request: SkillCreatorRequest;
    draftId: string;
    versionCandidate: string;
    changelogDraft: string;
  }): Promise<{ draft: DraftBundle; validation: DraftValidationResult; creator: SkillCreatorResult }> {
    const provider = requireConfiguredEmbeddedProvider(
      params.providers,
      params.preferredProviderId
    );

    const creator = await this.skillCreator.execute({
      provider,
      request: params.request
    });

    const draft = buildDraftBundle({
      draftId: params.draftId,
      versionCandidate: params.versionCandidate,
      creatorResult: creator,
      changelogDraft: params.changelogDraft
    });

    return {
      draft,
      validation: validateDraftBundle(draft),
      creator
    };
  }

  previewReleaseDryRun(
    draft: DraftBundle,
    existingPaths: string[] = []
  ): ReleaseDryRunPreview {
    return buildReleaseDryRunPreview(draft, existingPaths);
  }
}
