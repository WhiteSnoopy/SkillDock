import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { access, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "2027" },
    host: { type: "string", default: "127.0.0.1" }
  }
});

const port = Number(values.port);
const host = values.host;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const PERSIST_DIR = path.join(PROJECT_ROOT, ".runtime", "desktop-stack", "local-api");
const SOURCES_STATE_FILE = path.join(PERSIST_DIR, "sources.json");
const INSTALLATIONS_STATE_FILE = path.join(PERSIST_DIR, "installations.json");
const GENERAL_SETTINGS_STATE_FILE = path.join(PERSIST_DIR, "general-settings.json");
const SKILLS_SSOT_DIR = process.env.SkillDock_SKILLS_SSOT_DIR || path.join(os.homedir(), ".skilldock-skill-agent", "skills");
const SKILLS_TARGET_DIR = process.env.SkillDock_SKILLS_TARGET_DIR || path.join(os.homedir(), ".codex", "skills");
const DEFAULT_RELEASE_REPO_URL = process.env.SkillDock_RELEASE_REPO_URL || "https://github.com/WhiteSnoopy/Skill-Manage";
const DEFAULT_RELEASE_REPO_BRANCH = process.env.SkillDock_RELEASE_REPO_BRANCH || "main";
const RELEASE_REPO_DIR = process.env.SkillDock_RELEASE_REPO_DIR || path.join(PERSIST_DIR, "release-repo");
const RELEASE_GITHUB_TOKEN = String(
  process.env.SkillDock_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ""
).trim();
const DEFAULT_GENERAL_SETTINGS = Object.freeze({
  teamRepoUrl: DEFAULT_RELEASE_REPO_URL
});

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid port: ${values.port}`);
}

let offline = false;
const sources = [];
const skillsBySource = {};
const sourceHealthById = {};
const installations = {};
const generalSettings = {
  ...DEFAULT_GENERAL_SETTINGS
};
const GITHUB_USER_AGENT = "skilldock-skill-agent-local-api";
const execFileAsync = promisify(execFile);
let releaseMutationQueue = Promise.resolve();

function normalizeSourcePayload(source) {
  if (!source || typeof source !== "object") return null;
  if (!source.id || !source.name || !source.repoUrl) return null;
  return {
    id: String(source.id),
    name: String(source.name),
    repoUrl: String(source.repoUrl),
    description: normalizeOptionalDescription(source.description),
    repoBranch: normalizeOptionalBranch(source.repoBranch),
    skillsPath: normalizeOptionalSkillsPath(source.skillsPath),
    curated: Boolean(source.curated),
    enabled: source.enabled !== false
  };
}

function normalizeGeneralSettingsPayload(rawSettings) {
  if (!rawSettings || typeof rawSettings !== "object") return null;
  return {
    teamRepoUrl: String(rawSettings.teamRepoUrl ?? "").trim()
  };
}

async function loadPersistedSources() {
  try {
    const raw = await readFile(SOURCES_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const persisted = Array.isArray(parsed?.sources) ? parsed.sources : [];
    const normalized = persisted
      .map((item) => normalizeSourcePayload(item))
      .filter(Boolean);

    sources.splice(0, sources.length, ...normalized);
    for (const source of sources) {
      sourceHealthById[source.id] = sourceHealthById[source.id] ?? "unknown";
    }
    console.log(`[local-api] loaded ${sources.length} persisted source(s)`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("[local-api] failed to load persisted sources:", error?.message ?? error);
    }
  }
}

async function persistSources() {
  await mkdir(PERSIST_DIR, { recursive: true });
  await writeFile(
    SOURCES_STATE_FILE,
    `${JSON.stringify({ sources }, null, 2)}\n`,
    "utf8"
  );
}

async function loadPersistedGeneralSettings() {
  try {
    const raw = await readFile(GENERAL_SETTINGS_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeGeneralSettingsPayload(parsed?.settings ?? parsed);
    if (!normalized?.teamRepoUrl) {
      return;
    }
    if (!isHttpsUrl(normalized.teamRepoUrl)) {
      console.warn("[local-api] ignored persisted general settings: teamRepoUrl must use HTTPS");
      return;
    }
    try {
      parseGithubRepoUrl(normalized.teamRepoUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[local-api] ignored persisted general settings: ${detail}`);
      return;
    }
    generalSettings.teamRepoUrl = normalized.teamRepoUrl;
    console.log("[local-api] loaded persisted general settings");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("[local-api] failed to load persisted general settings:", error?.message ?? error);
    }
  }
}

async function persistGeneralSettings() {
  await mkdir(PERSIST_DIR, { recursive: true });
  await writeFile(
    GENERAL_SETTINGS_STATE_FILE,
    `${JSON.stringify({ settings: generalSettings }, null, 2)}\n`,
    "utf8"
  );
}

function getReleaseRepoConfig() {
  const repoUrl = String(generalSettings.teamRepoUrl ?? "").trim() || DEFAULT_RELEASE_REPO_URL;
  return {
    repoUrl,
    repoBranch: DEFAULT_RELEASE_REPO_BRANCH
  };
}

async function loadPersistedInstallations() {
  try {
    const raw = await readFile(INSTALLATIONS_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const records = parsed?.installations;
    if (!records || typeof records !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(records)) {
      if (value && typeof value === "object") {
        installations[key] = value;
      }
    }
    console.log(`[local-api] loaded ${Object.keys(installations).length} persisted installation(s)`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("[local-api] failed to load persisted installations:", error?.message ?? error);
    }
  }
}

async function persistInstallations() {
  await mkdir(PERSIST_DIR, { recursive: true });
  await writeFile(
    INSTALLATIONS_STATE_FILE,
    `${JSON.stringify({ installations }, null, 2)}\n`,
    "utf8"
  );
}

function resolveEffectiveSourceIds(sourceIds) {
  if (sourceIds.length > 0) {
    return sourceIds;
  }
  return sources.filter((item) => item.enabled !== false).map((item) => item.id);
}

function normalizePath(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function normalizeOptionalBranch(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeOptionalDescription(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeOptionalSkillsPath(value) {
  const normalized = normalizePath(value);
  return normalized || undefined;
}

function inferProviderFromSkill(skill) {
  const text = [
    skill?.skillId,
    skill?.name,
    skill?.publisher,
    skill?.description
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("claude") || text.includes("anthropic")) return "Claude";
  if (text.includes("codex") || text.includes("openai")) return "Codex";
  if (text.includes("gemini") || text.includes("google")) return "Gemini";
  if (text.includes("opencode")) return "OpenCode";
  return "Other";
}

function summarizeProviders(list) {
  const providers = {
    Claude: 0,
    Codex: 0,
    Gemini: 0,
    OpenCode: 0,
    Other: 0
  };
  for (const item of list) {
    const key = ["Claude", "Codex", "Gemini", "OpenCode"].includes(item.provider)
      ? item.provider
      : "Other";
    providers[key] += 1;
  }
  return providers;
}

function isManagedLocalRecord(record) {
  const sourceId = String(record?.sourceId ?? "");
  const publisher = String(record?.publisher ?? "");
  const channel = String(record?.channel ?? "");
  return sourceId.startsWith("local-") && publisher === "local" && channel === "stable";
}

function isPathWithinRoots(value, roots) {
  if (!value) return false;
  const absolute = path.resolve(String(value));
  return roots.some((root) => absolute === root || absolute.startsWith(`${root}${path.sep}`));
}

function isVisibleSkillPath(value, roots) {
  if (!value) return false;
  const absolute = path.resolve(String(value));
  const ignoredDirNames = new Set([".git", ".svn", "node_modules"]);
  for (const root of roots) {
    if (absolute === root || absolute.startsWith(`${root}${path.sep}`)) {
      const relative = normalizePath(path.relative(root, absolute));
      if (!relative) return true;
      const segments = relative.split("/").filter(Boolean);
      return !segments.some((segment) => ignoredDirNames.has(segment));
    }
  }
  return false;
}

function pruneUnsupportedLocalInstallations(targets) {
  const allowedSourceIds = new Set(targets.map((item) => item.sourceId));
  const allowedRoots = targets.map((item) => path.resolve(item.dir));
  let deletedCount = 0;

  for (const key of Object.keys(installations)) {
    const record = installations[key];
    if (!isManagedLocalRecord(record)) continue;

    const sourceId = String(record?.sourceId ?? "");
    const hasTrackedPath = Boolean(record?.targetPath || record?.ssotPath);
    const pathAllowed =
      !hasTrackedPath ||
      isPathWithinRoots(record?.targetPath, allowedRoots) ||
      isPathWithinRoots(record?.ssotPath, allowedRoots);
    const pathVisible =
      !hasTrackedPath ||
      isVisibleSkillPath(record?.targetPath, allowedRoots) ||
      isVisibleSkillPath(record?.ssotPath, allowedRoots);

    if (!allowedSourceIds.has(sourceId) || !pathAllowed || !pathVisible) {
      delete installations[key];
      deletedCount += 1;
    }
  }

  return deletedCount;
}

function buildLocalSkillScanTargets() {
  const defaults = [
    { dir: path.join(os.homedir(), ".codex", "skills"), provider: "Codex", sourceId: "local-codex" },
    { dir: path.join(os.homedir(), ".claude", "skills"), provider: "Claude", sourceId: "local-claude" }
  ];

  const merged = [...defaults];
  const dedup = new Map();
  for (const item of merged) {
    const key = path.resolve(item.dir);
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }
  return Array.from(dedup.values());
}

function normalizeLocalProvider(value) {
  const provider = String(value ?? "").trim();
  if (provider === "Claude" || provider === "Codex") {
    return provider;
  }
  return null;
}

function resolveLocalProviderTarget(provider) {
  const normalized = normalizeLocalProvider(provider);
  if (!normalized) return null;
  return buildLocalSkillScanTargets().find((item) => item.provider === normalized) ?? null;
}

function normalizeInstallName(value, fallback) {
  const normalized = normalizePath(value || fallback || "skill");
  const last = normalized.split("/").filter(Boolean).pop() || "skill";
  return last.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function normalizeSkillIdValue(value, fallback) {
  const raw = String(value ?? fallback ?? "").trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-");
  return normalized || "skill";
}

function getRemovalAllowedRoots() {
  const roots = [
    path.resolve(SKILLS_TARGET_DIR),
    path.resolve(SKILLS_SSOT_DIR),
    ...buildLocalSkillScanTargets().map((item) => path.resolve(item.dir))
  ];
  return Array.from(new Set(roots));
}

async function resolveRecordSourceDir(record) {
  const candidates = [record?.targetPath, record?.ssotPath]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        return candidate;
      }
    } catch {
      // continue
    }
  }
  return null;
}

async function removeInstallationPaths(record) {
  const roots = getRemovalAllowedRoots();
  const candidates = [record?.targetPath, record?.ssotPath]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(candidates.map((item) => path.resolve(item))));
  const removedPaths = [];
  for (const candidate of unique) {
    if (!isPathWithinRoots(candidate, roots)) {
      continue;
    }
    await rm(candidate, { recursive: true, force: true });
    removedPaths.push(candidate);
  }
  return removedPaths;
}

async function installSkillToLocalProvider(request) {
  const targetProvider = normalizeLocalProvider(request?.targetProvider);
  if (!targetProvider) {
    throw new Error("targetProvider must be Claude or Codex");
  }

  const seedSourceId = String(request?.seedSourceId ?? "").trim();
  const seedSkillId = String(request?.seedSkillId ?? "").trim();
  if (!seedSourceId || !seedSkillId) {
    throw new Error("seedSourceId/seedSkillId are required");
  }

  const seedKey = `${seedSourceId}:${seedSkillId}`;
  const seedRecord = installations[seedKey];
  if (!seedRecord) {
    throw new Error("seed skill record not found");
  }

  const sourceDir = await resolveRecordSourceDir(seedRecord);
  if (!sourceDir) {
    throw new Error("seed skill directory not found");
  }

  const target = resolveLocalProviderTarget(targetProvider);
  if (!target) {
    throw new Error(`provider target not configured: ${targetProvider}`);
  }

  const installName = normalizeInstallName(request?.installName, seedRecord.installName || seedRecord.skillId);
  const skillId = normalizeSkillIdValue(request?.skillId, seedRecord.skillId || installName);
  const installationKey = `${target.sourceId}:${skillId}`;
  const previous = installations[installationKey];
  if (previous) {
    await removeInstallationPaths(previous);
  }

  const targetDir = path.resolve(target.dir);
  await mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, installName);
  await rm(targetPath, { recursive: true, force: true });
  await cp(sourceDir, targetPath, { recursive: true, force: true });

  const installed = {
    sourceId: target.sourceId,
    skillId,
    name: String(request?.name ?? "").trim() || String(seedRecord.name ?? "").trim() || skillId,
    publisher: String(request?.publisher ?? "").trim() || String(seedRecord.publisher ?? "").trim() || "local",
    description: String(request?.description ?? "").trim() || String(seedRecord.description ?? "").trim(),
    provider: targetProvider,
    channel: "stable",
    installedVersion: String(seedRecord.installedVersion ?? "-"),
    installName,
    installBranch: String(seedRecord.installBranch ?? "").trim() || undefined,
    installedAt: new Date().toISOString(),
    ssotPath: targetPath,
    targetPath
  };

  installations[installationKey] = installed;
  await persistInstallations();
  return installed;
}

function normalizeSkillIdFromRelative(relativeDir, fallbackName) {
  const base = normalizePath(relativeDir || fallbackName || "skill");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-");
}

async function scanLocalInstalledSkills() {
  const targets = buildLocalSkillScanTargets();
  pruneUnsupportedLocalInstallations(targets);

  let detectedCount = 0;
  let addedCount = 0;

  for (const target of targets) {
    const absoluteRoot = path.resolve(target.dir);
    if (!(await pathExists(absoluteRoot))) {
      continue;
    }

    let skillMdFiles = [];
    try {
      skillMdFiles = await listSkillMarkdownPaths(absoluteRoot);
    } catch (error) {
      console.warn(`[local-api] scan failed for ${absoluteRoot}:`, error?.message ?? error);
      continue;
    }

    for (const skillMdPath of skillMdFiles) {
      const relativeSkillPath = normalizePath(path.relative(absoluteRoot, skillMdPath));
      const relativeDir = normalizePath(path.dirname(relativeSkillPath));
      const directory = relativeDir === "." ? "" : relativeDir;
      const installName = directory ? directory.split("/").pop() : path.basename(absoluteRoot);
      const skillId = normalizeSkillIdFromRelative(directory, installName);
      const sourceId = target.sourceId;
      const key = `${sourceId}:${skillId}`;
      detectedCount += 1;

      if (installations[key]) {
        continue;
      }

      let markdown = "";
      try {
        markdown = await readFile(skillMdPath, "utf8");
      } catch {
        markdown = "";
      }
      const metadata = parseSkillMetadata(markdown, installName || "skill");
      const provider = target.provider || inferProviderFromSkill({
        skillId,
        name: metadata.name,
        description: metadata.description,
        publisher: ""
      });

      let installedAt = new Date().toISOString();
      try {
        const info = await stat(skillMdPath);
        installedAt = info.mtime.toISOString();
      } catch {
        // keep fallback now timestamp
      }

      installations[key] = {
        sourceId,
        skillId,
        name: metadata.name,
        publisher: "local",
        description: metadata.description,
        provider: provider || "Other",
        channel: "stable",
        installedVersion: "-",
        installName: installName || skillId,
        installedAt,
        targetPath: path.dirname(skillMdPath),
        ssotPath: path.dirname(skillMdPath)
      };
      addedCount += 1;
    }
  }

  await persistInstallations();
  return { scanned: detectedCount, added: addedCount, total: Object.keys(installations).length };
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function parseGithubRepoUrl(repoUrl) {
  let parsed;
  try {
    parsed = new URL(repoUrl);
  } catch {
    throw new Error("Invalid GitHub repository URL");
  }

  if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
    throw new Error("Only github.com repositories are supported");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("GitHub repository URL must be owner/repo");
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  let branch = "";
  let basePath = "";

  if (segments[2] === "tree" && segments[3]) {
    branch = decodeURIComponent(segments[3]);
    basePath = normalizePath(segments.slice(4).join("/"));
  } else if (segments[2] === "blob" && segments[3]) {
    branch = decodeURIComponent(segments[3]);
    const filePath = normalizePath(segments.slice(4).join("/"));
    const slashIndex = filePath.lastIndexOf("/");
    basePath = slashIndex > 0 ? filePath.slice(0, slashIndex) : "";
  }

  return { owner, repo, branch, basePath };
}

function buildBranchCandidates(branch) {
  const candidates = [branch, "main", "master"].filter(Boolean);
  return Array.from(new Set(candidates));
}

async function downloadBranchArchive(owner, repo, branch) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "skilldock-skill-source-"));
  const archivePath = path.join(tempDir, "repo.tar.gz");
  const url = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tar.gz/refs/heads/${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      headers: { "user-agent": GITHUB_USER_AGENT }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`download ${branch} failed (${response.status}): ${text.slice(0, 200)}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(archivePath, bytes);

    await execFileAsync("tar", ["-xzf", archivePath, "-C", tempDir]);
    const entries = await readdir(tempDir, { withFileTypes: true });
    const extracted = entries.find((entry) => entry.isDirectory());
    if (!extracted) {
      throw new Error(`archive extract failed for ${owner}/${repo}@${branch}`);
    }

    return {
      tempDir,
      repoRoot: path.join(tempDir, extracted.name)
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function listSkillMarkdownPaths(rootDir) {
  const result = [];
  const ignoredDirNames = new Set([".git", ".svn", "node_modules"]);
  const visited = new Set();

  async function visit(currentDir) {
    let canonicalDir = path.resolve(currentDir);
    try {
      canonicalDir = await realpath(currentDir);
    } catch {
      canonicalDir = path.resolve(currentDir);
    }

    if (visited.has(canonicalDir)) {
      return;
    }
    visited.add(canonicalDir);

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirNames.has(entry.name)) continue;
        await visit(fullPath);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        result.push(fullPath);
      } else if (entry.isSymbolicLink()) {
        try {
          const info = await stat(fullPath);
          if (info.isDirectory()) {
            await visit(fullPath);
          } else if (info.isFile() && entry.name === "SKILL.md") {
            result.push(fullPath);
          }
        } catch {
          // ignore broken symbolic links
        }
      }
    }
  }

  await visit(rootDir);
  return result.sort((left, right) => left.localeCompare(right));
}

function parseFrontmatterValue(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function parseSkillMetadata(markdown, fallbackName) {
  const text = String(markdown ?? "").replace(/^\uFEFF/, "");
  let name = "";
  let description = "";

  const frontMatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (frontMatter) {
    const lines = frontMatter[1].split(/\r?\n/);
    for (const line of lines) {
      const pair = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
      if (!pair) continue;
      const key = pair[1].toLowerCase();
      const value = parseFrontmatterValue(pair[2]);
      if (key === "name" && value) {
        name = value;
      } else if (key === "description" && value) {
        description = value;
      }
    }
  }

  if (!name) {
    const heading = text.match(/^#\s+(.+)$/m);
    if (heading?.[1]) {
      name = heading[1].trim();
    }
  }

  if (!description) {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const candidate = line.trim();
      if (!candidate) continue;
      if (candidate === "---") continue;
      if (candidate.startsWith("#")) continue;
      if (candidate.startsWith("```")) continue;
      description = candidate;
      break;
    }
  }

  return {
    name: name || fallbackName,
    description: description || ""
  };
}

function pickRegistrySkillVersion(entry) {
  const directVersion = String(entry?.version ?? "").trim();
  if (directVersion) return directVersion;
  const stableVersion = String(entry?.channels?.stable ?? "").trim();
  if (stableVersion) return stableVersion;
  const betaVersion = String(entry?.channels?.beta ?? "").trim();
  if (betaVersion) return betaVersion;
  return "";
}

async function indexRegistryByIndexFile({ source, parsed, branch, scanRoot }) {
  const indexPath = path.join(scanRoot, "index.json");
  if (!(await pathExists(indexPath))) {
    return null;
  }

  const indexData = await readJsonFileOrDefault(indexPath, { skills: [] });
  const entries = Array.isArray(indexData?.skills) ? indexData.skills : [];
  const skills = [];

  for (const entry of entries) {
    const rawSkillId = String(entry?.skill_id ?? "").trim();
    if (!rawSkillId) continue;
    const skillId = normalizeSkillIdValue(rawSkillId, "");
    const chosenVersion = pickRegistrySkillVersion(entry);
    if (!chosenVersion) continue;

    const directory = `skills/${skillId}/files/${chosenVersion}`;
    const skillMdPath = path.join(scanRoot, directory, "SKILL.md");
    if (!(await pathExists(skillMdPath))) {
      console.warn(`[local-api] skip registry skill without SKILL.md: ${skillId}@${chosenVersion}`);
      continue;
    }

    const markdown = await readFile(skillMdPath, "utf8");
    const metadata = parseSkillMetadata(markdown, String(entry?.name ?? skillId));
    const stableVersion = String(entry?.channels?.stable ?? "").trim() || chosenVersion;
    const betaVersion = String(entry?.channels?.beta ?? "").trim() || chosenVersion;

    skills.push({
      skillId,
      name: metadata.name || String(entry?.name ?? skillId),
      publisher: String(entry?.publisher ?? parsed.owner ?? ""),
      sourceId: source.id,
      description: metadata.description || "",
      directory,
      installName: skillId,
      repoOwner: parsed.owner,
      repoName: parsed.repo,
      repoBranch: branch,
      stableVersion,
      betaVersion
    });
  }

  return skills;
}

function toMarketSkill({
  sourceId,
  publisher,
  repoName,
  branch,
  relativeSkillMdPath,
  markdown
}) {
  const normalizedPath = normalizePath(relativeSkillMdPath);
  const directory = normalizedPath === "SKILL.md" ? "" : normalizedPath.replace(/\/SKILL\.md$/i, "");
  const installName = directory ? (directory.split("/").pop() || repoName) : repoName;
  const fallbackName = directory.split("/").filter(Boolean).pop() || repoName;
  const metadata = parseSkillMetadata(markdown, fallbackName);
  const normalizedSkillId = (directory || repoName)
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-");

  return {
    skillId: normalizedSkillId || `${sourceId}-${repoName}`.toLowerCase(),
    name: metadata.name,
    publisher,
    sourceId,
    description: metadata.description,
    directory,
    installName,
    repoOwner: publisher,
    repoName,
    repoBranch: branch
  };
}

async function indexSource(source) {
  const parsed = parseGithubRepoUrl(source.repoUrl);
  const branch = normalizeOptionalBranch(source.repoBranch) ?? parsed.branch;
  const skillsPath = normalizeOptionalSkillsPath(source.skillsPath) ?? parsed.basePath;
  const branches = buildBranchCandidates(branch);
  let lastError = null;

  for (const branch of branches) {
    let extracted = null;
    try {
      extracted = await downloadBranchArchive(parsed.owner, parsed.repo, branch);
      const scanRoot = skillsPath
        ? path.join(extracted.repoRoot, skillsPath)
        : extracted.repoRoot;

      const registryIndexed = await indexRegistryByIndexFile({
        source,
        parsed,
        branch,
        scanRoot
      });
      const skills = [];
      if (Array.isArray(registryIndexed)) {
        skills.push(...registryIndexed);
      } else {
        const skillMdFiles = await listSkillMarkdownPaths(scanRoot);
        for (const fullSkillMdPath of skillMdFiles) {
          const markdown = await readFile(fullSkillMdPath, "utf8");
          const relativeSkillMdPath = normalizePath(path.relative(scanRoot, fullSkillMdPath));
          skills.push(
            toMarketSkill({
              sourceId: source.id,
              publisher: parsed.owner,
              repoName: parsed.repo,
              branch,
              relativeSkillMdPath,
              markdown
            })
          );
        }
      }

      const dedup = new Map();
      for (const skill of skills) {
        dedup.set(`${skill.sourceId}:${skill.skillId}`, skill);
      }

      skillsBySource[source.id] = Array.from(dedup.values()).sort((left, right) =>
        left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true })
      );
      sourceHealthById[source.id] = "healthy";
      return skillsBySource[source.id];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[local-api] failed indexing ${source.id} on branch ${branch}:`, lastError.message);
    } finally {
      if (extracted?.tempDir) {
        await rm(extracted.tempDir, { recursive: true, force: true });
      }
    }
  }

  throw lastError ?? new Error(`Unable to index source: ${source.id}`);
}

async function ensureIndexedForSelection(sourceIds) {
  const indexed = {};
  const failedSources = [];

  for (const sourceId of sourceIds) {
    const source = sources.find((item) => item.id === sourceId);
    if (!source) {
      failedSources.push({ sourceId, reason: "Source not found" });
      sourceHealthById[sourceId] = "unreachable";
      continue;
    }

    if (Array.isArray(skillsBySource[sourceId])) {
      indexed[sourceId] = skillsBySource[sourceId];
      continue;
    }

    try {
      indexed[sourceId] = await indexSource(source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      failedSources.push({ sourceId, reason });
      sourceHealthById[sourceId] = "unreachable";
      skillsBySource[sourceId] = [];
      indexed[sourceId] = [];
    }
  }

  return { indexed, failedSources };
}

async function installIndexedSkill(source, skill, channel) {
  const parsed = parseGithubRepoUrl(source.repoUrl);
  const preferredBranch = normalizeOptionalBranch(source.repoBranch) ?? normalizeOptionalBranch(skill.repoBranch) ?? parsed.branch;
  const branches = buildBranchCandidates(preferredBranch);
  const relativeSkillDir = normalizePath(skill.directory);
  const skillsPath = normalizeOptionalSkillsPath(source.skillsPath) ?? parsed.basePath;
  const installName = normalizePath(skill.installName || "").split("/").pop() || parsed.repo;

  let lastError = null;
  for (const branch of branches) {
    let extracted = null;
    try {
      extracted = await downloadBranchArchive(parsed.owner, parsed.repo, branch);
      const scanRoot = skillsPath ? path.join(extracted.repoRoot, skillsPath) : extracted.repoRoot;
      const sourceDir = relativeSkillDir ? path.join(scanRoot, relativeSkillDir) : scanRoot;
      if (!(await pathExists(sourceDir))) {
        throw new Error(`skill directory not found: ${sourceDir}`);
      }

      await mkdir(SKILLS_SSOT_DIR, { recursive: true });
      const ssotPath = path.join(SKILLS_SSOT_DIR, installName);
      await rm(ssotPath, { recursive: true, force: true });
      await cp(sourceDir, ssotPath, { recursive: true, force: true });

      await mkdir(SKILLS_TARGET_DIR, { recursive: true });
      const targetPath = path.join(SKILLS_TARGET_DIR, installName);
      await rm(targetPath, { recursive: true, force: true });
      await cp(ssotPath, targetPath, { recursive: true, force: true });

      const installedVersion =
        channel === "stable"
          ? (skill.stableVersion ?? skill.betaVersion ?? branch)
          : (skill.betaVersion ?? skill.stableVersion ?? branch);

      return {
        installName,
        ssotPath,
        targetPath,
        installedVersion,
        branch
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[local-api] failed installing ${source.id}/${skill.skillId} on branch ${branch}:`, lastError.message);
    } finally {
      if (extracted?.tempDir) {
        await rm(extracted.tempDir, { recursive: true, force: true });
      }
    }
  }

  throw lastError ?? new Error(`Unable to install skill: ${source.id}/${skill.skillId}`);
}

function withReleaseMutationLock(task) {
  const next = releaseMutationQueue.then(task, task);
  releaseMutationQueue = next.then(() => undefined, () => undefined);
  return next;
}

function toPosixPath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function normalizeReleaseIndex(raw, now) {
  const skills = Array.isArray(raw?.skills) ? raw.skills : [];
  return {
    schema_version: typeof raw?.schema_version === "string" ? raw.schema_version : "1.0.0",
    generated_at: typeof raw?.generated_at === "string" ? raw.generated_at : now,
    skills: skills
      .filter((item) => item && typeof item === "object" && item.skill_id)
      .map((item) => ({
        skill_id: String(item.skill_id),
        publisher: String(item.publisher ?? ""),
        name: String(item.name ?? item.skill_id),
        version:
          typeof item?.version === "string" && item.version.trim()
            ? item.version.trim()
            : (
              (typeof item?.channels?.beta === "string" && item.channels.beta.trim() && item.channels.beta.trim()) ||
              (typeof item?.channels?.stable === "string" && item.channels.stable.trim() && item.channels.stable.trim()) ||
              ""
            ),
        channels: {
          ...(typeof item?.channels?.beta === "string" ? { beta: item.channels.beta } : {}),
          ...(typeof item?.channels?.stable === "string" ? { stable: item.channels.stable } : {})
        },
        updated_at: typeof item.updated_at === "string" ? item.updated_at : now
      }))
  };
}

async function readJsonFileOrDefault(filePath, fallbackValue) {
  if (!(await pathExists(filePath))) {
    return fallbackValue;
  }
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON at ${filePath}: ${message}`);
  }
}

async function ensureReleaseRepoReady() {
  await mkdir(PERSIST_DIR, { recursive: true });
  const { repoUrl, repoBranch } = getReleaseRepoConfig();
  const repoDir = path.resolve(RELEASE_REPO_DIR);
  const parsed = parseGithubRepoUrl(repoUrl);
  const gitDir = path.join(repoDir, ".git");

  if (!(await pathExists(gitDir))) {
    await rm(repoDir, { recursive: true, force: true });
    await execFileAsync("git", ["clone", "--branch", repoBranch, repoUrl, repoDir], { cwd: PROJECT_ROOT });
  } else {
    const remote = (await runGit(["remote", "get-url", "origin"], { cwd: repoDir, allowFailure: true }))
      .replace(/\.git$/i, "")
      .toLowerCase();
    const expected = `https://github.com/${parsed.owner}/${parsed.repo}`.toLowerCase();
    if (!remote || (!remote.includes(`${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`) && remote !== expected)) {
      await rm(repoDir, { recursive: true, force: true });
      await execFileAsync("git", ["clone", "--branch", repoBranch, repoUrl, repoDir], { cwd: PROJECT_ROOT });
    }
  }

  await runGit(["fetch", "origin", repoBranch], { cwd: repoDir });
  await runGit(["checkout", repoBranch], { cwd: repoDir });
  await runGit(["reset", "--hard", `origin/${repoBranch}`], { cwd: repoDir });
  await runGit(["clean", "-fd"], { cwd: repoDir });
  return { repoDir, parsed, repoUrl, repoBranch };
}

function sanitizeBranchSegment(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.+/g, ".");
}

function buildBetaReleaseBranchName(request) {
  const skill = sanitizeBranchSegment(request.skillId) || "skill";
  const version = sanitizeBranchSegment(request.version) || "version";
  return `beta-release/${skill}-${version}-${Date.now()}`;
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}

function buildReleaseId(now = new Date()) {
  const year = now.getFullYear();
  const month = padTwo(now.getMonth() + 1);
  const day = padTwo(now.getDate());
  const hour = padTwo(now.getHours());
  const minute = padTwo(now.getMinutes());
  const second = padTwo(now.getSeconds());
  return `r-${year}${month}${day}-${hour}${minute}${second}`;
}

function deriveSkillIdFromPathForRelease(skillPath) {
  const normalized = String(skillPath ?? "").trim().replace(/\/+$/, "");
  const folderName = normalized.split("/").filter(Boolean).pop() ?? "";
  return normalizeSkillIdValue(folderName, "skill");
}

function normalizeBetaReleaseRequest(rawRequest) {
  const version = String(rawRequest?.version ?? "").trim();
  const skillPath = String(rawRequest?.skillPath ?? "").trim();
  if (!version || !skillPath) {
    throw new Error("version/skillPath are required");
  }

  const derivedSkillId = deriveSkillIdFromPathForRelease(skillPath);
  const skillId = normalizeSkillIdValue(rawRequest?.skillId, derivedSkillId);

  const requestedBy =
    String(rawRequest?.requestedBy ?? "").trim() ||
    String(process.env.SkillDock_RELEASE_REQUESTED_BY || process.env.USER || process.env.LOGNAME || "author").trim() ||
    "author";

  const providedReleaseId = String(rawRequest?.releaseId ?? "").trim();
  const releaseId = providedReleaseId || buildReleaseId();

  return {
    skillId,
    version,
    releaseId,
    skillPath,
    requestedBy
  };
}

function parseSkillFrontmatter(markdown) {
  const raw = String(markdown ?? "");
  const frontmatterMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!frontmatterMatch) {
    return {
      hasFrontmatter: false,
      name: "",
      hasDescription: false
    };
  }

  const frontmatter = frontmatterMatch[1];
  const nameMatch = frontmatter.match(/^\s*name\s*:\s*(.+)\s*$/m);
  const rawName = nameMatch ? nameMatch[1].trim() : "";
  const hasDescription = /^\s*description\s*:/m.test(frontmatter);
  return {
    hasFrontmatter: true,
    name: rawName.replace(/^['"]|['"]$/g, ""),
    hasDescription
  };
}

async function ensureGitIdentity(repoDir) {
  const userName = await runGit(["config", "--get", "user.name"], { cwd: repoDir, allowFailure: true });
  const userEmail = await runGit(["config", "--get", "user.email"], { cwd: repoDir, allowFailure: true });
  if (!userName.trim()) {
    await runGit(["config", "user.name", process.env.SkillDock_RELEASE_GIT_USER_NAME || "skilldock-release-bot"], { cwd: repoDir });
  }
  if (!userEmail.trim()) {
    await runGit(["config", "user.email", process.env.SkillDock_RELEASE_GIT_USER_EMAIL || "skilldock-release-bot@users.noreply.github.com"], { cwd: repoDir });
  }
}

async function runGit(args, options = {}) {
  const cwd = options.cwd ?? RELEASE_REPO_DIR;
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return String(stdout ?? "").trim();
  } catch (error) {
    if (options.allowFailure) {
      return "";
    }
    const stderr = String(error?.stderr ?? error?.stdout ?? error?.message ?? "unknown error").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

async function listRelativeFilePaths(rootDir) {
  if (!(await pathExists(rootDir))) {
    return [];
  }

  const files = [];
  const visited = new Set();
  const ignoredDirs = new Set([".git", ".svn", "node_modules"]);
  const ignoredFiles = new Set([".DS_Store"]);

  async function visit(currentDir) {
    let canonicalDir = path.resolve(currentDir);
    try {
      canonicalDir = await realpath(currentDir);
    } catch {
      canonicalDir = path.resolve(currentDir);
    }

    if (visited.has(canonicalDir)) return;
    visited.add(canonicalDir);

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        await visit(fullPath);
        continue;
      }

      if (entry.isFile()) {
        if (ignoredFiles.has(entry.name)) continue;
        const relative = normalizePath(path.relative(rootDir, fullPath));
        if (relative) files.push(relative);
        continue;
      }

      if (!entry.isSymbolicLink()) {
        continue;
      }

      try {
        const info = await stat(fullPath);
        if (info.isDirectory()) {
          if (ignoredDirs.has(entry.name)) continue;
          await visit(fullPath);
        } else if (info.isFile()) {
          if (ignoredFiles.has(entry.name)) continue;
          const relative = normalizePath(path.relative(rootDir, fullPath));
          if (relative) files.push(relative);
        }
      } catch {
        // ignore broken symbolic links
      }
    }
  }

  await visit(rootDir);
  return Array.from(new Set(files)).sort((left, right) => left.localeCompare(right));
}

async function readLocalSkillBundle(request, skillId, version) {
  const rawSkillPath = String(request?.skillPath ?? "").trim();
  if (!rawSkillPath) {
    throw new Error("skillPath is required");
  }

  const sourceDir = path.resolve(rawSkillPath);
  if (!(await pathExists(sourceDir))) {
    throw new Error(`skillPath not found: ${sourceDir}`);
  }
  const sourceStat = await stat(sourceDir);
  if (!sourceStat.isDirectory()) {
    throw new Error(`skillPath is not a directory: ${sourceDir}`);
  }

  const skillMarkdownPath = path.join(sourceDir, "SKILL.md");
  if (!(await pathExists(skillMarkdownPath))) {
    throw new Error(`SKILL.md not found under skillPath: ${sourceDir}`);
  }
  const skillMarkdown = await readFile(skillMarkdownPath, "utf8");
  const frontmatter = parseSkillFrontmatter(skillMarkdown);
  if (!frontmatter.hasFrontmatter) {
    throw new Error("SKILL.md missing YAML frontmatter (--- ... ---)");
  }
  if (!frontmatter.name) {
    throw new Error("SKILL.md frontmatter missing required field: name");
  }
  if (!frontmatter.hasDescription) {
    throw new Error("SKILL.md frontmatter missing required field: description");
  }

  const files = await listRelativeFilePaths(sourceDir);
  if (files.length === 0) {
    throw new Error(`No files found under skillPath: ${sourceDir}`);
  }

  return {
    sourceDir,
    targetDir: `registry/skills/${skillId}/files/${version}`,
    files,
    frontmatter
  };
}

async function buildSkillPublisherAlignedChecklist(request, skillBundle, releaseRepo) {
  const checklist = [
    {
      id: "skill-frontmatter",
      title: "验证 SKILL.md 的 YAML frontmatter（name + description）",
      status: "passed",
      detail: `name: ${skillBundle.frontmatter.name}`
    },
    {
      id: "publish-path",
      title: "发布路径校验（创建分支并提交 PR）",
      status: "passed",
      detail: `${releaseRepo.repoUrl}#${releaseRepo.repoBranch}`
    },
    {
      id: "discoverability",
      title: "安装可发现性检查（映射 skill-publisher 的 npx 验证）",
      status: "passed",
      detail: `PR 合并并同步市场索引后可发现 ${request.skillId}@${request.version}`
    }
  ];

  return checklist;
}

async function buildBetaReleasePlan(repoDir, request, releaseRepo) {
  const now = new Date().toISOString();
  const skillId = String(request.skillId ?? "").trim();
  const version = String(request.version ?? "").trim();
  const releaseId = String(request.releaseId ?? "").trim();
  const requestedBy = String(request.requestedBy ?? "unknown").trim() || "unknown";
  const skillBundle = await readLocalSkillBundle(request, skillId, version);

  const indexPath = "registry/index.json";
  const legacyChannelsPath = `registry/skills/${skillId}/channels.json`;
  const legacyReleasesDir = `registry/skills/${skillId}/releases`;

  const indexRaw = await readJsonFileOrDefault(path.join(repoDir, indexPath), {
    schema_version: "1.0.0",
    generated_at: now,
    skills: []
  });
  const nextIndex = normalizeReleaseIndex(indexRaw, now);
  const existing = nextIndex.skills.find((item) => item.skill_id === skillId);
  const publisher = String(existing?.publisher || requestedBy || "unknown");
  const skillName = String(existing?.name || skillBundle.frontmatter.name || skillId);

  const nextSkillEntry = {
    skill_id: skillId,
    publisher,
    name: skillName,
    version,
    channels: {
      stable: version,
      beta: version
    },
    updated_at: now
  };

  const skillIndex = nextIndex.skills.findIndex((item) => item.skill_id === skillId);
  if (skillIndex >= 0) {
    nextIndex.skills[skillIndex] = nextSkillEntry;
  } else {
    nextIndex.skills.push(nextSkillEntry);
  }
  nextIndex.generated_at = now;
  nextIndex.skills.sort((left, right) => left.skill_id.localeCompare(right.skill_id, "en"));

  const prTitle = `beta-release: ${skillId}@${version}`;
  const prBody = [
    "## Beta Release Request",
    "",
    `- Skill: ${skillId}`,
    `- Version: ${version}`,
    `- Release ID: ${releaseId}`,
    `- Requested by: ${requestedBy}`,
    `- Repository: ${releaseRepo.repoUrl}`,
    `- Skill Files: ${skillBundle.targetDir} (${skillBundle.files.length} files)`,
    "",
    "Supervisor approval is required before merge."
  ].join("\n");

  return {
    prTitle,
    prBody,
    skillBundle,
    cleanupTargets: [
      { type: "file", path: legacyChannelsPath },
      { type: "dir", path: legacyReleasesDir }
    ],
    filesToWrite: [
      { path: indexPath, content: `${JSON.stringify(nextIndex, null, 2)}\n` }
    ]
  };
}

async function computeChangedFiles(repoDir, filesToWrite, skillBundle, cleanupTargets = []) {
  const changed = [];
  const changedSet = new Set();
  const appendChanged = (itemPath) => {
    const normalized = toPosixPath(itemPath);
    if (!normalized || changedSet.has(normalized)) return;
    changedSet.add(normalized);
    changed.push(normalized);
  };

  for (const item of filesToWrite) {
    const absPath = path.join(repoDir, item.path);
    let current = "";
    try {
      current = await readFile(absPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
    if (current !== item.content) appendChanged(item.path);
  }

  for (const target of cleanupTargets) {
    const targetPath = String(target?.path ?? "");
    if (!targetPath) continue;
    const absPath = path.join(repoDir, targetPath);
    if (String(target?.type) === "dir") {
      const existingFiles = await listRelativeFilePaths(absPath);
      for (const relativeFile of existingFiles) {
        appendChanged(path.join(targetPath, relativeFile));
      }
      continue;
    }

    if (await pathExists(absPath)) {
      appendChanged(targetPath);
    }
  }

  if (skillBundle) {
    const targetRoot = path.join(repoDir, skillBundle.targetDir);
    const existingFiles = await listRelativeFilePaths(targetRoot);
    const existingSet = new Set(existingFiles);

    for (const relativeFile of skillBundle.files) {
      const sourcePath = path.join(skillBundle.sourceDir, relativeFile);
      const targetPath = path.join(targetRoot, relativeFile);
      const mappedPath = toPosixPath(path.join(skillBundle.targetDir, relativeFile));
      existingSet.delete(relativeFile);

      let targetBuffer = null;
      try {
        targetBuffer = await readFile(targetPath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }

      const sourceBuffer = await readFile(sourcePath);
      if (!targetBuffer || !sourceBuffer.equals(targetBuffer)) {
        appendChanged(mappedPath);
      }
    }

    for (const staleRelative of existingSet) {
      appendChanged(path.join(skillBundle.targetDir, staleRelative));
    }
  }

  return changed;
}

async function applyReleaseFiles(repoDir, filesToWrite, skillBundle, cleanupTargets = []) {
  for (const item of filesToWrite) {
    const absPath = path.join(repoDir, item.path);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, item.content, "utf8");
  }

  for (const target of cleanupTargets) {
    const targetPath = String(target?.path ?? "");
    if (!targetPath) continue;
    const absPath = path.join(repoDir, targetPath);
    if (String(target?.type) === "dir") {
      await rm(absPath, { recursive: true, force: true });
      continue;
    }

    await rm(absPath, { force: true });
  }

  if (skillBundle) {
    const targetRoot = path.join(repoDir, skillBundle.targetDir);
    await rm(targetRoot, { recursive: true, force: true });
    await mkdir(targetRoot, { recursive: true });

    for (const relativeFile of skillBundle.files) {
      const sourcePath = path.join(skillBundle.sourceDir, relativeFile);
      const targetPath = path.join(targetRoot, relativeFile);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await cp(sourcePath, targetPath, { force: true });
    }
  }
}

async function createGithubPullRequest({ owner, repo, title, body, head, base }) {
  if (RELEASE_GITHUB_TOKEN) {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${RELEASE_GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": GITHUB_USER_AGENT,
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify({
        title,
        body,
        head,
        base
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.message ?? "unknown error");
      throw new Error(`GitHub create PR failed (${response.status}): ${message}`);
    }
    return payload;
  }

  try {
    const createResult = await execFileAsync("gh", [
      "pr",
      "create",
      "--repo",
      `${owner}/${repo}`,
      "--title",
      title,
      "--body",
      body,
      "--head",
      head,
      "--base",
      base
    ], { cwd: RELEASE_REPO_DIR });
    const createOutput = String(createResult.stdout ?? "").trim();
    const matchedUrl = createOutput.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/i)?.[0];

    if (matchedUrl) {
      const viewResult = await execFileAsync("gh", [
        "pr",
        "view",
        matchedUrl,
        "--repo",
        `${owner}/${repo}`,
        "--json",
        "number,url"
      ], { cwd: RELEASE_REPO_DIR });
      const payload = JSON.parse(String(viewResult.stdout ?? "{}"));
      return {
        html_url: payload.url || matchedUrl,
        number: payload.number
      };
    }

    return {
      html_url: createOutput || `https://github.com/${owner}/${repo}/pulls`,
      number: null
    };
  } catch (error) {
    const detail = String(error?.stderr ?? error?.stdout ?? error?.message ?? "unknown error").trim();
    const existingPrUrl = detail.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/i)?.[0] ?? "";
    if (existingPrUrl) {
      return {
        html_url: existingPrUrl,
        number: null,
        warning: "gh-fallback-existing-pr"
      };
    }

    const compareUrl = `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?expand=1`;
    return {
      html_url: compareUrl,
      number: null,
      warning: `gh-fallback-failed: ${detail}`
    };
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function isHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      sendJson(res, 400, { code: "VALIDATION_ERROR", message: "invalid request" });
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { status: "ok", ready: true, offline });
      return;
    }

    if (req.method === "POST" && req.url === "/api/admin/offline") {
      const body = await readBody(req);
      offline = Boolean(body?.offline);
      sendJson(res, 200, { offline });
      return;
    }

    if (req.method === "GET" && req.url === "/api/settings/general") {
      sendJson(res, 200, { ...generalSettings });
      return;
    }

    if (req.method === "PUT" && req.url === "/api/settings/general") {
      const body = await readBody(req);
      const normalized = normalizeGeneralSettingsPayload(body?.settings ?? body);
      if (!normalized?.teamRepoUrl) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "teamRepoUrl is required"
        });
        return;
      }
      if (!isHttpsUrl(normalized.teamRepoUrl)) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "teamRepoUrl must use HTTPS"
        });
        return;
      }
      try {
        parseGithubRepoUrl(normalized.teamRepoUrl);
      } catch (error) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Invalid GitHub repository URL"
        });
        return;
      }
      generalSettings.teamRepoUrl = normalized.teamRepoUrl;
      await persistGeneralSettings();
      sendJson(res, 200, { ...generalSettings });
      return;
    }

    if (req.method === "GET" && req.url === "/api/settings/skills/sources") {
      sendJson(res, 200, sources);
      return;
    }

    if (req.method === "PUT" && req.url === "/api/settings/skills/sources") {
      const body = await readBody(req);
      const source = body?.source ?? {};
      if (!source.id || !source.name || !source.repoUrl) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "source id/name/repoUrl are required"
        });
        return;
      }

      if (!isHttpsUrl(source.repoUrl)) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "Source URL must use HTTPS"
        });
        return;
      }

      const normalized = normalizeSourcePayload(source);
      if (!normalized) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "source payload is invalid"
        });
        return;
      }

      const index = sources.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        sources[index] = normalized;
      } else {
        sources.push(normalized);
      }

      delete skillsBySource[normalized.id];
      sourceHealthById[normalized.id] = "unknown";
      await persistSources();

      sendJson(res, 200, normalized);
      return;
    }

    if (req.method === "DELETE" && req.url === "/api/settings/skills/sources") {
      const body = await readBody(req);
      const sourceId = String(body?.sourceId ?? "");
      const idx = sources.findIndex((item) => item.id === sourceId);
      if (idx >= 0) {
        sources.splice(idx, 1);
      }
      delete skillsBySource[sourceId];
      delete sourceHealthById[sourceId];
      for (const key of Object.keys(installations)) {
        if (String(installations[key]?.sourceId) === sourceId) {
          delete installations[key];
        }
      }
      await persistSources();
      await persistInstallations();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && req.url === "/api/local/skills") {
      const targets = buildLocalSkillScanTargets();
      const deleted = pruneUnsupportedLocalInstallations(targets);
      if (deleted > 0) {
        await persistInstallations();
      }
      const skills = Object.values(installations)
        .sort((left, right) => new Date(right.installedAt ?? 0).getTime() - new Date(left.installedAt ?? 0).getTime());
      sendJson(res, 200, {
        skills,
        providers: summarizeProviders(skills)
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/local/skills/scan") {
      const summary = await scanLocalInstalledSkills();
      sendJson(res, 200, summary);
      return;
    }

    if (req.method === "POST" && req.url === "/api/local/skills/provider/install") {
      const body = await readBody(req);
      const request = body?.request ?? {};
      if (!request.targetProvider || !request.seedSourceId || !request.seedSkillId) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "targetProvider/seedSourceId/seedSkillId are required"
        });
        return;
      }

      try {
        const installed = await installSkillToLocalProvider(request);
        sendJson(res, 200, installed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message
        });
      }
      return;
    }

    if (req.method === "DELETE" && req.url === "/api/local/skills") {
      const body = await readBody(req);
      const sourceId = String(body?.sourceId ?? "");
      const skillId = String(body?.skillId ?? "");
      if (!sourceId || !skillId) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "sourceId/skillId are required"
        });
        return;
      }
      const key = `${sourceId}:${skillId}`;
      const record = installations[key];
      const removedPaths = record ? await removeInstallationPaths(record) : [];
      delete installations[key];
      await persistInstallations();
      sendJson(res, 200, { ok: true, removed: Boolean(record), removedPaths });
      return;
    }

    if (req.method === "POST" && req.url === "/api/market/sync") {
      const body = await readBody(req);
      const sourceIds = Array.isArray(body?.sourceIds) ? body.sourceIds : [];
      const selected = resolveEffectiveSourceIds(sourceIds);
      const { indexed, failedSources } = await ensureIndexedForSelection(selected);
      const indexedSkills = selected.reduce((acc, sourceId) => acc + (indexed[sourceId]?.length ?? 0), 0);
      sendJson(res, 200, {
        indexedSources: selected.length,
        indexedSkills,
        failedSources
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/market/skills") {
      const body = await readBody(req);
      const sourceIds = Array.isArray(body?.sourceIds) ? body.sourceIds : [];
      const selected = resolveEffectiveSourceIds(sourceIds);
      const { indexed } = await ensureIndexedForSelection(selected);
      const skills = selected.flatMap((sourceId) => indexed[sourceId] ?? []);
      const sourceHealth = Object.fromEntries(selected.map((id) => [id, sourceHealthById[id] ?? "unknown"]));
      sendJson(res, 200, { skills, sourceHealth });
      return;
    }

    if (req.method === "POST" && req.url === "/api/market/install") {
      const body = await readBody(req);
      const request = body?.request ?? {};
      if (!request.skillId || !request.sourceId) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "skillId/sourceId are required"
        });
        return;
      }
      if (!["stable", "beta"].includes(String(request.channel))) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "channel must be stable or beta"
        });
        return;
      }

      const source = sources.find((item) => item.id === request.sourceId);
      if (!source) {
        sendJson(res, 404, {
          code: "NOT_FOUND",
          message: "source not found"
        });
        return;
      }

      const selected = resolveEffectiveSourceIds([request.sourceId]);
      const { indexed, failedSources } = await ensureIndexedForSelection(selected);
      if (failedSources.length > 0) {
        sendJson(res, 409, {
          code: "UNREACHABLE_SOURCE",
          message: failedSources[0]?.reason ?? "source indexing failed"
        });
        return;
      }

      const sourceSkills = indexed[request.sourceId] ?? [];
      const match = sourceSkills.find((item) => item.skillId === request.skillId);
      if (!match) {
        sendJson(res, 404, {
          code: "NOT_FOUND",
          message: "skill not found in selected source"
        });
        return;
      }
      const installResult = await installIndexedSkill(source, match, String(request.channel));
      const installationKey = `${request.sourceId}:${request.skillId}`;
      installations[installationKey] = {
        sourceId: request.sourceId,
        skillId: request.skillId,
        name: match.name,
        publisher: match.publisher,
        description: match.description ?? "",
        provider: inferProviderFromSkill(match),
        channel: request.channel,
        installedVersion: installResult.installedVersion,
        installName: installResult.installName,
        installBranch: installResult.branch,
        installedAt: new Date().toISOString(),
        ssotPath: installResult.ssotPath,
        targetPath: installResult.targetPath
      };
      await persistInstallations();

      sendJson(res, 200, {
        skillId: request.skillId,
        sourceId: request.sourceId,
        channel: request.channel,
        installedVersion: installResult.installedVersion,
        status: "installed",
        installName: installResult.installName,
        targetPath: installResult.targetPath
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/release/beta/dry-run") {
      if (offline) {
        sendJson(res, 409, {
          code: "OFFLINE_BLOCKED",
          message: "Offline mode blocks remote release mutations. Reconnect and retry."
        });
        return;
      }

      const body = await readBody(req);
      const rawRequest = body?.request ?? {};
      let request;
      try {
        request = normalizeBetaReleaseRequest(rawRequest);
      } catch (error) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "invalid beta release request"
        });
        return;
      }

      const preview = await withReleaseMutationLock(async () => {
        const { repoDir, repoUrl, repoBranch } = await ensureReleaseRepoReady();
        const releaseRepo = { repoUrl, repoBranch };
        const plan = await buildBetaReleasePlan(repoDir, request, releaseRepo);
        const checklist = await buildSkillPublisherAlignedChecklist(request, plan.skillBundle, releaseRepo);
        const changedFiles = await computeChangedFiles(repoDir, plan.filesToWrite, plan.skillBundle, plan.cleanupTargets);
        const passedChecks = checklist.filter((item) => item.status === "passed").length;
        const warningChecks = checklist.filter((item) => item.status === "warning").length;
        const failedChecks = checklist.filter((item) => item.status === "failed").length;
        return {
          changedFiles,
          checklist,
          changelogDelta: [
            `Repository: ${repoUrl}`,
            `Base branch: ${repoBranch}`,
            `Planned release: ${request.skillId}@${request.version}`,
            `Release ID: ${request.releaseId}`,
            `Skill path: ${request.skillPath}`,
            `Bundled files: ${plan.skillBundle.files.length}`,
            `Bundle target: ${plan.skillBundle.targetDir}`,
            `Checklist: passed ${passedChecks} / warning ${warningChecks} / failed ${failedChecks}`
          ].join("\n")
        };
      });

      sendJson(res, 200, preview);
      return;
    }

    if (req.method === "POST" && req.url === "/api/release/beta/create-pr") {
      if (offline) {
        sendJson(res, 409, {
          code: "OFFLINE_BLOCKED",
          message: "Offline mode blocks remote release mutations. Reconnect and retry."
        });
        return;
      }

      const body = await readBody(req);
      const rawRequest = body?.request ?? {};
      let request;
      try {
        request = normalizeBetaReleaseRequest(rawRequest);
      } catch (error) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "invalid beta release request"
        });
        return;
      }

      const result = await withReleaseMutationLock(async () => {
        const { repoDir, parsed, repoUrl, repoBranch } = await ensureReleaseRepoReady();
        const releaseRepo = { repoUrl, repoBranch };
        const plan = await buildBetaReleasePlan(repoDir, request, releaseRepo);
        const changedFiles = await computeChangedFiles(repoDir, plan.filesToWrite, plan.skillBundle, plan.cleanupTargets);
        if (changedFiles.length === 0) {
          throw new Error("No file changes detected for this beta release request.");
        }

        const branchName = buildBetaReleaseBranchName(request);
        await runGit(["checkout", "-b", branchName], { cwd: repoDir });

        try {
          await applyReleaseFiles(repoDir, plan.filesToWrite, plan.skillBundle, plan.cleanupTargets);
          await runGit(["add", ...changedFiles], { cwd: repoDir });
          const stagedRaw = await runGit(["diff", "--cached", "--name-only"], { cwd: repoDir });
          const stagedFiles = stagedRaw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
          if (stagedFiles.length === 0) {
            throw new Error("No staged changes found after writing release files.");
          }

          await ensureGitIdentity(repoDir);
          await runGit(["commit", "-m", plan.prTitle], { cwd: repoDir });
          await runGit(["push", "-u", "origin", branchName], { cwd: repoDir });

          const pr = await createGithubPullRequest({
            owner: parsed.owner,
            repo: parsed.repo,
            title: plan.prTitle,
            body: plan.prBody,
            head: branchName,
            base: repoBranch
          });

          return {
            prTitle: plan.prTitle,
            prBody: plan.prBody,
            prUrl: pr.html_url,
            prNumber: pr.number,
            warning: typeof pr.warning === "string" ? pr.warning : undefined,
            branch: branchName,
            repoUrl,
            bundlePath: plan.skillBundle.targetDir,
            bundledFiles: plan.skillBundle.files.length,
            repoDir: repoDir,
            changedFiles: stagedFiles.map((item) => toPosixPath(item))
          };
        } finally {
          await runGit(["checkout", repoBranch], { cwd: repoDir, allowFailure: true });
          await runGit(["reset", "--hard", `origin/${repoBranch}`], { cwd: repoDir, allowFailure: true });
          await runGit(["clean", "-fd"], { cwd: repoDir, allowFailure: true });
        }
      });

      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/release/stable/create-pr") {
      if (offline) {
        sendJson(res, 409, {
          code: "OFFLINE_BLOCKED",
          message: "Offline mode blocks remote release mutations. Reconnect and retry."
        });
        return;
      }

      const body = await readBody(req);
      const request = body?.request ?? {};
      if (!request.isOwner) {
        sendJson(res, 403, {
          code: "OWNER_ONLY",
          message: "Only owner can initiate promote-stable PR."
        });
        return;
      }
      if (!request.skillId || !request.version || !request.releaseId || !request.requestedBy) {
        sendJson(res, 422, {
          code: "VALIDATION_ERROR",
          message: "skillId/version/releaseId/requestedBy are required"
        });
        return;
      }

      sendJson(res, 200, {
        prTitle: `promote-stable: ${request.skillId}@${request.version}`,
        prBody: "Generated by local API server"
      });
      return;
    }

    sendJson(res, 404, {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.url}`
    });
  } catch (error) {
    sendJson(res, 500, {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "unknown error"
    });
  }
});

server.on("listening", () => {
  console.log(`[local-api] listening on http://${host}:${port}`);
});

await loadPersistedSources();
await loadPersistedInstallations();
await loadPersistedGeneralSettings();
server.listen(port, host);

function shutdown(signal) {
  console.log(`[local-api] received ${signal}, shutting down...`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
