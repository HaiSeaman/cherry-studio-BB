# Cherry Studio → Tauri 2 架构重构方案

> **文档版本**：v1.0（2026-08-23）
> **前提**：基于对当前仓库（v1.6.0，Electron 41 + React 19 + electron-vite 5）的全量分析。
> **目标**：运行更快、内存更低。策略 = **前端 React 层最大化复用，Node 主进程整体替换为 Rust 核心，每个功能模块优先选用现成开源实现**。

---

## 一、为什么 Tauri 2 能满足"更快、更省内存"

| 维度 | 现状 (Electron 41) | Tauri 2 | 收益来源 |
|---|---|---|---|
| 基础内存 | 自带完整 Chromium，主进程+渲染基线 ~350–500MB | 复用系统 WebView2，基线预计降 **50%+** | 不打包浏览器 |
| 安装包体积 | ~120MB+（内含 Chromium + Node） | 预计 **<20MB** | 同上 |
| 冷启动 | 主进程单体 `out/main/index.js`（34 个 service 全量加载，`inlineDynamicImports: true`） | Rust 编译原生二进制 + WebView 按需加载 | 无 JS 启动解析 |
| 后台服务 | Node 单线程事件循环 | tokio 异步运行时（多线程、无 GC 抖动） | 调度器/备份/MCP 不再卡 UI |
| 小程序 webview | 每个 Electron 渲染进程 +100~400MB | 多窗口共享系统 WebView2 浏览器进程 | 多开小程序内存显著下降 |

## 二、目标架构

```
┌────────────────── WebView2 (React 19, 复用 ~70% 现有代码) ──────────────────┐
│  pages/ store/(redux) services/ aiCore/          ← 原样迁移               │
│  Dexie (IndexedDB)  ← 原样保留！聊天数据零迁移                              │
│  markdown 工具链 (remark/shiki/katex/mermaid)    ← 原样保留                │
│  @ai-sdk/* 15 个 provider                        ← 原样保留（见 §二 核心决策 2） │
│  window.api.* (Electron preload)                 ← 替换为 invoke() 封装层   │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │  invoke / event（tauri-specta 生成类型安全绑定）
┌──────────────┴─────────────── Rust 核心 (tokio) ───────────────────────────┐
│ mcp(内置 server+client) │ 文件解析 │ 备份(WebDAV/S3) │ 自动化调度 │ 划词    │
│ 窗口管理 │ 托盘/快捷键 │ 截图 │ 代理 │ FileStorage │ HTTP 通道(CORS 绕过)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**核心决策**：
1. **Dexie/IndexedDB 原样保留** —— WebView2 支持 IndexedDB，13 张表 + `upgrades.ts` 升级链零改动。旧 Electron 用户通过现有 BackupManager 导出的备份文件导入（备份格式是 zip JSON，首版可在前端 JS 解析，后续迁 Rust）。
2. **AI Provider 层留在前端 TypeScript** —— 15 个 `@ai-sdk/*` 与 `packages/aiCore` 是纯 fetch 逻辑，在 WebView 里照常工作；唯一问题是 CORS，用 `tauri-plugin-http` 提供的标准 `fetch`（Rust reqwest 后端，返回标准 Response + ReadableStream）绕过，流式 token 直接回流 JS，不逐 chunk 过 IPC。
3. **`packages/shared/IpcChannel.ts` 枚举体系升级为 tauri-specta 命令** —— 保持"类型安全 IPC"的既有设计理念。

## 三、功能模块 → 现成方案映射表

### 3.1 前端直接复用（零/极小改动）

| 模块 | 现有代码 | 方案 |
|---|---|---|
| 页面/路由/组件 | `src/renderer/src/pages/**`, Router.tsx | 原样复制，react-router-dom 6 照常 |
| 状态管理 | redux-toolkit + redux-persist（20 slice） | 原样保留 |
| 聊天消息块系统 | `store/messageBlock.ts`, Messages/ | 原样保留 |
| AI Provider 层 | `packages/aiCore` + renderer `aiCore/` | 原样保留，仅请求出口换 tauri http fetch（封装点集中在 `AiProvider.ts`） |
| 流式渲染 | ShikiStreamService, messageStreaming | 原样保留 |
| 音频播放 | `pages/music/services/audioEngine.ts` (HTMLAudioElement 单例) | 原样保留 |
| Markdown/KaTeX/Mermaid | remark/rehype 全家桶 | 原样保留（顺手砍掉 katex/mathjax 双实现之一） |

### 3.2 Node 主进程 → Rust（现成 crate）

| 功能 | 现状 (Electron) | Tauri 2 现成方案 |
|---|---|---|
| 配置存储 | electron-store + keyv-storage | **tauri-plugin-store**（官方） |
| 文件系统访问 | node fs | **tauri-plugin-fs** + **tauri-plugin-dialog**（官方） |
| HTTP（绕 CORS、流式） | Chromium 私有特权 | **tauri-plugin-http**（官方，reqwest 后端） |
| 系统通知 | Electron Notification | **tauri-plugin-notification**（官方） |
| 全局快捷键 | Electron globalShortcut | **tauri-plugin-global-shortcut**（官方） |
| 剪贴板 | Electron clipboard | **tauri-plugin-clipboard-manager**（官方） |
| 开机自启 | — | **tauri-plugin-autostart**（官方） |
| 应用自动更新 | — | **tauri-plugin-updater**（官方） |
| 托盘/多窗口/Mini 窗/挂件 | WindowService.ts (29KB) | Tauri 内建 tray + WebviewWindow 多窗口 |
| 系统代理检测 | os-proxy-config | **sysproxy** crate（clash-verge 同款） |
| WebDAV 备份 | WebDav.ts (自研) | **reqwest_dav** v0.3.3（总下载超百万，Basic/Digest 认证齐全）✅已核实 |
| S3 备份 | @aws-sdk/client-s3 | **object_store** crate（Apache Arrow 项目）或 aws-sdk-s3 |
| MCP client/server | @modelcontextprotocol/sdk + MCPService.ts (46KB) | **rmcp** v3.1.4（官方 Rust SDK，支持 stdio/streamable-http transport、sampling、elicitation）✅已核实 |
| DXT 扩展安装 | DxtService.ts | zip crate 解包 + serde 解析 manifest.json（DXT 本质是带清单的 zip） |
| 内置 MCP server（memory/dify/amap） | src/main/mcpServers/ | rmcp `--features server` 重写；memory 知识图谱可用 redb/sled 嵌入式 KV |
| 压缩解压 | node-stream-zip | **zip** crate |
| PDF 解析 | pdf-parse | **pdfium-render**（Google pdfium 绑定，质量最好）或 pdf-extract |
| xlsx/xls 解析 | officeparser 部分 | **calamine** crate（事实标准） |
| docx/pptx 解析 | officeparser | docx/pptx = zip+xml：zip + quick-xml 自写薄层（各约 200 行）；兜底可留 Node sidecar 跑 officeparser |
| ripgrep 检索 | @cherrystudio/ripgrep 二进制 | **ripgrep 官方 crate 库化**（grep-searcher/grep-regex），进程内检索免子进程 |
| 字体列表 | font-list | **font-kit** crate |
| 截图 | electron-screenshots | **screenshots** crate（跨平台）+ 复用前端选区 UI |
| 划词助手 | selection-hook 2.0 + SelectionService.ts (57KB) | Windows：`windows` crate 的 **UI Automation (UIA)** API 取选中文本 + **enigo** 模拟复制键。⚠️ 唯一无成熟现成 crate 的模块，需自研约 300–500 行（见 §五 风险表） |
| 自动化调度器 | AutomationService.ts（主进程 30s tick，任务存 automation.json） | **tokio-cron-scheduler**；任务文件格式不变 |
| HTML→Markdown | turndown | 保留 turndown 于前端（依赖 DOM，WebView 内可用） |
| 正文提取 | jsdom + @mozilla/readability | 移到前端 DOMParser + readability（jsdom 整个砍掉）；或 Rust readability crate |
| Word 导出 | ExportService | 前端 docx 库照常（纯 JS），或 Rust **docx-rs** |

### 3.3 类型安全 IPC

现状：`packages/shared/IpcChannel.ts` 数百个枚举 + ipc.ts 手写 183 个 handler（`rg -c "ipcMain\.(handle|on)" src/main/ipc.ts` 实测）。
Tauri 方案：**tauri-specta** —— Rust command 定义自动生成 TS 绑定与类型。迁移时按域拆分命令模块（mcp.rs / backup.rs / files.rs / automation.rs …），不再允许单文件 ipc.ts。

## 四、分批实施路线图

> 每批结束都可编译可运行；无依赖关系的批次可多 AI 会话并行开发。

| 批次 | 内容 | 验收 |
|---|---|---|
| **0. 脚手架** | create-tauri-app + 迁移 renderer 源码 + vite 配置对齐 + tauri-specta 接入 + CI（Windows 先行） | 空壳启动，React 页面渲染，安装包 <20MB |
| **1. 数据层** | Dexie 原样接入 + redux-persist 验证 + 旧版备份文件导入器 | 旧 Electron 备份导入后聊天记录完整可读 |
| **2. AI 链路** | tauri-plugin-http fetch 封装 + AiProvider 出口替换 + SSE 流式回归 + 15 provider 冒烟 | 对话流式输出、工具调用、搜索编排插件全通 |
| **3. 存储/文件** | FileStorage(Rust) + pdfium-render/calamine 解析 + 图片预览 | 拖拽 PDF/docx/xlsx 入对话解析成功 |
| **4. MCP** | rmcp client（stdio + streamable http）+ 内置 server 三件套重写 + DXT 安装 | 连接外部 MCP server 完成 tool call |
| **5. 备份同步** | reqwest_dav + object_store(S3)，备份格式与旧版兼容 | 新旧版本互相恢复对方备份 |
| **6. 系统集成** | 托盘/全局快捷键/通知/自启/更新器/截图/划词(UIA)/Mini 窗 | 划词助手在微信/浏览器中取词成功 |
| **7. 小程序+挂件** | 多窗口 minapps + 音乐挂件窗口 + 闲置回收策略移植 | 同时开 3 个小程序，内存对比 Electron 有量化下降 |
| **8. 收尾** | 性能基准报告（启动时间/常驻内存/包体积 vs Electron）、katex/mathjax 二选一、遗留 SDK 清理 | 三项指标均有数据对比 |

## 五、风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| 划词助手无现成 crate（UIA 自研） | 🔴 高 | 批次 6 最先做 spike；备选：selection-hook 若不耦合 Electron N-API，可保留为独立本地进程经 stdio/命名管道通信（需验证） |
| WebView2 与 Chromium 行为差异（CSS/字体/Drag&Drop 细节） | 🟡 中 | antd 5 + styled-components 已在 Teams 等 WebView2 大型应用验证；批次 1 做全页面走查 |
| SSE 流在 plugin-http 下断线/暂停行为与浏览器 fetch 有差异 | 🟡 中 | 批次 2 用 >10k tokens 长回复做断流/暂停/恢复回归 |
| IndexedDB 数据被 WebView 清理策略误删 | 🟡 低 | 与 Electron 同等风险；可选加固：关键数据定期快照到 Rust 侧 rusqlite 作二级保险 |
| officeparser 边角格式兼容 | 🟢 低 | 兜底：officeparser 放入小型 Node sidecar，仅 Rust 解析失败时调用 |
| macOS/Linux 适配 | 🟢 低 | 所推 crate 均跨平台；CI 后置 |

## 六、预期收益汇总

- **安装包**：~120MB → **<20MB**
- **冷启动**：去掉 183 个同步 IPC 注册和单体 main bundle 解析，预计启动时间减半以上
- **常驻内存**：基线（不开小程序）预计从 ~500MB 降至 **150–250MB**；小程序多开因共享 WebView2 进程收益更大
- **代码复用率**：renderer 层 ~70% 原样迁移；Node 主进程中约 60% 有现成 crate 对应，真正自研的只有划词助手（UIA）与 docx/pptx 薄解析层
