import { createHash } from "node:crypto";

export interface ArtifactMetadata {
  expectedSha256: string;
  provenance?: string;
}

export interface ProvenanceVerifier {
  verify(provenance: string): Promise<boolean>;
}

export interface IntegrityVerificationResult {
  ok: boolean;
  failedStep?: "sha256" | "provenance";
}

export async function verifyArtifactIntegrity(params: {
  artifactBuffer: Buffer;
  metadata: ArtifactMetadata;
  provenanceVerifier?: ProvenanceVerifier;
}): Promise<IntegrityVerificationResult> {
  const actual = createHash("sha256").update(params.artifactBuffer).digest("hex");
  if (actual !== params.metadata.expectedSha256) {
    return { ok: false, failedStep: "sha256" };
  }

  if (params.metadata.provenance && params.provenanceVerifier) {
    const verified = await params.provenanceVerifier.verify(params.metadata.provenance);
    if (!verified) {
      return { ok: false, failedStep: "provenance" };
    }
  }

  return { ok: true };
}
