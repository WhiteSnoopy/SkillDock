import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const startupScriptPath = path.join(root, "scripts", "start-desktop-stack.sh");
const stopScriptPath = path.join(root, "scripts", "stop-desktop-stack.sh");

const startup = await fs.readFile(startupScriptPath, "utf8");
const stop = await fs.readFile(stopScriptPath, "utf8");

if (!startup.includes("cleanup_port")) {
  throw new Error("Startup script must define cleanup_port");
}

if (!startup.includes("lsof -nP -tiTCP") || !startup.includes("-sTCP:LISTEN")) {
  throw new Error("Startup script must detect listening process by port");
}

if (!startup.includes("kill ${pids}") || !startup.includes("kill -9 ${remain}")) {
  throw new Error("Startup script must clean occupied port before start");
}

if (!startup.includes("BACKEND_CMD") || !startup.includes("DESKTOP_CMD")) {
  throw new Error("Startup script must start backend and desktop commands");
}

if (!startup.includes("wait_http_ready") || !startup.includes("curl -fsS")) {
  throw new Error("Startup script must verify service health after start");
}

if (!startup.includes("wait_http_stable") || !startup.includes("DESKTOP_STABLE_SECONDS")) {
  throw new Error("Startup script must verify desktop stability window");
}

if (!startup.includes("wait_log_pattern") || !startup.includes("DESKTOP_LOG_READY_PATTERN")) {
  throw new Error("Startup script must verify desktop runtime log readiness");
}

if (!startup.includes("/api/health") || !startup.includes("DESKTOP_HEALTH_URL")) {
  throw new Error("Startup script must check backend and desktop health endpoints");
}

if (!stop.includes("cleanup_port") || !stop.includes("stop_pid_file")) {
  throw new Error("Stop script must stop pid and cleanup ports");
}

console.log("startup-script.check passed");
