import { resolveRequestedChannel, type BetaSubscriptionState } from "./channel-resolution";
import { denyInstall, type InstallDenyResult } from "./install-deny";
import { evaluateInstallPolicy, type TeamPolicyConfig } from "./team-policy-engine";
import { verifyArtifactIntegrity, type ArtifactMetadata, type ProvenanceVerifier } from "./integrity-verifier";
import { canInstallWhileOffline, type VerifiedArtifactStore } from "./offline-install-guard";

export interface InstallRequestInput {
  publisher: string;
  skillId: string;
  version: string;
  platform: "macos" | "windows" | "linux";
  artifact: Buffer;
  artifactMetadata: ArtifactMetadata;
  online: boolean;
  betaSubscription: BetaSubscriptionState;
}

export interface InstallAllowedResult {
  allowed: true;
  channel: "beta" | "stable";
}

export type InstallDecisionResult = InstallAllowedResult | InstallDenyResult;

export class InstallDecisionService {
  constructor(
    private readonly policy: TeamPolicyConfig,
    private readonly verifiedStore: VerifiedArtifactStore,
    private readonly provenanceVerifier?: ProvenanceVerifier
  ) {}

  async decide(input: InstallRequestInput): Promise<InstallDecisionResult> {
    const channel = resolveRequestedChannel(input.skillId, input.betaSubscription);

    const policyDecision = evaluateInstallPolicy(
      {
        publisher: input.publisher,
        skillId: input.skillId,
        version: input.version,
        platform: input.platform,
        channel
      },
      this.policy
    );

    if (!policyDecision.allowed) {
      return denyInstall(
        policyDecision.reason === "explicit_block"
          ? "POLICY_EXPLICIT_BLOCK"
          : "POLICY_DEFAULT_BLOCK",
        "Installation rejected by team policy",
        policyDecision.matchedRuleId ? { ruleId: policyDecision.matchedRuleId } : undefined
      );
    }

    const integrity = await verifyArtifactIntegrity({
      artifactBuffer: input.artifact,
      metadata: input.artifactMetadata,
      provenanceVerifier: this.provenanceVerifier
    });

    if (!integrity.ok) {
      return denyInstall(
        integrity.failedStep === "sha256"
          ? "INTEGRITY_CHECKSUM_FAILED"
          : "INTEGRITY_PROVENANCE_FAILED",
        "Artifact integrity verification failed"
      );
    }

    if (!input.online) {
      const allowedOffline = await canInstallWhileOffline({
        artifactHash: input.artifactMetadata.expectedSha256,
        verifiedStore: this.verifiedStore
      });

      if (!allowedOffline) {
        return denyInstall(
          "OFFLINE_UNVERIFIED_ARTIFACT",
          "Offline install requires previously verified artifact"
        );
      }
    }

    return { allowed: true, channel };
  }
}
