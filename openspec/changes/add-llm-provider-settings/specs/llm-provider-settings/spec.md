## ADDED Requirements

### Requirement: Multi-provider management

系统 SHALL 支持同时配置多个 LLM Provider，每个 Provider 包含 id、name、provider 类型、apiKey、model、baseUrl（可选）、enabled、createdAt、updatedAt 字段。系统 SHALL 支持 6 种 Provider 类型：`claude`、`openai`、`deepseek`、`openrouter`、`glm`、`kimi`。

#### Scenario: Add first provider
- **WHEN** 用户添加第一个 Provider（提供 name、provider、apiKey、model）
- **THEN** 系统生成唯一 id（格式 `provider_{timestamp}_{random7hex}`），设 `enabled: true`，并自动将其设为 active

#### Scenario: Add subsequent provider
- **WHEN** 已存在至少一个 Provider，用户添加新 Provider
- **THEN** 新 Provider 被创建但不改变当前 active 状态

#### Scenario: Edit provider
- **WHEN** 用户修改已有 Provider 的字段
- **THEN** 系统更新对应字段并刷新 `updatedAt` 时间戳

#### Scenario: Delete active provider
- **WHEN** 用户删除当前 active 的 Provider，且列表中还有其他 Provider
- **THEN** 系统将列表中第一个剩余 Provider 自动设为 active

#### Scenario: Delete last provider
- **WHEN** 用户删除唯一的 Provider
- **THEN** `activeProviderId` 设为 `null`

### Requirement: Single active provider

系统 SHALL 在任意时刻只有一个 Provider 处于 active 状态，通过 `activeProviderId` 标识。

#### Scenario: Activate provider
- **WHEN** 用户激活一个非 active 的 Provider
- **THEN** `activeProviderId` 更新为该 Provider 的 id

#### Scenario: Only one active at a time
- **WHEN** 用户激活 Provider B（当前 active 为 Provider A）
- **THEN** Provider B 成为 active，Provider A 不再是 active，无需额外操作

### Requirement: API Key security

系统 SHALL 对 API Key 实施掩码保护。GET 接口返回时，非空 apiKey MUST 替换为 `"***configured***"`，空 apiKey 返回空字符串。PUT 接口接收到 `"***configured***"` 时 MUST 保留原始值不覆盖。

#### Scenario: GET returns masked key
- **WHEN** 请求获取 Provider 列表
- **THEN** 所有 Provider 的 apiKey 字段返回 `"***configured***"`（已配置时）或 `""`（未配置时）

#### Scenario: PUT preserves key with sentinel
- **WHEN** 更新 Provider 时 apiKey 值为 `"***configured***"`
- **THEN** 系统保留该 Provider 原有的 apiKey 值不变

#### Scenario: PUT updates key with real value
- **WHEN** 更新 Provider 时 apiKey 值为新的真实 key
- **THEN** 系统使用新 key 覆盖原有值

### Requirement: Connectivity test via Anthropic protocol

系统 SHALL 提供连通性测试功能，统一使用 Anthropic `/v1/messages` 协议格式。测试 MUST 发送 `max_tokens: 1` 的 streaming 请求，只读取第一个 chunk 后 cancel stream，返回成功/失败状态和响应延迟。

#### Scenario: Test success
- **WHEN** 用户对已配置的 Provider 执行连通性测试，且 API Key 和 endpoint 有效
- **THEN** 系统返回 `{ success: true, latency: <ms>, model: <model> }`

#### Scenario: Test failure — invalid key
- **WHEN** 用户对 API Key 无效的 Provider 执行连通性测试
- **THEN** 系统返回 `{ success: false, error: <摘要>, details: <HTTP 错误信息>, latency: <ms> }`

#### Scenario: Test failure — unreachable endpoint
- **WHEN** 用户对 endpoint 不可达的 Provider 执行连通性测试
- **THEN** 系统返回 `{ success: false, error: <摘要>, details: <网络错误信息> }`

#### Scenario: Test headers
- **WHEN** 构造测试请求
- **THEN** Headers MUST 包含 `x-api-key`、`anthropic-version: 2023-06-01`、`Authorization: Bearer <key>`、`Content-Type: application/json`

### Requirement: Provider defaults auto-fill

系统 SHALL 为每种 Provider 类型预置默认 model 和 baseUrl。用户切换 Provider 类型时，系统 MUST 自动填充对应默认值。

#### Scenario: Switch provider type in form
- **WHEN** 用户在添加/编辑表单中将 Provider 类型从 `claude` 切换为 `deepseek`
- **THEN** Model 字段自动填充为 `deepseek-chat`，Base URL 字段自动填充为 `https://api.deepseek.com`

#### Scenario: Model input with suggestions
- **WHEN** 用户聚焦 Model 输入框
- **THEN** 系统展示当前 Provider 类型的候选 model 列表，同时允许自由输入自定义 model

### Requirement: JSON file persistence

系统 SHALL 将 LLM Provider 配置持久化到 `.runtime/desktop-stack/local-api/llm-providers.json`，格式为 `{ activeProviderId, providers[] }`。每次 CRUD 操作后 MUST 立即写入文件。启动时从文件加载，文件不存在时使用默认值 `{ activeProviderId: null, providers: [] }`。

#### Scenario: Persist after add
- **WHEN** 成功添加一个新 Provider
- **THEN** `llm-providers.json` 文件立即包含新 Provider 数据

#### Scenario: Load on startup
- **WHEN** Local API 服务启动
- **THEN** 从 `llm-providers.json` 加载已有配置到内存；文件不存在时使用空默认值

### Requirement: Four-layer API chain

系统 SHALL 通过四层架构暴露 6 个 LLM Provider 操作：GET（列表）、POST（新增）、PUT（修改）、DELETE（删除）、POST activate（激活）、POST test（测试）。每个操作 MUST 贯穿 UI → Bridge (`desktop-api.ts`) → Rust command → Local API HTTP endpoint。

#### Scenario: Full chain — add provider
- **WHEN** 用户在 UI 填写表单并点击保存
- **THEN** UI 调用 Bridge 函数 → Tauri invoke Rust command → Rust proxy 到 Local API POST endpoint → 返回新 Provider 数据（apiKey 已掩码）→ UI 刷新列表

#### Scenario: Rust dynamic path routing
- **WHEN** Rust 命令需要代理含 `:id` 的路径（如 `/api/settings/llm/providers/{id}`）
- **THEN** 使用动态路径辅助函数构造 URL，而非 `&'static str`

### Requirement: Settings Modal dual-tab UI

系统 SHALL 在现有 Settings Modal 中提供双 Tab 切换：**通用** Tab（保留语言切换 + Team Repo URL）和 **LLM** Tab（Provider 管理）。LLM Tab MUST 包含列表视图（展示所有 Provider 卡片 + 操作按钮）和添加/编辑表单视图（name、provider 类型、apiKey、model、baseUrl 字段）。所有文案 MUST 支持 zh/en 双语。

#### Scenario: Tab switching
- **WHEN** 用户点击 "LLM" Tab
- **THEN** 面板内容切换为 Provider 列表视图，并加载最新 Provider 数据

#### Scenario: Empty state
- **WHEN** LLM Tab 打开且无任何 Provider 配置
- **THEN** 显示空状态提示文案和"添加 Provider"入口

#### Scenario: Provider card display
- **WHEN** LLM Tab 显示 Provider 列表
- **THEN** 每张卡片展示首字母头像、名称、Provider 类型、apiKey 掩码状态、Active 徽章（仅激活项），及操作按钮（激活/测试/编辑/删除）

#### Scenario: Test result display
- **WHEN** 用户点击测试按钮并收到结果
- **THEN** 在对应卡片内短暂显示成功（含延迟 ms）或失败信息
