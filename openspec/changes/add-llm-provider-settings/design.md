## Context

SkillDock 使用四层架构：React UI → `desktop-api.ts` (Tauri invoke bridge) → Rust commands → Local API (Node.js HTTP server, port 2027)。当前 Settings 仅有一个小 modal 包含语言切换和 Team Repo URL，无任何 LLM 配置。

参照项目 easeWork 的 LLM Provider 设计：多 Provider 管理、单 active、JSON 文件持久化、API Key 掩码保护。easeWork 底层所有 Provider 统一走 Claude Agent SDK，连通性测试使用原生 `fetch` 发最小请求。

Local API (`scripts/dev-local-api.mjs`) 是纯 Node.js HTTP server，零外部运行时依赖。Rust 层的 `request_local_api` 使用 `&'static str` 路径，不支持动态 `:id` 路由。

## Goals / Non-Goals

**Goals:**

- 用户可在 Settings 中管理多个 LLM Provider（CRUD + 激活 + 连通性测试）
- 数据持久化到本地，API Key 安全保护
- 引入 `@anthropic-ai/sdk` 依赖，为后续 AI 功能铺路
- 四层贯通：UI → Bridge → Rust → Local API 全链路可用

**Non-Goals:**

- 不实现任何 AI 功能（技能推荐、技能生成）——本次只做配置层
- 不做 SetupGuard（启动时强制配置 Provider）——保持可选
- 不做 Provider 插件化架构——简单的配置存储和 CRUD
- 不在连通性测试中使用 SDK——直接 `fetch` 调 `/v1/messages`

## Decisions

### 1. 统一 Anthropic `/v1/messages` 协议测试

**选择**: 连通性测试统一构造 Anthropic 格式的请求（`x-api-key` + `anthropic-version` header，`/v1/messages` endpoint），用原生 `fetch` 发 `max_tokens: 1` 的 streaming 请求，读第一个 chunk 即 cancel。

**备选**: (A) 按 Provider 类型分别构造 OpenAI/Anthropic 两种格式；(B) 引入 SDK 做测试。

**理由**: 所有 Provider 底层都将走 Anthropic 协议（通过 baseUrl 转发），测试时也用同一协议最能验证实际可用性。原生 `fetch` 无额外依赖，轻量快速。

### 2. Rust 层新增动态路径辅助函数

**选择**: 新增 `request_local_api_dynamic(method, path: &str, payload, timeout)` 函数，与现有 `request_local_api_with_timeout` 逻辑相同但接受 `&str` 而非 `&'static str`。

**备选**: (A) 将所有现有函数的签名改为 `&str`；(B) 在每个 command 中内联构造 URL。

**理由**: 最小改动，不影响现有 18 个 command 的签名。`:id` 路由只在 LLM provider 的 4 个 endpoint 中出现（update/delete/activate/test），新函数专门服务这些场景。

### 3. Settings Modal 双 Tab（而非独立页面）

**选择**: 在现有 Settings Modal 内部新增 Tab 切换（通用 | LLM），不新增顶级 Page Tab。

**备选**: (A) 新增 `"settings"` 到 `Page` union type 作为独立页面。

**理由**: SkillDock 的 4 个 Tab（market/local/camp/release）都是核心业务功能。Settings 是辅助功能，作为 Modal 内 Tab 更合适。LLM 配置项数量可控（列表 + 表单），不需要整页空间。

### 4. 独立的 `llm-providers.json` 持久化文件

**选择**: 新建独立文件 `.runtime/desktop-stack/local-api/llm-providers.json`，不合并到 `general-settings.json`。

**备选**: 扩展 `GeneralSettings` 接口加入 `llmProviders` 字段。

**理由**: 关注点分离。LLM Provider 配置包含敏感数据（API Key），独立文件便于未来做加密或权限控制。也避免改动现有 `GeneralSettings` 的 Rust struct 和 API 契约。

### 5. SDK 安装但不使用

**选择**: `pnpm add @anthropic-ai/sdk`，本次不在代码中 import，仅作为依赖声明。

**理由**: 后续 AI 功能（技能推荐、技能生成）需要 SDK。提前安装避免后续 change 还要处理依赖。连通性测试不需要 SDK——原生 `fetch` 更轻量。

### 6. Provider 类型切换自动填充默认值

**选择**: 用户在添加/编辑表单中切换 Provider 类型时，自动填充该类型的默认 model 和 baseUrl。Model 字段使用 `<input>` + `<datalist>` 实现下拉建议 + 自由输入。

**理由**: 降低用户配置门槛——选好类型就有合理默认值，同时保留自定义灵活性。参照 easeWork 的 `handleProviderTypeChange` 行为。

## Risks / Trade-offs

**[统一 Anthropic 协议可能对非兼容 Provider 失败]** → 文档说明要求 Provider 的 baseUrl 需支持 Anthropic API 格式。这是设计约束，而非 bug——与 Claude Agent SDK 的使用前提一致。

**[API Key 明文存储在 JSON 文件中]** → 与 easeWork 一致，本次不做加密。文件在用户本地 `.runtime/` 目录下，权限受 OS 文件系统保护。后续可考虑 keychain 集成。

**[test 超时可能较长]** → 外部 API 请求受网络影响。test endpoint 设 15 秒超时，Rust 代理层设 30 秒超时（留缓冲）。UI 端显示 loading 状态。

**[Settings Modal 空间有限]** → Provider 列表较长时需要滚动。本次不做虚拟滚动——预期用户配置 Provider 数量 < 10，普通滚动足够。
