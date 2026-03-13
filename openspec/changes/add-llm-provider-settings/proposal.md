## Why

SkillDock 桌面端当前没有任何 LLM 相关配置。未来计划引入 AI 辅助功能（技能推荐、技能生成），需要一个用户可配置的 LLM Provider 管理系统作为基础设施。本次先交付配置层，确保用户可以配置和验证 Provider，后续 AI 功能可直接消费这些配置。

## What Changes

- 新增 LLM Provider 数据模型（`LlmProviderConfig`、`LlmSettings`、`LlmProviderTestResult`）
- Local API 新增 6 个 endpoint：Provider 的 CRUD + 激活 + 连通性测试
- 新增 `llm-providers.json` 持久化文件
- Rust 命令层新增 6 个 Tauri command 代理到 Local API（含动态路径支持）
- Bridge 层新增 6 个 `invokeGuarded` 包装函数
- Settings Modal 从单一面板改造为双 Tab 结构（通用 + LLM）
- LLM Tab 提供 Provider 列表视图 + 添加/编辑表单，支持增删改查、激活、连通性测试
- 支持 6 种 Provider：claude、openai、deepseek、openrouter、glm、kimi
- 引入 `@anthropic-ai/sdk` 依赖（为后续 AI 辅助功能做准备）
- 连通性测试使用原生 `fetch` 调用 Anthropic `/v1/messages` 接口
- API Key 安全：GET 时掩码为 `***configured***`，PUT 时哨兵值保护

## Capabilities

### New Capabilities

- `llm-provider-settings`: LLM Provider 配置管理能力——多 Provider CRUD、单 active 激活、连通性测试、API Key 安全、持久化存储，贯穿四层架构（UI → Bridge → Rust → Local API）

### Modified Capabilities

_(无现有 capability 被修改)_

## Impact

- **类型层**: `src/types/models.ts` 新增 4 个 interface/type
- **Local API**: `scripts/dev-local-api.mjs` 新增 ~300 行（6 个 endpoint + 测试函数 + 持久化）
- **Rust 层**: `src-tauri/src/commands/desktop.rs` 新增 6 个 command + 动态路径辅助函数；`desktop_commands.rs` 注册
- **Bridge 层**: `src/lib/desktop-api.ts` 新增 6 个导出函数
- **UI 层**: `src/app/app.tsx` Settings Modal 重构为双 Tab；`app.css` + `redesign.css` 新增样式
- **持久化**: 新增 `.runtime/desktop-stack/local-api/llm-providers.json`
- **外部依赖**: 新增 `@anthropic-ai/sdk`（本次仅安装，为后续 AI 功能准备；连通性测试用原生 `fetch`）
