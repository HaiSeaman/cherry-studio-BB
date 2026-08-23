# Cherry Studio BB · Code Wiki

> 本 Wiki 基于 2026-08 对仓库源码的静态分析生成，对应版本 **v1.6.1**（fork：`CherryHQ/cherry-studio` 的中文增强分支 `Cherry-Studio-BB`）。

## 文档目录

| 编号 | 文档 | 内容 |
|---|---|---|
| 01 | [项目概览](./01-项目概览.md) | 项目定位、技术栈、仓库目录结构 |
| 02 | [整体架构](./02-整体架构.md) | Electron 三进程架构、启动流程、IPC 通信机制、数据流 |
| 03 | [主进程模块](./03-主进程模块.md) | `src/main` 入口、服务层、内置 MCP Server、关键类与方法 |
| 04 | [渲染进程模块](./04-渲染进程模块.md) | `src/renderer` 入口与路由、页面模块、服务层、Hooks |
| 05 | [AI 核心体系](./05-AI核心体系.md) | `packages/aiCore` 执行器/插件/Provider 扩展体系、渲染层包装、消息收发链路 |
| 06 | [数据存储与状态管理](./06-数据存储与状态管理.md) | Redux Toolkit / redux-persist、Dexie(IndexedDB)、跨窗口同步、备份恢复 |
| 07 | [依赖关系](./07-依赖关系.md) | 模块间依赖图、workspace 包关系、第三方关键依赖、patches |
| 08 | [构建运行与测试](./08-构建运行与测试.md) | 环境要求、开发调试、打包发布、测试体系、代码规范工具链 |

## 一图速览

```
┌─────────────────────────────────────────────────────────────┐
│                     Cherry Studio (Electron)                │
│                                                             │
│  Main 主进程 (src/main)          Renderer 渲染层 (src/renderer)│
│  ├─ index.ts 启动编排            ├─ React 19 + Redux Toolkit │
│  ├─ services/* 30+ 服务         ├─ pages/home 聊天工作台      │
│  ├─ ipc.ts IPC 注册中心          ├─ aiCore → @cherrystudio/ai-core
│  └─ mcpServers 内置MCP           ├─ Dexie (IndexedDB v12)    │
│                                 └─ 5 个 HTML 多入口窗口       │
│         ▲│ invoke/handle (IpcChannel 枚举, packages/shared)   │
│         │▼                                                   │
│  Preload (src/preload) — contextBridge 安全桥                 │
└─────────────────────────────────────────────────────────────┘
        packages/aiCore (@cherrystudio/ai-core, Vercel AI SDK v6 封装)
        packages/shared (@shared 别名共享源码：IpcChannel/常量/工具)
```

## 快速开始

```bash
# 环境：Node >= 24.11.1（以 engines 为准），pnpm >= 10
pnpm install
cp .env.example .env     # 性能/日志参数，非 API Key
pnpm dev                 # 开发模式（或 Windows 下双击 start-dev.bat）
pnpm build:win:x64       # 构建 Windows x64 安装包
```

详见 [08-构建运行与测试](./08-构建运行与测试.md)。
