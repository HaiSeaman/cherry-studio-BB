<div align="center">

# Cherry-Studio-BB

**基于 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 的增强型 Fork —— 专注 AI 绘画工作台与中文用户体验**

</div>

> ## ⚠️ Fork 声明
>
> **Cherry-Studio-BB 是 [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio) 的衍生分支（Fork）。**
>
> 本项目基于上游 Cherry Studio 二次开发，**保留了原作者的完整贡献**：
> - 上游所有代码、架构与设计均归 [CherryHQ](https://github.com/CherryHQ) 及其贡献者所有
> - 本项目在尊重原作者劳动成果的前提下，针对中文用户与 AI 绘画场景做了增强与定制
> - 上游仓库：<https://github.com/CherryHQ/cherry-studio>
> - 许可证与上游一致：**AGPL-3.0**（见 [LICENSE](./LICENSE)）
>
> 如上游代码有更新，建议同步合并；本分支的定制功能见下方「与上游的差异」。

---

## 📖 项目简介

Cherry-Studio-BB 是一个桌面端 AI 助手，基于 Electron + React 构建，支持接入任意 OpenAI 兼容 API 与 Gemini 官方 API，提供：

- 💬 **AI 聊天**：多模型对话、流式输出、MCP 工具、划词助手
- 🎨 **AI 绘画工作台（本项目特色）**：独立的图片生成 TAB 页，支持文生图、图生图、Gemini 官方参数、历史会话管理
- 🔌 **多服务商接入**：OpenAI 兼容接口、Google Gemini、Ollama 本地模型等
- 🧩 **扩展生态**：小程序、MCP 服务器、WebDAV/S3 云备份

> 本项目为**单语言中文分支**：界面与文案全部为简体中文，未引入多语言方案。

---

## ✨ 功能特性

### 🎨 AI 绘画工作台（新增特色功能）

| 能力 | 说明 |
|------|------|
| 独立 TAB 页 | 左侧工具栏固定入口，与聊天/小程序同级，一键切换 |
| 文生图 / 图生图 | 支持上传参考图片（最多 4 张）自动走 `images/edits` 端点 |
| Gemini 官方参数 | 选择 Google 官方 Gemini 模型时，提供官方宽高比（15 种）+ 分辨率（512/1K/2K/4K）+ 人物生成模式 |
| 丰富尺寸预设 | 非 Gemini 模型提供 13 个分组像素尺寸（正方形/横版/竖版）+ 自定义输入 |
| 重新生成 | 一键复用上次提示词与参数再生成 |
| 停止生成 | 生成过程中可随时中止（AbortController） |
| 提示词气泡操作 | 可选中复制、一键复制、内联编辑后重新生成 |
| 一键优化提示词 | 复用翻译模型扩写提示词 |
| 自动保存 | 生成图片自动保存到自定义路径（默认 用户图片/CherryStudio） |
| 历史会话 | 会话持久化、缩略图列表、重命名/删除 |

### 💬 AI 聊天（继承上游能力）
- 多模型流式对话、Markdown 渲染、代码高亮
- MCP 工具调用、Web 搜索、划词助手、快捷助手
- 话题管理、消息编辑/重发/复制

### 🔌 模型接入
- OpenAI 兼容接口（含中转/硅基流动等自定义服务商）
- Google Gemini 官方 API（含图片生成）
- Ollama 本地模型
- 仅显示**已启用**的服务商与用户添加的模型

---

## 🔧 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron + electron-vite |
| 前端 | React 18 + TypeScript + Redux Toolkit + styled-components |
| UI 组件 | Ant Design 5 |
| AI SDK | Vercel AI SDK（自研 aiCore 运行时封装） |
| 数据库 | Dexie (IndexedDB) |
| 构建打包 | electron-builder（NSIS / Portable） |
| 测试 | Vitest（3600+ 用例） |

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 20
- pnpm ≥ 9

### 安装与开发

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm typecheck

# 运行开发模式
pnpm dev

# 运行测试
pnpm test

# Lint
pnpm lint
```

### 构建打包（Windows x64）

```bash
pnpm build && npx electron-builder --win --x64
```

产物输出至 `dist/`：
- `Cherry-Studio-BB-<version>-x64-setup.exe`（安装版）
- `Cherry-Studio-BB-<version>-x64-portable.exe`（绿色版）

---

## 📖 使用说明

### 配置模型服务商
1. 打开「设置 → 模型服务」
2. 添加 API 服务商（OpenAI 兼容地址 + API Key），或启用内置服务商
3. 添加/勾选所需模型，**打开服务商启用开关**（未启用的服务商不会出现在任何模型列表中）

### 使用 AI 绘画
1. 点击左侧工具栏「图片生成」图标
2. 选择模型（仅显示已启用服务商中的视觉/绘画模型）
3. 输入提示词，选择尺寸/分辨率
4. 点击「生成图片」，生成中可点「停止生成」
5. 生成结果自动保存，历史会话可在左侧查看

### 数据与备份
- 设置 → 数据设置：可自定义图片保存路径、数据备份/恢复（兼容上游备份格式）

---

## 🧩 与上游 Cherry Studio 的差异

本项目在保留上游全部核心能力的基础上做了以下定制：

1. **新增 AI 绘画工作台 TAB 页**（上游仅有聊天内生成图片工具）
2. **Gemini 官方图像参数支持**（宽高比/分辨率/人物模式，模型感知传参）
3. **绘画体验增强**：重新生成、停止生成、提示词编辑重生成、尺寸预设扩展、自动保存
4. **单语言中文化**：移除多语言框架，界面硬编码简体中文
5. **精简清理**：移除与中文用户无关的功能与历史遗留代码
6. **产品名**：Cherry-Studio-BB（`productName`/`appId` 独立，不与上游安装冲突）

---

## 📁 项目结构（简）

```
├── src/
│   ├── main/            # Electron 主进程（窗口/文件/服务/IPC）
│   ├── preload/         # 预加载脚本（window.api 桥接）
│   └── renderer/        # 渲染进程（React 应用）
│       ├── pages/
│       │   ├── home/        # AI 聊天页
│       │   ├── paint/       # ★ AI 绘画工作台（本项目特色）
│       │   └── settings/    # 设置页
│       ├── aiCore/      # AI 调用封装（Provider 配置/参数构造）
│       ├── services/    # 业务服务（消息流/数据库/备份）
│       └── store/       # Redux 状态管理
├── packages/
│   ├── aiCore/          # 自研 AI 运行时（RuntimeExecutor/插件体系）
│   └── ai-sdk-provider/ # AI SDK Provider 适配
├── resources/           # 运行时资源（隐私页/二进制）
└── electron-builder.yml # 打包配置
```

---

## 🤝 致谢

- **[CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)** 及所有上游贡献者——本项目的一切基础均源自你们的卓越工作
- **Vercel AI SDK** 团队——提供强大的模型抽象层
- **Ant Design / Electron / Dexie** 等开源社区

---

## 📄 许可证

[AGPL-3.0](./LICENSE)（与上游 Cherry Studio 一致）

> 依据 AGPL-3.0 要求：基于本项目的任何衍生作品如对外提供服务，需开源其完整源代码。
