export interface SkillOwnerRegistry {
  getOwner(skillId: string): Promise<string | null>;
}

export interface PromoteEvidence {
  skillId: string;
  version: string;
  artifactHash: string;
  feedbackSummary: string;
  testEnvironment: string;
  checklist: string[];
  logsUrl: string;
  decision: "approve" | "reject";
  riskNote: string;
}

export interface PromoteStableRequest {
  skillId: string;
  version: string;
  releaseId: string;
  requestedBy: string;
  supervisor: string;
  evidence: PromoteEvidence;
  now?: string;
}

export interface PromoteStablePrPlan {
  title: string;
  body: string;
  filesToWrite: Array<{ path: string; content: string }>;
}

export class PromoteStableAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoteStableAccessError";
  }
}

export class PromoteEvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoteEvidenceValidationError";
  }
}

function validateEvidence(evidence: PromoteEvidence): void {
  const missing: string[] = [];
  if (!evidence.feedbackSummary.trim()) missing.push("feedbackSummary");
  if (!evidence.testEnvironment.trim()) missing.push("testEnvironment");
  if (!evidence.checklist.length) missing.push("checklist");
  if (!evidence.logsUrl.trim()) missing.push("logsUrl");
  if (!evidence.riskNote.trim()) missing.push("riskNote");

  if (missing.length > 0) {
    throw new PromoteEvidenceValidationError(
      `Promotion evidence missing required fields: ${missing.join(", ")}`
    );
  }
}

export class PromoteStableService {
  constructor(private readonly ownerRegistry: SkillOwnerRegistry) {}

  async createPromoteStablePrPlan(
    req: PromoteStableRequest
  ): Promise<PromoteStablePrPlan> {
    const owner = await this.ownerRegistry.getOwner(req.skillId);
    if (!owner) {
      throw new PromoteStableAccessError(`Owner not configured for ${req.skillId}`);
    }

    if (owner !== req.requestedBy) {
      throw new PromoteStableAccessError(
        `Only owner can initiate stable promotion for ${req.skillId}`
      );
    }

    validateEvidence(req.evidence);

    const now = req.now ?? new Date().toISOString();
    const title = `promote-stable: ${req.skillId}@${req.version}`;
    const body = [
      "## Stable Promotion Request",
      "",
      `- Skill: ${req.skillId}`,
      `- Version: ${req.version}`,
      `- Release ID: ${req.releaseId}`,
      `- Requested by: ${req.requestedBy}`,
      `- Supervisor: ${req.supervisor}`,
      "",
      "### Evidence",
      `- Feedback summary: ${req.evidence.feedbackSummary}`,
      `- Test environment: ${req.evidence.testEnvironment}`,
      `- Checklist items: ${req.evidence.checklist.length}`,
      `- Logs: ${req.evidence.logsUrl}`,
      `- Decision: ${req.evidence.decision}`,
      `- Risk note: ${req.evidence.riskNote}`
    ].join("\n");

    return {
      title,
      body,
      filesToWrite: [
        {
          path: `registry/skills/${req.skillId}/promotions/${req.releaseId}.json`,
          content: `${JSON.stringify(
            {
              schema_version: "1.0.0",
              skill_id: req.skillId,
              version: req.version,
              release_id: req.releaseId,
              requested_by: req.requestedBy,
              supervisor: req.supervisor,
              evidence: req.evidence,
              requested_at: now
            },
            null,
            2
          )}\n`
        }
      ]
    };
  }
}
