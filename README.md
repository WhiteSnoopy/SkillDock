# SkillDock Skill Agent (Desktop)

SkillDock 是一个桌面应用，用于 Skill 市场浏览、安装管理和发布流程。

## Requirements

| Item | Version / Notes |
| --- | --- |
| OS | 推荐 `macOS` / `Linux`；Windows 建议 `WSL2` 或 `Git Bash` |
| Node.js | `>= 18` |
| pnpm | 已安装即可 |
| Rust | 已安装 `rustc` / `cargo`（Tauri 必需） |

快速检查：

```bash
node -v
pnpm -v
rustc -V
cargo -V
```

## Quick Start

```bash
# 1) 安装依赖
pnpm install

# 2) 终端 A：启动本地 API
pnpm dev:api
```

```bash
# 3) 终端 B：启动桌面应用
pnpm dev:app
```

启动成功标志：

- 访问 `http://127.0.0.1:2027/api/health` 返回健康状态
- `pnpm dev:app` 正常运行且桌面窗口打开

说明：`pnpm dev:api` 默认监听 `127.0.0.1:2027`，不需要手动传 `--host/--port`。

停止：

```bash
# 分别在两个终端按 Ctrl + C
```

## Troubleshooting

```bash
# 查看启动日志
tail -n 120 .runtime/desktop-stack/logs/backend.log
tail -n 120 .runtime/desktop-stack/logs/desktop.log
```

## Docs

- 其他开发命令：查看 `package.json` 的 `scripts`
- 启动脚本说明：[docs/desktop-stack-startup.md](./docs/desktop-stack-startup.md)
- 技术方案：[docs/technical-solution.md](./docs/technical-solution.md)
- 角色说明：[docs/operator-roles.md](./docs/operator-roles.md)
