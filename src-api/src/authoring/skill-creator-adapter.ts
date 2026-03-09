import type { EmbeddedProviderConfig } from "./provider-gate";

export interface SkillCreatorRequest {
  prompt: string;
  skillId: string;
  targetDir: string;
}

export interface SkillCreatorResult {
  skillId: string;
  files: Array<{ path: string; content: string }>;
  summary: string;
}

export interface SkillCreatorRunner {
  run(params: {
    provider: EmbeddedProviderConfig;
    request: SkillCreatorRequest;
  }): Promise<SkillCreatorResult>;
}

export class SkillCreatorExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillCreatorExecutionError";
  }
}

export class SkillCreatorAdapter {
  constructor(private readonly runner: SkillCreatorRunner) {}

  async execute(params: {
    provider: EmbeddedProviderConfig;
    request: SkillCreatorRequest;
  }): Promise<SkillCreatorResult> {
    try {
      return await this.runner.run(params);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      throw new SkillCreatorExecutionError(
        `Skill creator execution failed (${params.provider.id}): ${reason}`
      );
    }
  }
}
