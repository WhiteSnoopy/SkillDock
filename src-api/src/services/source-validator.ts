export interface RepoSourceInput {
  id: string;
  name: string;
  repoUrl: string;
}

export interface SourceReachabilityChecker {
  check(url: string): Promise<boolean>;
}

export class InvalidRepoSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRepoSourceError";
  }
}

export class UnreachableRepoSourceError extends Error {
  constructor(url: string) {
    super(`Repository source is unreachable: ${url}`);
    this.name = "UnreachableRepoSourceError";
  }
}

export function validateRepoSourceInput(input: RepoSourceInput): void {
  if (!input.id.match(/^[a-z0-9-]+$/)) {
    throw new InvalidRepoSourceError(
      "Source id must use lowercase letters, numbers, and hyphens"
    );
  }

  if (!input.name.trim()) {
    throw new InvalidRepoSourceError("Source name must not be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.repoUrl);
  } catch {
    throw new InvalidRepoSourceError("Source URL is invalid");
  }

  if (!["https:"].includes(parsed.protocol)) {
    throw new InvalidRepoSourceError("Source URL must use HTTPS");
  }
}

export async function assertSourceReachable(
  input: RepoSourceInput,
  checker: SourceReachabilityChecker
): Promise<void> {
  const reachable = await checker.check(input.repoUrl);
  if (!reachable) {
    throw new UnreachableRepoSourceError(input.repoUrl);
  }
}

export class StaticReachabilityChecker implements SourceReachabilityChecker {
  constructor(private readonly reachable = true) {}

  async check(): Promise<boolean> {
    return this.reachable;
  }
}
