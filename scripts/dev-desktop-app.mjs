import http from "node:http";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "1420" },
    host: { type: "string", default: "127.0.0.1" },
    apiBase: { type: "string", default: "http://127.0.0.1:2027" }
  }
});

const port = Number(values.port);
const host = values.host;
const apiBase = values.apiBase;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid port: ${values.port}`);
}

let backendHealthy = false;
let backendMessage = "not checked";
let lastProbeAt = "";

async function probeBackend() {
  lastProbeAt = new Date().toISOString();
  try {
    const resp = await fetch(`${apiBase}/api/health`);
    if (!resp.ok) {
      backendHealthy = false;
      backendMessage = `health status ${resp.status}`;
      return;
    }
    const data = await resp.json();
    backendHealthy = Boolean(data?.ready);
    backendMessage = backendHealthy ? "ready" : "not ready";
  } catch (error) {
    backendHealthy = false;
    backendMessage = error instanceof Error ? error.message : "unknown";
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { code: "BAD_REQUEST", message: "invalid request" });
    return;
  }

  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, backendHealthy ? 200 : 503, {
      status: backendHealthy ? "ok" : "degraded",
      backendHealthy,
      backendMessage,
      apiBase,
      lastProbeAt
    });
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    sendJson(res, 200, {
      app: "desktop-dev-app",
      status: "running",
      backendHealthy,
      apiBase
    });
    return;
  }

  sendJson(res, 404, {
    code: "NOT_FOUND",
    message: `Route not found: ${req.method} ${req.url}`
  });
});

await probeBackend();
setInterval(() => {
  void probeBackend();
}, 2000).unref();

server.on("listening", () => {
  console.log(`[desktop-app] listening on http://${host}:${port}, backend=${apiBase}`);
});

server.listen(port, host);

function shutdown(signal) {
  console.log(`[desktop-app] received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
