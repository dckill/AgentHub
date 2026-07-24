# Codium 桌面实验

`packages/codium` 是一个独立 Electron/Vite/React 桌面实验包，不是主 AgentHub App 的发布路径。它包含编辑器、终端、树视图、Markdown、diff、Lexical/ProseMirror/Yjs 等依赖，适合探索更强的桌面工作台体验。

## 命令

```bash
pnpm codium
pnpm --filter codium dev
pnpm --filter codium build
pnpm --filter codium test
pnpm --filter codium typecheck
```

## 边界

- 主移动/Web/Tauri 客户端仍在 `packages/agenthub-app`。
- Codium 当前为 private package，文档只记录当前仓库存在的开发入口。
- 不应把 Codium 的实验能力写入用户级产品承诺，除非对应功能接入主流程并完成发布。
