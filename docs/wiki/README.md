# Cherry Studio BB · Code Wiki

> 本 Wiki 基于 2026-08 对仓库源码的静态分析生成，基线版本 **v1.6.1**（fork：`CherryHQ/cherry-studio` 的中文增强分支 `Cherry-Studio-BB`）。
> 2026-09 起随版本增量维护（闹钟 / 语音输入 / FM 电台 / 打包链路 / 知识库检索链路等），当前对应 **v1.11.1**。

## v1.10.3 文档变更

| 文档 | 变更 |
|---|---|
| [01-项目概览](./01-项目概览.md) | 全局语音输入：快捷键写死 `Ctrl + \``、新增总开关；内嵌小程序：移除地区过滤 |
| [03-主进程模块](./03-主进程模块.md) | §2.6 语音输入：`KEYCODE_MAP` 的静默丢键坑、`CommandOrControl` 兜底、开关即 `voice_input.enabled` |
| [04-渲染进程模块](./04-渲染进程模块.md) | `pages/minapps/` 不再按地区过滤 + 「交换」二次确认；新增语音输入总开关条目 |
| [06-数据存储与状态管理](./06-数据存储与状态管理.md) | §1 新增「快捷键 / 小程序状态」：`mergeDefaultShortcuts` 升级特例、`selectVoiceInputEnabled`、已删除的死字段清单 |

## v1.11.0 文档变更（「电视」IPTV Tab 下线）

| 文档 | 变更 |
|---|---|
| [01-项目概览](./01-项目概览.md) | 移除「网络电视」产品定位与功能表条目；`/iptv` 并入已下线路由；Dexie schema 更正为 v17、persist 迁移模型更正为 v5 |
| [04-渲染进程模块](./04-渲染进程模块.md) | 移除 `/iptv` 路由行与 `pages/iptv/` 目录条目 |
| [06-数据存储与状态管理](./06-数据存储与状态管理.md) | persist `version` 4→5；移除 `iptvSettings` slice 条目与「IPTV 数据写入约定」；Dexie 版本 15→17，五张 `iptv_*` 表列入已废弃 |
| [07-依赖关系](./07-依赖关系.md) | 移除 `mpegts.js` / `iptv-playlist-parser`（`hls.js` 保留，仅服务 FM 电台） |
| [08-构建运行与测试](./08-构建运行与测试.md) | 移除「IPTV 模块测试约定」段落（测试目录 `pages/iptv/__tests__/` 已随模块删除） |

## v1.11.1 文档变更（知识库：检索链路收口 + 引用溯源 + 重建索引）

| 文档 | 变更 |
|---|---|
| [04-渲染进程模块](./04-渲染进程模块.md) | 路由表补 `/knowledge`；pages 目录新增 `pages/knowledge/` 条目（模块结构与多库融合说明） |
| [05-AI核心体系](./05-AI核心体系.md) | §4 消息链路补「知识库引用」环节（`transformMessagesAndFetch` → `attachKnowledgeContext`）与**三条硬约束**（只注入 system / 只在本次请求生效 / 图像模型跳过）、召回常量清单 |
| [06-数据存储与状态管理](./06-数据存储与状态管理.md) | `kb_bases` 字段明细与新增 `min_relevance`；`kb_search_index` **声明未落盘**的现状说明；`CitationMessageBlock.knowledge` 字段 |
| [08-构建运行与测试](./08-构建运行与测试.md) | 新增「知识库模块测试约定」（9 个测试文件覆盖范围 + 改切块须重建索引） |

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
│  └─ mcpServers 内置MCP           ├─ Dexie (IndexedDB v17)    │
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
