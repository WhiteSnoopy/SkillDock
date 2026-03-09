# Desktop Stack Startup

## Start

```bash
./scripts/start-desktop-stack.sh
```

Startup flow:

1. Detect occupied ports (`API_PORT`, `DESKTOP_PORT`)
2. Clean occupied ports
3. Start backend process
4. Verify backend health (`/api/health`)
5. Start desktop process
6. Verify desktop web entry (`http://127.0.0.1:1420`)
7. For `tauri dev`, wait for runtime log pattern (`target/debug/skilldock-desktop`)

## Stop

```bash
./scripts/stop-desktop-stack.sh
```

## Environment Overrides

- `API_HOST` (default `127.0.0.1`)
- `API_PORT` (default `2027`)
- `DESKTOP_HOST` (default `127.0.0.1`)
- `DESKTOP_PORT` (default `1420`)
- `BACKEND_CMD` (default `node scripts/dev-local-api.mjs ...`)
- `DESKTOP_CMD` (default `pnpm tauri dev`)
- `API_HEALTH_URL` (default `http://$API_HOST:$API_PORT/api/health`)
- `DESKTOP_HEALTH_URL` (default `http://$DESKTOP_HOST:$DESKTOP_PORT`)
- `DESKTOP_STABLE_SECONDS` (default `12`)
- `DESKTOP_LOG_READY_PATTERN` (default auto for tauri: `target/debug/skilldock-desktop`)
- `DESKTOP_LOG_READY_TIMEOUT` (default `240`)

Example (switch to your real commands):

```bash
BACKEND_CMD="pnpm --filter src-api dev" \
DESKTOP_CMD="pnpm tauri dev" \
./scripts/start-desktop-stack.sh
```

If you only want a headless desktop stub (no GUI), you can still use:

```bash
DESKTOP_CMD="node scripts/dev-desktop-app.mjs --host 127.0.0.1 --port 1420 --apiBase http://127.0.0.1:2027" \
./scripts/start-desktop-stack.sh
```
