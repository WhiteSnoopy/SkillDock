import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const app = await fs.readFile(path.join(root, "src", "app", "app.tsx"), "utf8");
const marketPage = await fs.readFile(path.join(root, "src", "pages", "market-page.tsx"), "utf8");
const sourceManager = await fs.readFile(path.join(root, "src", "components", "source-manager.tsx"), "utf8");
const betaPanel = await fs.readFile(path.join(root, "src", "components", "beta-release-panel.tsx"), "utf8");
const promotePanel = await fs.readFile(path.join(root, "src", "components", "promote-stable-panel.tsx"), "utf8");
const desktopApi = await fs.readFile(path.join(root, "src", "lib", "desktop-api.ts"), "utf8");
const tauriCommand = await fs.readFile(path.join(root, "src-tauri", "src", "commands", "desktop.rs"), "utf8");
const tauriRegister = await fs.readFile(path.join(root, "src-tauri", "src", "desktop_commands.rs"), "utf8");

if (!app.includes("MarketPage") || !app.includes("ReleaseCenterPage")) {
  throw new Error("Desktop app shell missing market/release routing");
}

if (!app.includes("isOwner") || !app.includes("setIsOwner") || !app.includes("role-pill")) {
  throw new Error("Desktop shell missing role toggle to verify owner-only flow");
}

if (!marketPage.includes("syncMarketIndex") || !marketPage.includes("sourceHealth")) {
  throw new Error("Market page missing refresh status or source health wiring");
}

if (
  !sourceManager.includes("checkSourceReachability") ||
  !sourceManager.includes("editSource") ||
  !sourceManager.includes("toggleSourceEnabled") ||
  !sourceManager.includes("remove(")
) {
  throw new Error("Source manager missing add/edit/enable/disable/remove/reachability flow");
}

if (!betaPanel.includes("dryRunBetaRelease") || !betaPanel.includes("createBetaReleasePr")) {
  throw new Error("Beta release panel missing dry-run or PR creation action");
}

if (!promotePanel.includes("isOwner") || !promotePanel.includes("createPromoteStablePr")) {
  throw new Error("Promote stable panel missing owner-only gate or creation action");
}

for (const command of [
  "local_api_health",
  "check_repo_source",
  "sync_market_index",
  "get_market_skills",
  "dry_run_beta_release",
  "create_beta_release_pr",
  "create_promote_stable_pr"
]) {
  if (!desktopApi.includes(command)) {
    throw new Error(`Desktop API missing tauri command mapping: ${command}`);
  }
}

if (!tauriCommand.includes("route_to_local_api") || !tauriCommand.includes("/api/release/beta/create-pr")) {
  throw new Error("Tauri bridge missing local API routing for beta release");
}

if (!tauriCommand.includes("/api/release/stable/create-pr") || !tauriCommand.includes("OWNER_ONLY")) {
  throw new Error("Tauri bridge missing owner guard or stable promotion route");
}

if (!tauriCommand.includes("OFFLINE_BLOCKED")) {
  throw new Error("Tauri bridge missing offline guard feedback");
}

if (
  !tauriRegister.includes("local_api_health") ||
  !tauriRegister.includes("check_repo_source") ||
  !tauriRegister.includes("sync_market_index")
) {
  throw new Error("Desktop command registry missing health/source/sync command");
}

console.log("desktop-integration.check passed");
