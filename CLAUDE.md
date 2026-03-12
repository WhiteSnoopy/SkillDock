# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm install              # Install dependencies
pnpm start:stack          # One-command startup: local API + Tauri dev (with health checks)
pnpm stop:stack           # Stop the entire stack
pnpm dev                  # Vite dev server only (127.0.0.1:1420)
pnpm dev:api              # Local API server only (127.0.0.1:2027)
pnpm dev:app              # Tauri desktop app (starts Vite automatically)
pnpm build                # tsc && vite build
pnpm tauri:build          # Full desktop app bundle (macOS/Linux/Windows)
```

## Testing

Tests are plain Node.js `.mjs` scripts in `/tests/` (no test framework). Run all tests:

```bash
node scripts/run-test-suite.mjs
```

The 8 `.check.mjs` files run sequentially. They use assertions and source-file reading to verify structural expectations.

## Architecture

**Four-layer call chain:**

```
React UI → desktop-api.ts (Tauri invoke bridge) → Rust commands (src-tauri/) → Local API HTTP server (port 2027)
```

- **Frontend**: React 18 + TypeScript + Vite 6. Plain CSS (no Tailwind, no CSS modules). No router — tab-based navigation via state in `app.tsx` (`"market" | "local" | "camp" | "release"`). No external state management — React useState/useEffect only.
- **Bridge**: `src/lib/desktop-api.ts` wraps `window.__TAURI__.core.invoke()` with unified `GuardedError` handling.
- **Desktop shell**: Tauri 2 (Rust). Commands in `src-tauri/src/commands/desktop.rs` proxy to the local API with configurable timeout (12s default, 120s for release ops). All Tauri commands use camelCase serde renaming.
- **Local API**: Monolithic Node.js HTTP server in `scripts/dev-local-api.mjs` (port 2027). JSON file persistence in `.runtime/desktop-stack/local-api/`.

**Note:** `src-api/` contains domain modules that are **not wired into the default startup chain** — the actual API logic lives in `scripts/dev-local-api.mjs`.

## Key Patterns

- **Error model**: `GuardedError` with codes: `OFFLINE_BLOCKED`, `OWNER_ONLY`, `SUPERVISOR_APPROVAL_REQUIRED`, `UNREACHABLE_SOURCE`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `UNKNOWN`. Status banner in UI renders contextual hints per error code.
- **i18n**: Inline per-component `TEXT` objects with `zh`/`en` keys; locale passed as prop, persisted in localStorage.
- **Modals**: Use `createPortal` to `document.body` for correct positioning in the scaled container.
- **Hook**: `use-guarded-action.ts` wraps async operations with loading/error state management.
- **Release governance**: Three roles (Author, Skill Owner, Supervisor). GitHub Actions enforce approval gates before merge. See `.github/supervisors.json` and `.github/skill-owners.json`.

## Environment Variables

- `SkillDock_LOCAL_API_BASE` — Override local API base URL
- `SkillDock_GITHUB_TOKEN` (or `GITHUB_TOKEN`/`GH_TOKEN`) — GitHub API auth
- `SkillDock_SKILLS_SSOT_DIR`, `SkillDock_SKILLS_TARGET_DIR` — Skill directories
- `SkillDock_RELEASE_REPO_URL`, `SkillDock_RELEASE_REPO_BRANCH`, `SkillDock_RELEASE_REPO_DIR` — Release config

Environment files (`.env.local`, `.env`) are loaded by the stack startup script.

## TypeScript & Rust Config

- TypeScript: strict mode, ES2021 target, bundler module resolution
- Rust: edition 2021, reqwest with rustls-tls (no openssl dependency)
- No ESLint or Prettier configured
