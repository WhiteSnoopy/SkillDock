## 1. Setup & Types

- [x] 1.1 Install `@anthropic-ai/sdk` dependency: `pnpm add @anthropic-ai/sdk`
- [x] 1.2 Add TypeScript types in `src/types/models.ts`: `LlmProviderType`, `LlmProviderConfig`, `LlmSettings`, `LlmProviderTestResult`

## 2. Local API — Persistence & CRUD

- [x] 2.1 Add `LLM_PROVIDERS_STATE_FILE` constant and `llmSettings` in-memory object in `scripts/dev-local-api.mjs`, load from file on startup
- [x] 2.2 Add `LLM_PROVIDER_DEFAULTS` constant (6 providers: default model + baseUrl) and `saveLlmSettings()` / `maskApiKey()` helpers
- [x] 2.3 Implement `GET /api/settings/llm/providers` — return llmSettings with masked apiKeys
- [x] 2.4 Implement `POST /api/settings/llm/providers` — create provider with generated id, auto-activate if first
- [x] 2.5 Implement `PUT /api/settings/llm/providers/:id` — update provider, apiKey sentinel protection
- [x] 2.6 Implement `DELETE /api/settings/llm/providers/:id` — delete provider, auto-switch active if needed
- [x] 2.7 Implement `POST /api/settings/llm/providers/:id/activate` — set activeProviderId

## 3. Local API — Connectivity Test

- [x] 3.1 Implement `testProviderConnection()` function: build Anthropic-format headers (`x-api-key`, `anthropic-version: 2023-06-01`), construct endpoint (`{baseUrl}/v1/messages`), send `fetch` with `{ model, max_tokens: 1, stream: true }`, read first chunk then cancel, return `{ success, latency, model }` or error
- [x] 3.2 Implement `POST /api/settings/llm/providers/:id/test` endpoint wired to `testProviderConnection()`

## 4. Rust Commands

- [x] 4.1 Add `request_local_api_dynamic()` and `request_local_api_dynamic_with_timeout()` functions in `desktop.rs` accepting `&str` path
- [x] 4.2 Add `LlmProviderConfig` and `LlmSettings` structs with `#[serde(rename_all = "camelCase")]`
- [x] 4.3 Implement `get_llm_providers` command (GET, static path, 12s timeout)
- [x] 4.4 Implement `add_llm_provider` command (POST, static path, 12s timeout)
- [x] 4.5 Implement `update_llm_provider` command (PUT, dynamic path with id, 12s timeout)
- [x] 4.6 Implement `delete_llm_provider` command (DELETE, dynamic path with id, 12s timeout)
- [x] 4.7 Implement `activate_llm_provider` command (POST, dynamic path with id, 12s timeout)
- [x] 4.8 Implement `test_llm_provider` command (POST, dynamic path with id, 30s timeout)
- [x] 4.9 Register all 6 commands in `desktop_commands.rs` `tauri::generate_handler![]`

## 5. Bridge Layer

- [x] 5.1 Add imports for new types in `src/lib/desktop-api.ts`
- [x] 5.2 Implement `fetchLlmProviders()` → `invokeGuarded<LlmSettings>("get_llm_providers")`
- [x] 5.3 Implement `addLlmProvider(provider)` → `invokeGuarded("add_llm_provider", { provider })`
- [x] 5.4 Implement `updateLlmProvider(id, updates)` → `invokeGuarded("update_llm_provider", { id, updates })`
- [x] 5.5 Implement `deleteLlmProvider(id)` → `invokeGuarded("delete_llm_provider", { id })`
- [x] 5.6 Implement `activateLlmProvider(id)` → `invokeGuarded("activate_llm_provider", { id })`
- [x] 5.7 Implement `testLlmProvider(id)` → `invokeGuarded("test_llm_provider", { id })`

## 6. UI — Settings Modal Tabs & i18n

- [x] 6.1 Add zh/en i18n text entries for LLM tab in `APP_TEXT` (~20 keys: tab labels, form labels, actions, feedback messages)
- [x] 6.2 Add `settingsTab` state (`"general" | "llm"`) and render tab switcher in settings modal header
- [x] 6.3 Wrap existing settings content (language + team repo URL) under "general" tab conditional
- [x] 6.4 Add CSS for settings tabs (`.settings-tabs`, `.settings-tab`, `.settings-tab-active`) in `app.css` and warm-theme overrides in `redesign.css`

## 7. UI — LLM Provider List View

- [x] 7.1 Add LLM state variables: `llmSettings`, `llmLoading`, `llmError`, `llmSuccess`
- [x] 7.2 Load providers via `fetchLlmProviders()` when LLM tab activates
- [x] 7.3 Render provider card list: avatar (first letter), name, provider type, masked apiKey, Active badge, action buttons (activate/test/edit/delete)
- [x] 7.4 Render empty state when no providers configured
- [x] 7.5 Implement activate handler: call `activateLlmProvider(id)`, refresh list
- [x] 7.6 Implement delete handler: `confirm()` dialog, call `deleteLlmProvider(id)`, refresh list
- [x] 7.7 Implement test handler: call `testLlmProvider(id)`, display success/failure + latency on card
- [x] 7.8 Add CSS for provider list (`.llm-provider-list`, `.llm-provider-card`, `.llm-provider-avatar`, `.llm-provider-badge`, `.llm-provider-actions`, `.llm-provider-test-result`) in `app.css` + `redesign.css`

## 8. UI — LLM Provider Add/Edit Form

- [x] 8.1 Add form state: `isEditingProvider`, `editingProviderId`, `providerForm` (name, provider, apiKey, model, baseUrl)
- [x] 8.2 Render form with fields: name (input), provider type (select), API Key (password input), model (input + datalist), Base URL (input, optional)
- [x] 8.3 Implement provider type change handler: auto-fill default model + baseUrl from `LLM_PROVIDER_DEFAULTS`
- [x] 8.4 Add `LLM_PROVIDER_MODELS` constant (model candidates per provider type) and wire to datalist
- [x] 8.5 Implement save handler: validate required fields (name, apiKey, model), call `addLlmProvider()` or `updateLlmProvider()`, refresh list
- [x] 8.6 Implement edit button: populate form with existing provider data (apiKey shows placeholder), switch to form view
- [x] 8.7 Add CSS for form (`.llm-form`, `.llm-form-field`, `.llm-form-actions`) in `app.css` + `redesign.css`

## 9. Verification

- [x] 9.1 Verify `pnpm build` passes with no type errors
- [x] 9.2 Start stack with `pnpm start:stack`, confirm LLM tab renders in settings modal
- [x] 9.3 End-to-end test: add a provider → verify it appears in list → edit it → activate it → test connectivity → delete it
