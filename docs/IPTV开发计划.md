# IPTV 开发计划（网络电视台 Tab）

> 版本：V1.1（第一版实施方案，2026-09-05 经全库源码逐项验证修订）
> 适用代码库：CherryStudio 1.8.4（BB 魔改版），当前分支 `main`
> 编写日期：2026-08-25　修订日期：2026-09-05
> 最终目标：在 BB 右侧导航栏新增一个「电视」图标，点击进入 IPTV 播放器页面，实现「输入 M3U → 自动整理频道 → 搜索/收藏 → 点击就看」的轻量电视 Tab。
>
> **V1.1 修订摘要**（全部依据源码逐行验证，非推测）：
> 1. 侧边栏接线从 5 个文件改为 **6 个**——`SidebarIconsManager.tsx` 的 `iconMap` 带
>    `satisfies Record<SidebarIcon, ReactNode>` 约束，加 `'iptv'` 类型后**必然编译报错**，必须补图标映射
> 2. `iptv-playlist-parser` 无 `Parser` 导出，正确用法是 `import { parse }`（npm README 已核实）
> 3. **收藏/历史表改为 url 主键快照表**——原 channelId 外键方案在「更新播放列表」时全部悬空失效
> 4. 测试计划重构——vitest renderer 是 jsdom 环境**没有 indexedDB**，凡碰 Dexie 的单测都跑不起来
> 5. `DynamicVirtualList` 的 props 是 `list/children/estimateSize`，没有 `count`
> 6. 删除 `iptv_channels.order` 冗余字段；依赖装 devDependencies（项目惯例）；补充 HEVC 平台限制

---

## 目录

1. [项目背景与目标](#1-项目背景与目标)
2. [现状调研结论（家底盘点）](#2-现状调研结论家底盘点)
3. [关键决策记录](#3-关键决策记录)
4. [架构总览](#4-架构总览)
5. [数据层设计（Dexie 数据库）](#5-数据层设计dexie-数据库)
6. [状态层设计（Redux slice）](#6-状态层设计redux-slice)
7. [组件层设计（页面结构）](#7-组件层设计页面结构)
8. [播放引擎设计（hls.js + mpegts.js + video）](#8-播放引擎设计hlsjs--mpegtsjs--video)
9. [依赖清单](#9-依赖清单)
10. [分步实施计划](#10-分步实施计划)
11. [测试计划](#11-测试计划)
12. [已知限制与后续迭代（V1.5+）](#12-已知限制与后续迭代v15)
13. [风险清单与规避](#13-风险清单与规避)

---

## 1. 项目背景与目标

### 1.1 背景

BB 是一个 Electron 桌面应用（React 19 + TypeScript + Redux Toolkit + antd 5），当前是 Cherry Studio 的魔改版。用户希望新增一个 **IPTV 网络电视 Tab**，核心定位是：

> 「输入 M3U → 自动整理频道 → 搜索/收藏 → 点击就看」的轻量电视页，
> 而不是把 IPTVnator 的全部功能照搬过来。

### 1.2 V1 功能范围（已与用户确认，一个都不删）

| 编号 | 功能 | 说明 |
|---|---|---|
| 1 | 添加 M3U 播放列表 | 支持远程 URL（`https://...m3u`）、本地文件（`.m3u / .m3u8`） |
| 2 | 多播放列表 | 用户可添加多个列表源，独立管理 |
| 3 | 自动分类 | 按 `group-title` 属性自动生成「全部 / 央视 / 卫视 / 体育 / 电影 / 新闻 / 地方 / 4K」等分组 |
| 4 | 频道搜索 | 实时搜索（输入即过滤），频道名模糊匹配 |
| 5 | Logo 显示 | 显示 `tvg-logo`；加载失败则显示频道首字母兜底，不出现空白 |
| 6 | 收藏 | 本地保存，星标频道，生成「收藏」分组 |
| 7 | 最近观看 | 本地保存最近播放记录（上限 50 条） |
| 8 | 视频播放 | HLS（.m3u8）/ MP4 / 裸 TS 直链 播放 |
| 9 | 全屏 | 播放器全屏按钮 |
| 10 | 音量 | 音量滑杆 + 静音 |
| 11 | 自动重连 | 播放失败按 1s → 3s → 5s 退避重试，达到次数后才报错 |
| 12 | 本地保存配置 | 播放列表、收藏、设置全部存本地数据库 |

### 1.3 明确不做（V1 范围外，防止膨胀）

- ❌ EPG 电子节目单（XMLTV）—— 留给 V1.5
- ❌ 当前节目展示 —— 留给 V1.5
- ❌ M3U 自动定时更新 —— 留给 V1.5
- ❌ Catch-up 回看 / Xtream Codes / Stalker Portal / 多画面 / VOD —— 留给 V2（若届时需要）
- ❌ M3U 中 `catchup`、`timeshift`、`http.user-agent`、`http.referrer` 字段的启用 —— V1 不解析、不入库（不建列，见 §2.4/§5.2；真正启用时走 Dexie 版本升级加列）

### 1.4 V2 重构约束状态（重要变更记录）

代码库中 `src/renderer/src/databases/index.ts` 与 `src/renderer/src/store/index.ts` 头部带有
「V2 DATA&UI REFACTORING (by 0xfullex)，Feature PRs BLOCKED，此文件冻结」的警告注释。

**用户已明确指示（2026-08-25）**：
> 忽视并删除 V2 开发计划里的所有东西，用户不会升级 V2 版本，
> 只在原有版本（1.8.4）上做新功能增加、调整和修复。

因此：**上述冻结警告对本开发计划不构成约束**。本计划将直接向现有数据库与 store 追加内容。
注意：追加时不修改、不删除任何已有表与已有 reducer，只做纯增量，保证老数据零影响。

---

## 2. 现状调研结论（家底盘点）

### 2.1 项目结构（关键路径）

```
D:\AI\Github\Cherry\cherry-studio-BB\
├── src\
│   ├── main\                  # Electron 主进程（ipc.ts 注册全部 IPC）
│   │   └── services\          # MusicService / FileSystemService / ProxyManager ...
│   ├── preload\index.ts       # contextBridge 暴露 window.api.*（含 file 全套）
│   └── renderer\src\          # React 渲染进程（本计划主要改动区）
│       ├── Router.tsx         # 路由表（HashRouter）
│       ├── components\app\Sidebar.tsx   # 侧边栏：iconMap + pathMap（加图标的入口）
│       ├── config\sidebar.ts  # DEFAULT_SIDEBAR_ICONS（默认显示哪些图标）
│       ├── i18n\label.ts      # sidebarIconKeyMap（图标悬停中文名）
│       ├── databases\index.ts # Dexie 数据库（当前最高 version 14）
│       ├── store\index.ts     # Redux store（combineReducers 注册处）
│       ├── types\index.ts     # SidebarIcon 联合类型定义（第 477 行）
│       └── pages\             # 页面目录：music/ habits/ notes/ knowledge/ ...
│           └── music\         # ★ 最完整的同类先例（本地播放器，照抄它的模式）
```

### 2.2 可直接复用的现成能力（零成本）

| 能力 | 位置 | 用途 |
|---|---|---|
| 虚拟滚动 | `src/renderer/src/components/VirtualList/dynamic.tsx`（`DynamicVirtualList`，含测试） | 频道列表几千条不卡顿，**不自己写** |
| 本地文件选择/读取 | `window.api.file.select(options)` + `window.api.file.readExternal(path, detectEncoding)` | 选本地 .m3u 并读取内容 |
| 远程下载 | `window.api.file.download(url)`；且渲染进程直接 `fetch` 亦可 | 拉取远程 M3U 文本 |
| CORS 放行 | 主窗口 `webSecurity: false`（`src/main/services/WindowService.ts` 多处） | 任意域的 M3U/EPG/视频流不会被浏览器 CORS 拦截 |
| 编码检测 | `chardet@2.1.0`（已装依赖） | 判断 M3U 文本是 UTF-8 还是 GBK，防中文乱码 |
| Redux persist | `store/index.ts` 已配置 redux-persist | 播放设置（音量/开关）持久化，照 `musicSettingsSlice` 模式 |
| Dexie 数据库 | `databases/index.ts`，最高 version 14 | 新增表为 version 15（纯追加） |
| 图标库 | `lucide-react`（已装） | 侧边栏电视图标、页面内图标 |
| UI 组件 | antd 5（Slider / Modal / Input / Tooltip 等） | 设置弹窗、音量滑杆等 |
| 播放器先例 | `pages/music/`（audioEngine + playerStore 单例 + 组件分层） | IPTV 播放器照抄其架构模式 |
| XML 解析 | `fast-xml-parser@5.4.1`（已装） | V1.5 EPG（XMLTV）解析，无需新包 |
| 本地数据库先例 | `pages/habits/`（打卡）、`pages/notes/`（笔记） | 新页面目录结构的样板 |

### 2.3 必须新增的东西（只有这些）

| 新增项 | 原因 |
|---|---|
| `hls.js` 依赖 | Chromium 原生 `<video>` **不能播放 .m3u8**（HLS），必须用 hls.js |
| `mpegts.js` 依赖 | Chromium 原生 video **不支持裸 MPEG-TS 直链**（.ts 单流），需 mpegts.js |
| `iptv-playlist-parser@0.15.2` 依赖 | 成熟 M3U 解析器（用户指定要求），已确认 npm 真实存在且**自带 TS 类型**（⚠️ named export 是 `parse`，**没有 `Parser` 导出**，见 §2.4） |
| 新页面目录 `src/renderer/src/pages/iptv/` | IPTV 全部业务代码 |
| 数据库追加 `db.version(15)` | 4 张新表 |
| store 追加 `iptvSettings` slice | 播放设置持久化 |

### 2.4 解析库真实输出结构（代码依据，防踩坑）

`iptv-playlist-parser` 解析结果（`parse(text)` 返回值）：

```ts
{
  header: { attrs: { 'x-tvg-url'?: string }, raw: string },
  items: [                       // ★ 注意：是 items，不是 channels！
    {
      name: 'CNN (US)',          // 频道名（含括号后缀，保留原样）
      tvg: { id, name, url, logo, rec, shift },   // tvg-* 属性
      group: { title: 'News' },  // group-title
      http: { referrer?, 'user-agent'? },  // #EXTVLCOPT（V1 不启用）
      url: 'http://...stream.m3u8',        // 播放地址（V1 关键字段）
      raw: string, line: number,
      timeshift?, catchup? { type, source, days },  // V1 只透传不启用
      lang?
    }
  ]
}
```

**V1 只取 5 个字段入库**：`items[].name`、`items[].url`、`items[].tvg?.logo`、`items[].group?.title`、`items[].tvg?.id`。
其余字段（catchup/timeshift/http/header）**不建列**（YAGNI，与 §5.2 一致）——V2 真需要时走一次 Dexie 版本升级加列，代价极小。

解析调用方式（已对照 npm README 核实，V1.1 修正）：

```ts
import { parse } from 'iptv-playlist-parser'   // ★ named export 是 parse；不存在 Parser 命名导出
const result = parse(text)                      // result.items 即频道数组
```

> ⚠️ **实测陷阱（2026-09-05 安装后冒烟验证）**：缺失的属性返回**空字符串 `""`** 而非 undefined/null
> （如无 tvg-logo 时 `items[].tvg.logo === ''`，无 tvg-id 时 `items[].tvg.id === ''`）。
> `parseM3U`（Step 4）入库前必须归一化 `'' → null`，否则「logo 为空显示首字母」（`logo === null`）
> 与「未分组」（`group === null`）的判断全部失效。

---

## 3. 关键决策记录

| 决策项 | 结论 | 理由 |
|---|---|---|
| 播放器技术 | **hls.js + mpegts.js + 原生 video 三合一**（已由用户选定为基础，补充 mpegts.js） | .m3u8 用 hls.js；裸 .ts 直链用 mpegts.js；MP4/WebM 用原生 video。覆盖面最全 |
| V1 范围 | 按用户清单 12 项全做 | 已确认，无虚胖 |
| Tab 入口 | **侧边栏独立图标**（与打卡/知识库平级），路由 `/iptv` | 用户选定；后续再做桌面小窗口时复用播放引擎模块 |
| 数据存储 | 本地 Dexie + redux-persist | 纯本地，无服务器 |
| M3U 解析 | 用成熟库 `iptv-playlist-parser` | 用户明确要求，已确认带 TS 类型 |
| V2 冻结约束 | **作废**（用户指令） | 用户不会升级 V2，仅在当前版本迭代 |
| EPG | V1 不做，V1.5 再做 | 用户指定分层 |
| 搜索实现 | 内存过滤（200ms 防抖），不用 minisearch | 第一版频道量级内足够；若上万频道再评估 |

### 3.1 播放器策略（按 URL 后缀路由）

```
点击频道，取频道 url：
├─ 匹配 /\.m3u8($|\?)/i                 → hls.js 播放（按后缀精确判定，不做模糊"含 m3u8"匹配）
├─ 匹配 /\.(ts|mpegts|flv)($|\?)/i     → mpegts.js 播放（MSE 注入裸 TS 流）
└─ 其他（mp4/webm/mov/未知）           → 原生 <video src> 直接播放
```

> 引擎路由以 §8.1 的 `selectEngine` 正则为准（V1.1 统一：本节与 §8.1 原表述不一致，已对齐）。

直播特性：**无进度条**（直播不能拖拽），显示「LIVE」徽标；提供播放/暂停、音量、静音、全屏。

---

## 4. 架构总览

### 4.1 页面布局（对应需求草图）

```
┌────────────────────────────────────────────────┐
│ 侧边栏: 电视图标（新增）                        │
├──────────┬─────────────────────────────────────┤
│ 分组列表  │          视频播放器区域              │
│ - 全部    │   (hls.js / mpegts.js / video)      │
│ - 收藏    │                                     │
│ - 最近观看│   当前频道名 + Logo + ★收藏按钮       │
│ - 央视    │   正在播放提示（V1.5：当前节目）      │
│ - 卫视    │   控制条：播放/暂停 音量 全屏 LIVE    │
│ - 体育    │                                     │
│ ...       │  🔍 搜索频道              ⚙ 设置     │
├──────────┴─────────────────────────────────────┤
│ （频道列表动态渲染：虚拟滚动）                    │
└────────────────────────────────────────────────┘
```

- 左侧：分组树（可折叠），上方固定「全部 / 收藏 / 最近观看」，下方为解析出的分组
- 中间：频道列表（虚拟滚动 + Logo + 名称 + 收藏星）
- 右侧：播放器 + 当前频道信息
- 顶部工具条：搜索框（左）+ 设置按钮（右）

### 4.2 目录结构（新增文件全部在此）

```
src/renderer/src/pages/iptv/
├── IptvPage.tsx              # 页面根组件（挂载整体布局）
├── types.ts                  # IPTV 领域类型（Playlist/Channel/...；表定义直接追加在 databases/index.ts，无需 db.ts）
├── store/iptvSettingsSlice.ts # 播放设置 slice（音量/自动播放/自动重连开关）
├── services/
│   ├── m3uService.ts         # 拉取/读取 M3U 文本 → 解析 → 入库
│   ├── playlistService.ts    # 播放列表 CRUD（增删改查 + 更新）
│   ├── channelService.ts     # 按分组/搜索/收藏/最近观看查询频道
│   └── retryLogic.ts         # 指数退避重连状态机（纯函数，可单测）
├── hooks/
│   ├── useIptvPlayer.ts      # 播放器 hook（封装 hls/mpegts/video 三引擎）
│   └── useChannelList.ts     # 分组 + 搜索过滤后的频道列表计算
├── components/
│   ├── GroupSidebar.tsx      # 左侧分组树
│   ├── ChannelList.tsx       # 中间频道列表（DynamicVirtualList）
│   ├── ChannelItem.tsx       # 单条频道（Logo + 名称 + 收藏星）
│   ├── PlayerArea.tsx        # 右侧播放器容器
│   ├── PlayerControls.tsx    # 控制条（播放/暂停 音量 全屏 LIVE）
│   ├── Logo.tsx              # Logo（失败 → 首字母兜底）
│   └── SettingsModal.tsx     # 播放列表管理 + 播放设置
└── __tests__/
    ├── m3uService.test.ts    # 解析→入库逻辑
    ├── retryLogic.test.ts    # 重连状态机
    └── channelService.test.ts # 分组/搜索/收藏过滤
```

---

## 5. 数据层设计（Dexie 数据库）

### 5.1 追加位置

`src/renderer/src/databases/index.ts` 末尾（**只追加，不改任何已有 version**）：

```ts
// --- NEW VERSION 15：IPTV Tab 四张表（播放列表/频道缓存/收藏/最近观看），无 .upgrade() ---
// 写法与 version 14（知识库）先例一致：只声明新表，未声明的旧表自动继承，无需全量重声明
db.version(15).stores({
  iptv_playlists: '++id, &url',        // &url 唯一索引：防重复添加同一源（add 时 catch 约束错误提示"已存在"）
  iptv_channels: '++id, playlistId',   // 搜索/分组走内存过滤，name/group/tvgId 无需索引
  iptv_favorites: 'url, addedAt',      // ★ url 为主键的频道快照表（设计说明见下）
  iptv_history: 'url, playedAt'        // ★ url 为主键的频道快照表（同一频道重复观看 = put 更新 playedAt，天然去重）
})
```

同时在文件顶部的 `db` 类型声明中追加表类型（紧跟 `kb_search_index` 一行后，import 自 `'../pages/iptv/types'`，与现有 habits/knowledge 类型引入模式一致）：

```ts
iptv_playlists: EntityTable<IptvPlaylist, 'id'>
iptv_channels: EntityTable<IptvChannel, 'id'>
iptv_favorites: EntityTable<IptvFavorite, 'url'>
iptv_history: EntityTable<IptvHistory, 'url'>
```

> ⚠️ **设计变更（V1.1 修订）：收藏/历史不再用 channelId 外键，改为以 url 为主键的频道快照表。**
> 原方案 `iptv_favorites: '++id, &channelId'` 引用频道表自增 id，但「更新播放列表」= 清空该列表
> 旧频道再重新入库 → 全部 channelId 变化 → 收藏与最近观看**全部悬空失效**（原计划逻辑缺陷）。
> 快照表（存 name/url/logo/group/tvgId）的优势：
> - 与播放列表生命周期解耦：更新、删除列表都不影响收藏与观看记录
> - url 主键天然唯一：收藏切换 = `put` / `delete`，判断是否已收藏 = `get(url)`
> - 删除播放列表**不再需要**级联清理收藏/历史（Step 10 随之简化），快照仍可显示、可播放

### 5.2 表结构（字段说明）

#### iptv_playlists（播放列表源）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | number (自动) | 主键 |
| name | string | 用户可改的显示名；默认取 URL 文件名或本地文件名 |
| url | string | 远程 URL；本地文件则存本地实际路径 |
| type | 'remote' \| 'local' | 来源类型（决定更新时重新 fetch 还是重新读文件） |
| updatedAt | number | 最近更新时间戳（V1.5 自动更新依赖它） |

#### iptv_channels（频道缓存）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | number (自动) | 主键（自增 = 插入顺序 = M3U 原始顺序，`orderBy(':id')` 即恢复原序，无需 order 字段） |
| playlistId | number | 所属播放列表（多播放列表的数据根基） |
| name | string | 频道名（原始名，如 `CCTV5 HD`） |
| url | string | 播放地址（必填） |
| logo | string \| null | tvg-logo 地址；null 时显示首字母 |
| group | string \| null | group-title；null 归入「未分组」 |
| tvgId | string \| null | tvg-id（V1 保留，V1.5 EPG 匹配用它） |

> ⚠️ 表内**不存** catchup/timeshift/http/order 等字段——经复查确认，它们属于 V1 绝不启用的功能
> 或冗余数据（order 冗余：主键自增顺序即插入顺序）。
> 若强行建列会带来"永远为空但有结构"的死代码（违反 YAGNI）。
> 真正需要时（V2）再走一次 Dexie 版本升级加列，代价极小。

#### iptv_favorites（收藏 —— 频道快照表）

| 字段 | 类型 | 说明 |
|---|---|---|
| url | string (**主键**) | 频道播放地址；主键天然唯一，防重复收藏 |
| name | string | 频道名快照（列表删除后收藏仍可显示、可播放） |
| logo | string \| null | Logo 快照 |
| group | string \| null | 分组快照 |
| tvgId | string \| null | tvg-id 快照 |
| addedAt | number | 收藏时间 |

#### iptv_history（最近观看 —— 频道快照表）

| 字段 | 类型 | 说明 |
|---|---|---|
| url | string (**主键**) | 频道播放地址；重复观看 = `put` 更新 playedAt（天然按频道去重） |
| name | string | 频道名快照 |
| logo | string \| null | Logo 快照 |
| playedAt | number | 最近播放时间（`orderBy('playedAt')` 倒序取前 50 条；超过 50 删除最旧） |

---

## 6. 状态层设计（Redux slice）

### 6.1 iptvSettingsSlice（照抄 musicSettingsSlice 模式）

新建 `src/renderer/src/pages/iptv/store/iptvSettingsSlice.ts`（仿 `pages/music/store/musicSettingsSlice.ts`），
在 `src/renderer/src/store/index.ts` 中追加 import + 注册到 `combineReducers`（纯增量，不动其他 reducer）。

```ts
export type IptvSettingsState = {
  volume: number          // 默认音量 0-100，默认 80
  lastVolumeBeforeMute: number
  autoPlay: boolean       // 点击频道后自动开始播放，默认 true
  autoReconnect: boolean  // 失败自动重连开关，默认 true
}
```

> redux-persist 会自动持久化此 slice（现有配置不 blacklist 它）。
> 注意：`storeSyncService.syncList` 只同步 `assistants/settings/llm/selectionStore`，
> iptvSettings 不在同步列表 → 符合"纯本地"要求，不会上传。

### 6.2 播放器运行时状态（不用 Redux，用模块级单例）

播放器高频状态（当前频道、isPlaying、重连计数、错误提示）**不放进 Redux**，
仿 `pages/music/services/playerStore.ts` 模式：

- 模块级单例对象 + `useSyncExternalStore` 订阅（音乐模块已验证此模式，切页不丢、不回流）
- 好处：播放器引擎与 React 生命周期解耦；将来移植到桌面小窗口时，直接复用这个 store

---

## 7. 组件层设计（页面结构）

| 组件 | 职责 | 关键点 |
|---|---|---|
| `IptvPage.tsx` | 页面根：加载播放列表 + 布局三栏 | 首次进入自动加载全部 playlists 的频道 |
| `GroupSidebar.tsx` | 左侧分组树 | 固定组：全部/收藏/最近观看；动态组：按 group 聚合（保留 M3U 原始分组顺序）；未分组兜底 |
| `ChannelList.tsx` | 频道列表 | 用 `DynamicVirtualList`（props：`list` 数据数组 + `children: (item, index) => ReactNode` + `estimateSize`，可选 `isSticky`；**没有 `count` prop**）；数据 = 当前分组 + 搜索关键词过滤 |
| `ChannelItem.tsx` | 单条频道 | `Logo` 组件 + 名称 + 收藏星（★/☆ 切换）；点击 → 播放 |
| `PlayerArea.tsx` | 播放器容器 | 挂载 `useIptvPlayer`；显示当前频道名/Logo/状态 |
| `PlayerControls.tsx` | 控制条 | 播放/暂停、音量（antd Slider）、静音、全屏、LIVE 徽标；**无进度条** |
| `Logo.tsx` | Logo 图标 | `<img onError>` → 隐藏 img 显示频道名首字母（彩色圆底） |
| `SettingsModal.tsx` | 设置弹窗 | 播放列表管理：添加 URL / 添加本地文件 / 更新 / 删除；播放设置：自动播放/自动重连/默认音量 |

### 7.1 侧边栏接线（共 6 个文件小改，纯增量）

| # | 文件 | 改动 | 旧内容 → 新内容 |
|---|---|---|---|
| 1 | `src/renderer/src/types/index.ts` 第 477 行 | SidebarIcon 联合类型加 `'iptv'` | `'assistants' \| 'minapp' \| 'notes' \| 'habits' \| 'knowledge'` → 追加 `\| 'iptv'` |
| 2 | `src/renderer/src/config/sidebar.ts` | 默认显示图标数组加 `'iptv'` | `['assistants', 'minapp', 'notes', 'habits', 'knowledge']` → 追加 `, 'iptv'` |
| 3 | `src/renderer/src/components/app/Sidebar.tsx` | `iconMap` 加电视图标；`pathMap` 加 `'/iptv'` | `import { Tv } from 'lucide-react'`；`iptv: <Tv size={18} className="icon" />`；`iptv: '/iptv'` |
| 4 | `src/renderer/src/Router.tsx` | **两处**：懒加载声明 + 路由行（与其他非首屏页面一致） | `const IptvPage = lazy(() => import('./pages/iptv/IptvPage'))`；`<Route path="/iptv" element={<IptvPage />} />` |
| 5 | `src/renderer/src/i18n/label.ts` | `sidebarIconKeyMap` 加中文名 | `iptv: '电视'` |
| 6 | `src/renderer/src/pages/settings/DisplaySettings/SidebarIconsManager.tsx` | 设置页图标管理的 `iconMap` 加一行 | `iptv: <Tv size={16} />`（需 import Tv） |

> ⚠️ **V1.1 修订：第 6 个文件（SidebarIconsManager）必须改，原计划"无需额外改动"的判断是错的。**
> 该文件 L102-112 的 `iconMap` 以 `satisfies Record<SidebarIcon, ReactNode>` 约束——
> `SidebarIcon` 联合类型加了 `'iptv'` 后，缺 `iptv` 键会**直接 TS 编译报错**，无法绕过。
> 其拖拽/显隐逻辑确实是类型驱动的（补上 iconMap 条目即自动生效），但图标映射这一行必须补。

---

## 8. 播放引擎设计（hls.js + mpegts.js + video）

### 8.1 引擎封装（services/useIptvPlayer.ts 或 playerStore）

一个统一的 `play(channel)` 入口，内部按 URL 后缀路由：

```ts
function selectEngine(url: string): 'hls' | 'mpegts' | 'native' {
  if (/\.m3u8($|\?)/i.test(url)) return 'hls'
  if (/\.(ts|mpegts|flv)($|\?)/i.test(url)) return 'mpegts'
  return 'native'
}
```

- **hls.js**：`new Hls({ enableWorker: true }); hls.loadSource(url); hls.attachMedia(video)`
- **mpegts.js**：`mpegts.createPlayer({ type: 'mpegts', isLive: true, url }, { enableWorker: true })`；`.ts` 用 type `'mpegts'`，`.flv` 用 `'flv'`
- **native**：`video.src = url; video.play()`

三个引擎统一暴露 4 个生命周期事件：`playing / paused / error / end`，统一切换。

### 8.2 自动重连（retryLogic.ts，纯函数可测）

```
播放出错（hls ERROR / mpegts ERROR / video error）
  ↓ 若 autoReconnect = false → 直接显示错误
  ↓ 若重连次数 < 3：
      显示「正在连接…」
      等待 1s（第 1 次）→ 重试
      等待 3s（第 2 次）→ 重试
      等待 5s（第 3 次）→ 重试
  ↓ 仍失败 → 显示「播放失败：<原因>」+ 重试按钮
成功播放后重置重连计数为 0
切换频道时：销毁旧引擎实例（hls.destroy() / mpegts.destroy()），防内存泄漏
```

重连状态机：

```ts
type RetryState = { attempt: 0 | 1 | 2 | 3; waiting: boolean; failed: boolean }
// transition(错误事件) → attempt+1、waiting=true（记下需等待的秒数 1/3/5）
// transition(play 事件) → attempt=0、waiting=false、failed=false
// attempt 达到 3 且再次错误 → failed=true
```

### 8.3 编码与内容源注意事项

| 坑 | 对策 |
|---|---|
| 中文 M3U 是 GBK 编码 | fetch 后先 `arrayBuffer()`，用 `chardet` 检测，再 `TextDecoder(编码)` 解码（chardet 已装，不新增依赖） |
| Logo 服务器挂了 | `img.onError` → 替换为首字母兜底组件 |
| 源需要 User-Agent/Referer | V1 不支持（见 §12 已知限制）；hls.js 的 `xhrSetup` 已预留扩展点 |
| HLS 流临时断流 | hls.js `error` 事件 + §8.2 重连 |
| 混合内容（页面 https/流 http） | 本应用无此问题：`webSecurity: false` |

---

## 9. 依赖清单

### 9.1 新增依赖（3 个，全部为 renderer 运行时依赖）

```sh
pnpm add hls.js mpegts.js iptv-playlist-parser
```

| 包 | 版本（最新） | 类型支持 | 用途 |
|---|---|---|---|
| hls.js | 1.x | 自带 TS 类型 | .m3u8 HLS 直播流播放 |
| mpegts.js | 1.x | 自带 TS 类型 | 裸 MPEG-TS / FLV 直链播放（MSE） |
| iptv-playlist-parser | 0.15.2 | 自带 TS 类型（已确认 `types` 字段） | M3U 解析 |

### 9.2 明确不新增（已确认够用）

| 曾考虑 | 结论 |
|---|---|
| @tanstack/virtual 新装 | 已装；且现有 `DynamicVirtualList` 组件直接用 |
| minisearch | 已装，但 V1 用内存过滤即可 |
| fast-xml-parser | 已装，留给 V1.5 EPG |
| chardet | 已装，中文编码检测用它 |
| electron-store | 已装（主进程），但播放设置走 redux-persist，不需要 |
| 任何 UI 播放器库（react-player 等） | 不装；三引擎自封装更轻，且 messageVideo 已证明项目弃用 react-player 改原生 video |

---

## 10. 分步实施计划

> 每步均标注：做什么 / 为什么 / 收益 / 风险。顺序有依赖关系，不要乱序。
> 测试铁律：全程只做**纯逻辑命令行验证**（vitest / tsgo typecheck），不弹 GUI。

### Step 1：安装依赖

```sh
pnpm add -D hls.js mpegts.js iptv-playlist-parser
```

- **为什么**：三个包是播放与解析的唯一外部能力，先装好才能写代码
- **收益**：装完即可在代码里 import
- **风险**：pnpm 供应策略（minimumReleaseAge）可能拦刚发布版本——若报错，把包名加入
  `C:\Users\xi\.dsh\profiles\web\pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（本机 DSH 插件流程已确认过此机制）
- **验证**：`pnpm list hls.js mpegts.js iptv-playlist-parser` 能列出

### Step 2：数据库追加（version 15）

改动 `src/renderer/src/databases/index.ts`（只追加）：

1. 文件顶部 import 区加 `import type { IptvChannel, IptvFavorite, IptvHistory, IptvPlaylist } from '../pages/iptv/types'`
2. `db` 类型声明追加 4 个表
3. 文件末尾追加 `db.version(15).stores({...})`

- **为什么**：数据层是所有功能的地基
- **收益**：4 张表落地，后续所有 service 都有存储目标
- **风险**：⚠️ 严禁修改任何已有 version 的 stores 定义（会触发 Dexie 数据结构不一致错误）；只做追加
- **验证**：`pnpm typecheck:web` 通过。
  ~~dexie 冒烟测试~~（V1.1 修订删除：vitest renderer 环境是 jsdom，**没有 indexedDB**，且项目未装
  fake-indexeddb、也不为测试新装依赖——Dexie 建表/CRUD 的正确性由 typecheck + Step 11 用户手动冒烟兜底）

### Step 3：类型定义

新建 `src/renderer/src/pages/iptv/types.ts`，定义：

```ts
export type IptvPlaylist = { id: number; name: string; url: string; type: 'remote'|'local'; updatedAt: number }
export type IptvChannel = { id: number; playlistId: number; name: string; url: string; logo: string|null; group: string|null; tvgId: string|null }
export type IptvFavorite = { url: string; name: string; logo: string|null; group: string|null; tvgId: string|null; addedAt: number }
export type IptvHistory = { url: string; name: string; logo: string|null; playedAt: number }
```

> V1.1 修订：删除 `IptvChannel.order`（主键自增即插入顺序）；收藏/历史改为 url 主键快照（§5.1）。

### Step 4：M3U 服务（m3uService.ts）—— 核心逻辑

- `fetchRemotePlaylist(url)`：fetch → arrayBuffer → chardet 检测 → 解码文本
- `readLocalPlaylist(filePath)`：`window.api.file.readExternal(filePath, true)` 读取（主进程已做编码检测，renderer 无需再处理）
- `parseM3U(text)`：**纯函数**——`import { parse } from 'iptv-playlist-parser'`（⚠️ 不是 `Parser.parse`，无此导出）→ 遍历 `items` 取 5 字段 → 返回频道对象数组。解析与入库分离，纯函数可单测
- `parseAndStore(playlistId, text)`：`parseM3U` → 先清空该列表旧频道再批量入库
  （收藏/历史已是 url 快照表，清空重建频道**不影响**收藏与观看记录）
- 错误处理：URL 不可达 / 解析结果 0 频道 → 返回错误对象，UI 弹提示

- **为什么**：M3U 的"拉取 → 解析 → 入库"是所有数据功能的唯一入口
- **收益**：远程/本地两条路径统一走这一个函数，后续更新按钮直接复用；解析纯函数化使其可单测
- **风险**：⚠️ 网上很多 M3U 是 GBK 编码——必须走 chardet，不能盲用 `res.text()`
- **验证**：`m3uService.test.ts`（样例 M3U 文本 → `parseM3U` 断言解析出正确频道/分组/字段；`selectEngine` 引擎路由；chardet+TextDecoder 解码路径；入库部分不单测，见 §11.1）

### Step 5：频道查询服务（channelService.ts）—— Dexie 查询 + 纯过滤函数

- 频道加载：`loadChannels(playlistIds)`（`orderBy(':id')` 恢复 M3U 原序，全量进内存，后续过滤都在内存做）
- **纯过滤函数（可单测，不碰 Dexie）**：`filterChannels(channels, { group, keyword })`、`groupByChannels(channels)`（分组聚合，保留首次出现顺序）
- 收藏：`toggleFavorite(channel)`（url 主键：`db.iptv_favorites.get(channel.url)` 有则 `delete`、无则 `put` 频道快照）
- 最近观看：`recordPlay(channel)`（`put({ url, name, logo, playedAt: Date.now() })` 天然按频道去重 + 超 50 删最旧）

- **为什么**：组件层只需要"要什么数据"，不需要知道 Dexie 细节；过滤逻辑纯函数化是因为 jsdom 测不了 Dexie（§11.1）
- **收益**：过滤逻辑可单测；组件更薄
- **风险**：低
- **验证**：`channelService.test.ts`——只测 `filterChannels` / `groupByChannels` 纯函数（分组聚合、搜索大小写、url 收藏匹配）；收藏切换与历史上限的 Dexie 交互手动冒烟

### Step 6：重连逻辑（retryLogic.ts）—— 纯函数

实现 §8.2 状态机（attempt 0→3、等待 1/3/5 秒、失败终止、成功复位）

- **为什么**：IPTV 源断流是常态，重连是用户第 11 项硬需求
- **收益**：可单测；UI 只需调用 `transition`
- **风险**：⚠️ 注意切换频道时必须重置状态 + 销毁旧引擎，否则会"播新频道却重连旧流"
- **验证**：`retryLogic.test.ts`（模拟错误事件序列 → 断言等待时长与最终失败）

### Step 7：播放引擎（useIptvPlayer.ts + playerStore）

- 模块级 playerStore（仿 music/playerStore.ts）：currentChannel / isPlaying / engineType / retryState
- `useIptvPlayer` hook：订阅 store + 暴露 play/toggle/seekVolume/mute/fullscreen/stop
- 引擎切换与销毁（§8.1 + 8.2）

- **为什么**：播放是核心中的核心
- **收益**：与 UI 解耦，将来小窗口直接复用
- **风险**：⚠️ 内存泄漏——切频道/卸载组件必须 `hls.destroy()`；⚠️ 三个引擎的生命周期回调要统一成同一套事件，别三套 callback
- **验证**：单元测试覆盖 URL 路由选择（`selectEngine`）与重连联动；真实流播放属 GUI 行为，遵循铁律不做界面测试，留待用户手动验证

### Step 8：UI 组件（按 §7 逐个实现）

顺序：`Logo` → `ChannelItem` → `ChannelList`（虚拟滚动）→ `GroupSidebar` → `PlayerControls` → `PlayerArea` → `SettingsModal` → `IptvPage`

- **为什么**：自底向上，每块可独立完成
- **收益**：小步快跑
- **风险**：⚠️ `DynamicVirtualList` 没有 `count` prop——数据传 `list`、渲染传 `children: (item, index) => ReactNode`，先读 `dynamic.tsx` 的 props 定义再接入
- **验证**：vitest 组件测试（RTL）覆盖 Logo 兜底、收藏切换按钮；不做浏览器 GUI 测试

### Step 9：侧边栏接线（6 文件小改，§7.1 表格逐条执行；注意第 6 个文件 SidebarIconsManager 是 V1.1 补上的必改项）

- **为什么**：没有这一步，页面不存在入口
- **收益**：Tab 真正可点
- **风险**：低（纯增量）
- **验证**：`pnpm typecheck:web` 通过

### Step 10：设置弹窗（SettingsModal）

- 播放列表管理：添加 URL（输入框）、添加本地文件（`window.api.file.select` 打开文件选择器）、每行「更新 / 删除」按钮
- 播放设置：自动播放、自动重连（Switch）、默认音量（Slider）

- **为什么**：V1 清单第 12 项"本地保存配置"
- **收益**：用户可自主管理全部列表
- **风险**：⚠️ 删除播放列表时需删除该列表的频道缓存（`iptv_channels` where playlistId）；
  收藏/历史为 url 快照表**有意保留**（用户删列表不丢收藏，快照仍可显示、可播放）——V1.1 修订后无孤儿数据问题
- **验证**：删除逻辑属 Dexie CRUD，不单测（jsdom 限制，见 §11.1），手动冒烟：删列表 → 频道消失、收藏仍在

### Step 11：全量验证与收尾

1. `pnpm typecheck`（node + web + aiCore 三项目全部通过）
2. `pnpm test`（新增测试全绿 + 存量测试不回归）
3. `pnpm lint`（oxlint + eslint + typecheck + biome format 四合一）
4. 手动冒烟（用户操作，遵循不弹 GUI 铁律：由用户在开发机上自行打开验证）
   重点冒烟项：添加远程/本地 M3U → 频道入库与分组显示；更新列表 → 收藏/历史不丢；
   删除列表 → 频道消失、收藏仍在；三类引擎各播一个源；断网重连提示

- **为什么**：交付前必须证明"能编译、测试过、格式对"
- **收益**：减少回归事故
- **风险**：存量测试可能因新增 store 触发快照变化——若失败，检查是否只影响新代码

---

## 11. 测试计划

### 11.1 测试铁律（用户明确要求）

- ✅ 只做纯逻辑测试（vitest）+ 编译检查（tsgo typecheck）
- ✅ 命令行运行：`pnpm test` / `pnpm test:renderer` / `pnpm typecheck`
- ❌ 不做 GUI/界面测试：不弹窗、不自动开浏览器、不启动带界面的桌面软件
- ⚠️ **环境约束（V1.1 修订，已核实 vitest.config.ts）**：renderer 测试项目跑在 **jsdom 环境，没有
  indexedDB**，且项目未装 fake-indexeddb（不为测试新装依赖）→ **所有测试不得直接操作 Dexie**。
  Dexie CRUD 的正确性由 `pnpm typecheck:web`（类型）+ Step 11 用户手动冒烟兜底；
  单测只覆盖纯函数（解析/过滤/引擎路由/重连/reducer）与组件（mock props，不触 db）。

### 11.2 新增测试清单

| 文件 | 覆盖 |
|---|---|
| `__tests__/m3uService.test.ts` | `parseM3U` 纯解析（含 tvg-logo、group-title、中文名）；空文件；无频道；chardet+TextDecoder 解码路径；`selectEngine` 引擎路由 |
| `__tests__/retryLogic.test.ts` | 成功→错误→重试序列；3 次失败终止；成功复位；关开关直接失败 |
| `__tests__/channelService.test.ts` | `filterChannels` 搜索过滤（含大小写）；`groupByChannels` 分组聚合（含未分组兜底）；url 收藏匹配（纯函数，不碰 Dexie） |
| `__tests__/store/iptvSettingsSlice.test.ts` | 默认值；setVolume 边界（0-100 夹取）；自动播放/重连开关 |
| `__tests__/components/Logo.test.tsx` | Logo 地址正常显示；onError 后显示首字母（jsdom + mock props） |
| `__tests__/components/ChannelItem.test.tsx` | 收藏星切换调用；点击触发播放回调（jsdom + mock props） |

> 收藏切换与历史 50 条上限涉及 Dexie 交互，不单测（jsdom 限制，见 §11.1），由 Step 11 手动冒烟覆盖。

### 11.3 测试样例 M3U（写入测试 fixture）

```
#EXTM3U
#EXTINF:-1 tvg-id="CCTV1" tvg-logo="http://logo/cctv1.png" group-title="央视",CCTV-1 综合
http://example.com/cctv1.m3u8
#EXTINF:-1 tvg-logo="http://logo/gx.png" group-title="广西",广西卫视
http://example.com/gx.ts
#EXTINF:-1 group-title="体育",CCTV5+
http://example.com/cctv5.mp4
```

断言：3 个频道、分组 {央视, 广西, 体育}、`cctv5.mp4` 走 native 引擎、`gx.ts` 走 mpegts 引擎、`cctv1.m3u8` 走 hls 引擎。

---

## 12. 已知限制与后续迭代（V1.5+）

### 12.1 V1 已知限制（诚实记录，避免用户误解为 bug）

| 限制 | 影响 | 何时解决 |
|---|---|---|
| 不支持带 User-Agent/Referer 的源 | 少数源需要特殊 UA 才能播 | V1.5：hls.js `xhrSetup` + mpegts 自定义 loader 已留扩展点 |
| 不支持 EPG/当前节目 | 播放器下方无节目单 | V1.5：fast-xml-parser 解析 XMLTV + tvgId 匹配 |
| 无 M3U 自动更新 | 源内容变化需手动点「更新」 | V1.5：按播放列表 `updatedAt` + 启动时/定时检查 |
| 不支持 Catch-up/Xtream | 回看、账号登录源不可用 | V2（若需要）；届时走 Dexie 版本升级加列，代价极小 |
| HEVC/H.265 源可能无法播放 | 大量 4K/高清 IPTV 源是 H.265，Chromium **无软解**、依赖系统硬解——无硬解的机器会黑屏或报错（hls.js/mpegts.js 均受影响，属源编码问题非应用 bug） | 平台限制；报错走重连→最终提示，用户可换 H.264 源 |
| 本地文件播放列表失联 | 若用户移动本地 .m3u 文件，更新会读不到 | 更新时提示文件不存在，可重新导入 |

### 12.2 V1.5 路线图（本次不做）

1. **EPG 电子节目单**：设置页添加 XMLTV URL → 定时拉取 → fast-xml-parser 解析 → `tvgId` 匹配频道 → 播放器下方显示「正在播放 + 时间轴」
2. **当前节目**：进入页面即显示当前频道正在播放的节目
3. **M3U 自动更新**：设置项「手动 / 启动时 / 每 6 小时 / 每天」

### 12.3 桌面小窗口（用户后续计划）

播放引擎已设计为**与 React 解耦的模块级单例**（playerStore + playerStore API），
后续接入桌面小窗口（参考 BB 已有 `widgets/` 音乐小窗口架构）时直接复用播放与重连逻辑，UI 重新布局即可。

---

## 13. 风险清单与规避

| # | 风险 | 等级 | 规避措施 |
|---|---|---|---|
| 1 | 改动"冻结文件"引发生存量问题 | 中 | 只追加 version 15 / 只追加 reducer，**绝不改已有定义**；用户已确认 V2 约束作废 |
| 2 | hls.js/mpegts.js 与 Electron 41 兼容性 | 低 | 两者均为纯前端库，依赖 MSE（Electron Chromium 内置）；版本装最新稳定即可 |
| 3 | GBK 编码中文源乱码 | 中 | chardet 检测 + TextDecoder，测试用例覆盖 |
| 4 | 频道列表上万条卡顿 | 低 | DynamicVirtualList 虚拟滚动（已装、已有测试） |
| 5 | 播放器内存泄漏（切频道） | 中 | 统一 `destroy()` 生命周期；卸载组件必清理；用测试守住重连状态机 |
| 6 | 更新/删除播放列表导致收藏与历史失效 | ~~中~~ 已消除 | V1.1 改用 url 主键快照表（§5.1），与列表生命周期解耦；删列表只需删频道缓存 |
| 7 | pnpm 供应策略拦截新装包 | 低 | 本机 add `minimumReleaseAgeExclude`（§Step 1 已列操作路径） |
| 8 | 存量测试因 store 变化回归 | 低 | 收尾步骤全量 `pnpm test`；若快照失败只审查是否新代码引起 |
| 9 | 部分源裸 TS 直链不标准 | 低 | mpegts.js 按 MSE 规范播放；个别非常规源报错走重连→最终提示，属源问题非本应用问题 |
| 10 | 后续桌面小窗口要复用播放器 | 无 | 播放引擎独立单例设计已前置（§4.2 / §8） |
| 11 | HEVC/H.265 源无法播放 | 中 | Chromium 平台限制（无软解）；报错走重连→最终提示，属源编码问题非应用 bug（§12.1） |

---

## 附录 A：关键文件路径速查

| 操作 | 文件 |
|---|---|
| 加侧边栏图标（类型） | `src/renderer/src/types/index.ts`（L477） |
| 加侧边栏图标（默认显示） | `src/renderer/src/config/sidebar.ts` |
| 加侧边栏图标（图标+路径映射） | `src/renderer/src/components/app/Sidebar.tsx` |
| 设置页图标管理 iconMap（**必改**，satisfies 约束） | `src/renderer/src/pages/settings/DisplaySettings/SidebarIconsManager.tsx` |
| 加路由（lazy + Route 两处） | `src/renderer/src/Router.tsx` |
| 加图标中文名 | `src/renderer/src/i18n/label.ts` |
| 追加数据库表 | `src/renderer/src/databases/index.ts`（追加 version 15） |
| 注册设置 slice | `src/renderer/src/store/index.ts`（追加 import + combineReducers） |
| IPTV 业务代码 | `src/renderer/src/pages/iptv/`（全新目录） |

## 附录 B：参考资料

- `iptv-playlist-parser`（npm，0.15.2，自带 TS 类型，named export `parse`，输出结构见 §2.4）
- hls.js（官方，1.7.2，Chromium MSE HLS 播放标准实现，自带 `dist/hls.d.ts`）
- mpegts.js（xqq 维护，1.8.2，MSE 播裸 TS/FLV，自带 `d.ts/mpegts.d.ts`）
- 项目内先例：`src/renderer/src/pages/music/`（播放器架构模板）、`src/renderer/src/components/VirtualList/dynamic.tsx`（虚拟滚动）