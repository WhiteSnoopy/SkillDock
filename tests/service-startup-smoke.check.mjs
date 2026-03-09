import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

class MockLocalApiService {
  constructor() {
    this.started = false;
    this.offline = false;
    this.sources = [];
    this.skillsBySource = {};
  }

  async start() {
    this.started = true;
    return this.request("GET", "/api/health");
  }

  async request(method, route, payload = {}) {
    if (!this.started && route !== "/api/health") {
      return {
        status: 503,
        json: { code: "SERVICE_NOT_READY", message: "service not started" }
      };
    }

    if (method === "GET" && route === "/api/health") {
      return {
        status: 200,
        json: { status: "ok", ready: this.started, offline: this.offline }
      };
    }

    if (method === "POST" && route === "/api/admin/offline") {
      this.offline = Boolean(payload?.offline);
      return { status: 200, json: { offline: this.offline } };
    }

    if (method === "GET" && route === "/api/settings/skills/sources") {
      return { status: 200, json: this.sources };
    }

    if (method === "PUT" && route === "/api/settings/skills/sources") {
      const source = payload?.source ?? {};
      if (!source.id || !source.name || !source.repoUrl) {
        return {
          status: 422,
          json: {
            code: "VALIDATION_ERROR",
            message: "source id/name/repoUrl are required"
          }
        };
      }
      if (!isHttpsUrl(source.repoUrl)) {
        return {
          status: 422,
          json: {
            code: "VALIDATION_ERROR",
            message: "Source URL must use HTTPS"
          }
        };
      }

      this.sources = [
        ...this.sources.filter((item) => item.id !== source.id),
        {
          id: source.id,
          name: source.name,
          repoUrl: source.repoUrl,
          repoBranch: source.repoBranch,
          skillsPath: source.skillsPath,
          curated: Boolean(source.curated),
          enabled: source.enabled !== false
        }
      ];

      if (!this.skillsBySource[source.id]) {
        this.skillsBySource[source.id] = [
          {
            skillId: `sample-${source.id}`,
            name: `Sample Skill (${source.id})`,
            publisher: "team",
            stableVersion: "1.0.0",
            betaVersion: "1.1.0-beta.1",
            sourceId: source.id
          }
        ];
      }

      return { status: 200, json: source };
    }

    if (method === "DELETE" && route === "/api/settings/skills/sources") {
      const sourceId = String(payload?.sourceId ?? "");
      this.sources = this.sources.filter((item) => item.id !== sourceId);
      delete this.skillsBySource[sourceId];
      return { status: 200, json: { ok: true } };
    }

    if (method === "POST" && route === "/api/market/sync") {
      const sourceIds = Array.isArray(payload?.sourceIds) ? payload.sourceIds : [];
      const selected = sourceIds.length > 0 ? sourceIds : this.sources.filter((item) => item.enabled !== false).map((item) => item.id);
      return {
        status: 200,
        json: {
          indexedSources: selected.length,
          indexedSkills: selected.reduce((acc, sourceId) => {
            return acc + (this.skillsBySource[sourceId]?.length ?? 0);
          }, 0),
          failedSources: []
        }
      };
    }

    if (method === "POST" && route === "/api/market/skills") {
      const sourceIds = Array.isArray(payload?.sourceIds) ? payload.sourceIds : [];
      const selected = sourceIds.length > 0 ? sourceIds : this.sources.filter((item) => item.enabled !== false).map((item) => item.id);
      const skills = selected.flatMap((sourceId) => this.skillsBySource[sourceId] ?? []);
      const sourceHealth = Object.fromEntries(selected.map((id) => [id, "healthy"]));
      return { status: 200, json: { skills, sourceHealth } };
    }

    if (method === "POST" && route === "/api/release/beta/dry-run") {
      if (this.offline) {
        return {
          status: 409,
          json: {
            code: "OFFLINE_BLOCKED",
            message: "Offline mode blocks remote release mutations. Reconnect and retry."
          }
        };
      }
      const request = payload?.request ?? {};
      if (!request.skillId || !request.version || !request.releaseId) {
        return {
          status: 422,
          json: {
            code: "VALIDATION_ERROR",
            message: "skillId/version/releaseId are required"
          }
        };
      }
      return {
        status: 200,
        json: {
          changedFiles: [`registry/skills/${request.skillId}/channels.json`],
          changelogDelta: "Dry-run preview from mock local API"
        }
      };
    }

    if (method === "POST" && route === "/api/release/beta/create-pr") {
      if (this.offline) {
        return {
          status: 409,
          json: {
            code: "OFFLINE_BLOCKED",
            message: "Offline mode blocks remote release mutations. Reconnect and retry."
          }
        };
      }
      const request = payload?.request ?? {};
      if (!request.skillId || !request.version || !request.releaseId) {
        return {
          status: 422,
          json: {
            code: "VALIDATION_ERROR",
            message: "skillId/version/releaseId are required"
          }
        };
      }
      return {
        status: 200,
        json: {
          prTitle: `beta-release: ${request.skillId}@${request.version}`,
          prBody: "Generated by mock local API"
        }
      };
    }

    if (method === "POST" && route === "/api/release/stable/create-pr") {
      if (this.offline) {
        return {
          status: 409,
          json: {
            code: "OFFLINE_BLOCKED",
            message: "Offline mode blocks remote release mutations. Reconnect and retry."
          }
        };
      }
      const request = payload?.request ?? {};
      if (!request.isOwner) {
        return {
          status: 403,
          json: {
            code: "OWNER_ONLY",
            message: "Only owner can initiate promote-stable PR."
          }
        };
      }
      if (!request.skillId || !request.version || !request.releaseId || !request.requestedBy) {
        return {
          status: 422,
          json: {
            code: "VALIDATION_ERROR",
            message: "skillId/version/releaseId/requestedBy are required"
          }
        };
      }
      return {
        status: 200,
        json: {
          prTitle: `promote-stable: ${request.skillId}@${request.version}`,
          prBody: "Generated by mock local API"
        }
      };
    }

    return {
      status: 404,
      json: { code: "NOT_FOUND", message: `Route not found: ${method} ${route}` }
    };
  }
}

async function validateTauriRouteContract() {
  const tauriBridge = await fs.readFile(
    path.join(root, "src-tauri", "src", "commands", "desktop.rs"),
    "utf8"
  );
  const requiredRoutes = [
    "/api/health",
    "/api/settings/skills/sources",
    "/api/market/sync",
    "/api/market/skills",
    "/api/release/beta/dry-run",
    "/api/release/beta/create-pr",
    "/api/release/stable/create-pr"
  ];
  for (const route of requiredRoutes) {
    if (!tauriBridge.includes(route)) {
      throw new Error(`Tauri bridge missing local API route contract: ${route}`);
    }
  }
}

await validateTauriRouteContract();

const service = new MockLocalApiService();
const boot = await service.start();
assert(boot.status === 200, "Startup health check should return 200");
assert(boot.json.ready === true, "Startup health check should report ready=true");

const createSource = await service.request("PUT", "/api/settings/skills/sources", {
  source: {
    id: "team-market",
    name: "Team Market",
    repoUrl: "https://github.com/org/team-skills",
    repoBranch: "main",
    skillsPath: "skills",
    curated: false,
    enabled: true
  }
});
assert(createSource.status === 200, "Upsert source should return 200");
assert(createSource.json.repoBranch === "main", "Upsert source should keep repoBranch");
assert(createSource.json.skillsPath === "skills", "Upsert source should keep skillsPath");

const createDisabledSource = await service.request("PUT", "/api/settings/skills/sources", {
  source: {
    id: "disabled-market",
    name: "Disabled Market",
    repoUrl: "https://github.com/org/disabled-skills",
    curated: false,
    enabled: false
  }
});
assert(createDisabledSource.status === 200, "Upsert disabled source should return 200");

const sync = await service.request("POST", "/api/market/sync", {
  sourceIds: ["team-market"]
});
assert(sync.status === 200, "Market sync should return 200");
assert(sync.json.indexedSources === 1, "Market sync should include one source");

const market = await service.request("POST", "/api/market/skills", {
  sourceIds: ["team-market"]
});
assert(market.status === 200, "Market query should return 200");
assert(Array.isArray(market.json.skills) && market.json.skills.length === 1, "Market query should return sample skill");

const syncDefaultSelection = await service.request("POST", "/api/market/sync", {
  sourceIds: []
});
assert(syncDefaultSelection.status === 200, "Market sync with empty selection should return 200");
assert(syncDefaultSelection.json.indexedSources === 1, "Market sync with empty selection should default to enabled sources only");

const marketDefaultSelection = await service.request("POST", "/api/market/skills", {
  sourceIds: []
});
assert(marketDefaultSelection.status === 200, "Market query with empty selection should return 200");
assert(
  Array.isArray(marketDefaultSelection.json.skills) && marketDefaultSelection.json.skills.length === 1,
  "Market query with empty selection should include enabled source skills only"
);

const dryRun = await service.request("POST", "/api/release/beta/dry-run", {
  request: { skillId: "day-day-up", version: "1.2.0-beta.1", releaseId: "r-1001" }
});
assert(dryRun.status === 200, "Beta dry-run should return 200 in online mode");

const betaPr = await service.request("POST", "/api/release/beta/create-pr", {
  request: { skillId: "day-day-up", version: "1.2.0-beta.1", releaseId: "r-1001" }
});
assert(betaPr.status === 200, "Beta PR creation should return 200 in online mode");

const ownerBlocked = await service.request("POST", "/api/release/stable/create-pr", {
  request: {
    skillId: "day-day-up",
    version: "1.2.0-beta.1",
    releaseId: "r-1001",
    requestedBy: "contributor-a",
    isOwner: false,
    evidence: {
      feedbackSummary: "good",
      testEnvironment: "mac",
      checklist: ["regression pass"],
      logsUrl: "https://example.com/logs",
      decision: "approve",
      riskNote: "low risk"
    }
  }
});
assert(ownerBlocked.status === 403, "Non-owner promote should be blocked with 403");
assert(ownerBlocked.json.code === "OWNER_ONLY", "Non-owner block code should be OWNER_ONLY");

const enableOffline = await service.request("POST", "/api/admin/offline", { offline: true });
assert(enableOffline.status === 200 && enableOffline.json.offline === true, "Offline toggle should succeed");

const offlineBlocked = await service.request("POST", "/api/release/beta/create-pr", {
  request: { skillId: "day-day-up", version: "1.2.0-beta.1", releaseId: "r-1001" }
});
assert(offlineBlocked.status === 409, "Offline beta PR creation should return 409");
assert(offlineBlocked.json.code === "OFFLINE_BLOCKED", "Offline block code should be OFFLINE_BLOCKED");

console.log("service-startup-smoke.check passed");
