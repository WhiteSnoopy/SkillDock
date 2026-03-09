import type { ReleaseChannel } from "./channel-resolution";

export type PolicyAction = "allow" | "block";

export interface TeamPolicyRule {
  id: string;
  action: PolicyAction;
  publisher?: string;
  skillId?: string;
  versionRange?: string;
  platform?: "macos" | "windows" | "linux";
}

export interface InstallRequest {
  publisher: string;
  skillId: string;
  version: string;
  platform: "macos" | "windows" | "linux";
  channel: ReleaseChannel;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: "explicit_block" | "explicit_allow" | "default";
  matchedRuleId?: string;
}

export interface TeamPolicyConfig {
  defaultMode: "stable-only" | "stable-and-beta";
  rules: TeamPolicyRule[];
}

function isSemver(version: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}

function semverCompare(a: string, b: string): number {
  const parse = (v: string) => v.split("-")[0].split(".").map((n) => Number(n));
  const [am, an, ap] = parse(a);
  const [bm, bn, bp] = parse(b);
  if (am !== bm) return am - bm;
  if (an !== bn) return an - bn;
  return ap - bp;
}

function matchesVersionRange(version: string, range?: string): boolean {
  if (!range || range === "*") return true;
  if (!isSemver(version)) return false;

  if (range.startsWith("^")) {
    const base = range.slice(1);
    if (!isSemver(base)) return false;
    const [major] = base.split(".");
    return version.startsWith(`${major}.`) && semverCompare(version, base) >= 0;
  }

  if (range.startsWith(">=")) {
    const base = range.slice(2);
    return isSemver(base) && semverCompare(version, base) >= 0;
  }

  if (range.startsWith("<=")) {
    const base = range.slice(2);
    return isSemver(base) && semverCompare(version, base) <= 0;
  }

  return range === version;
}

function ruleMatches(rule: TeamPolicyRule, req: InstallRequest): boolean {
  if (rule.publisher && rule.publisher !== req.publisher) return false;
  if (rule.skillId && rule.skillId !== req.skillId) return false;
  if (rule.platform && rule.platform !== req.platform) return false;
  if (!matchesVersionRange(req.version, rule.versionRange)) return false;
  return true;
}

export function evaluateInstallPolicy(
  req: InstallRequest,
  config: TeamPolicyConfig
): PolicyDecision {
  const matchingRules = config.rules.filter((rule) => ruleMatches(rule, req));

  const blockRule = matchingRules.find((rule) => rule.action === "block");
  if (blockRule) {
    return { allowed: false, reason: "explicit_block", matchedRuleId: blockRule.id };
  }

  const allowRule = matchingRules.find((rule) => rule.action === "allow");
  if (allowRule) {
    return { allowed: true, reason: "explicit_allow", matchedRuleId: allowRule.id };
  }

  if (config.defaultMode === "stable-only" && req.channel === "beta") {
    return { allowed: false, reason: "default" };
  }

  return { allowed: true, reason: "default" };
}
