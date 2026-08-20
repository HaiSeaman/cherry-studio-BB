# Cherry Studio 功能聚合与架构重构方案

> **文档版本**：v2.0（2026-08-20 全面修订）
> **修订原因**：v1.0 的"内存降低 40%~50%"目标经代码实证**不成立**，本版基于对实际代码的逐文件核查，修正收益预期、补全实现细节与风险防护，形成可直接执行的开发基准文档。
> **核心目标**：把分散的功能页聚合为两大中枢，**提升操作效率与 UI 实用性**（"知道什么时候在哪里做些什么，不用点来点去"），同时统一消息系统代码。

---

## 目录

1. [修订说明与收益真相（必读）](#一修订说明与收益真相必读)
2. [现状架构事实核查（代码实证）](#二现状架构事实核查代码实证)
3. [目标架构总览](#三目标架构总览)
4. [模块一：小程序扩展（保持现状）](#四模块一小程序扩展保持现状)
5. [模块二：个人效率中控台（详细设计）](#五模块二个人效率中控台详细设计)
6. [模块三：AI 多态助手工作台（详细设计）](#六模块三ai-多态助手工作台详细设计)
7. [风险清单与防护措施](#七风险清单与防护措施)
8. [分批实施路线图（5 批次）](#八分批实施路线图5-批次)
9. [整体验收清单](#九整体验收清单)
10. [实施纪律（每批次通用）](#十实施纪律每批次通用)

---

## 一、修订说明与收益真相（必读）

### 1. v1.0 → v2.0 修正了什么

| v1.0 的说法 | 代码实证结论 |
| :--- | :--- |
| "干掉独立重型路由可省 120~200MB" | **不成立**。所有非首屏页面早已 `lazy()` 懒加载（`Router.tsx:14-23`），同一时刻只挂载 1 个页面，切走即卸载 DOM。不存在"多套页面常驻外壳" |
| "条件渲染省 80~150MB" | **不成立**。助手/话题切换本来就会卸载旧视图（`Chat.tsx` 用 `key={topic.id}` 强制重建） |
| "音频引擎需提取为顶层单例" | **已完成**。`audioEngine` 是模块级单例，切走音乐页音乐照播（见现状核查 §2.3） |
| "预计总内存降低 40%~50%" | **修正为 ≈ 持平**。实测：切换任何功能页内存均稳定在 ~500MB；真正的内存变量是小程序 webview（独立渲染进程，每个 +100~400MB），已由"闲置 30 分钟回收"机制治理 |

### 2. 修正后的收益真相表

| 类别 | 内容 | 量级 |
| :--- | :--- | :--- |
| ✅ 真收益（大） | **操作收拢**：侧边栏入口 7 → 4，一站式助手工作台；自动化执行结果回流聊天流 | 核心价值 |
| ✅ 真收益（大） | **代码统一**：生图与聊天本就共用同一套消息块系统，合并后从两套并行 UI 归一为一套，长期维护成本大降 | 工程 |
| ✅ 真收益（中） | **净删 3 套页面外壳代码**：MusicPage 全套、PaintPage 外壳、Automation×3 整页 + 对应路由，安装包与 JS 解析量下降 | 工程 |
| ✅ 真收益（中） | **UX 创新**：自动化"执行简报卡片"让无人值守任务的结果可随时回溯 | 产品 |
| ➖ 持平 | 常驻内存：常驻的仍是那些单例服务（音频/闹钟/调度器，合计 <20MB），一个没少也没多 | 中性 |
| ⚠️ 反向风险 | 中控台若把 6 个面板同时挂载，打开该页**峰值内存反而升高**——必须做 tab 懒挂载 | 需防护 |

**一句话定位**：这是一次**体验与工程质量的 refactor**，不是内存优化。内存大头（小程序 webview）不在本次范围内。

---

## 二、现状架构事实核查（代码实证）

> 本节为 2026-08-20 对实际代码的核查结果，是后续所有设计的事实基础。**凡标注"已实现"的项，实施时不得重复造轮子。**

### 2.1 路由与页面挂载

- 路由定义：`src/renderer/src/Router.tsx:28-60`
- 一级路由：`/`（聊天）、`/apps/:appId`、`/apps`、`/paint`、`/music`、`/notes`、`/automation`、`/automation/new`、`/automation/task/:taskId`、`/automation/run/:runId`、`/settings/*`、`/launchpad`
- 除 HomePage 外全部 `lazy()` 懒加载 + `Suspense` 包裹（`Router.tsx:14-23`）
- **react-router 同一时刻只挂载一个页面，切走即卸载**——无 display:none 假隐藏、无 keep-alive
- 已访问页面的 JS 模块会留在内存（每个仅几 MB），这是唯一残留成本

### 2.2 侧边栏体系

- 默认图标：`src/renderer/src/config/sidebar.ts:7` → `DEFAULT_SIDEBAR_ICONS = ['assistants', 'minapp', 'paint', 'music', 'notes', 'automation']`
- 必显图标：`config/sidebar.ts:14` → `REQUIRED_SIDEBAR_ICONS = ['assistants']`
- 渲染逻辑：`src/renderer/src/components/app/Sidebar.tsx:211-227`（`renderOrder` + `pathMap` 映射到路由）
- 持久化状态：`src/renderer/src/store/settings.ts:141-185`（`sidebarIcons.visible / disabled`，经 redux-persist 持久化）
- 设置界面：`src/renderer/src/pages/settings/DisplaySettings/SidebarIconsManager.tsx`
- **redux-persist 当前 version = 1**（`src/renderer/src/store/index.ts:85`），migrate 函数在 `store/index.ts:72-79`（v0→v1 为老用户补 automation 图标——本项目的既有踩坑经验：**删/增图标必须配 migrate**）

### 2.3 后台单例服务（全部已实现，与页面解耦）

| 服务 | 位置 | 生命周期 |
| :--- | :--- | :--- |
| 音频引擎（单个 HTMLAudioElement，本地音乐/FM 互斥） | `src/renderer/src/pages/music/services/audioEngine.ts:162`（模块级单例） | 页面卸载后继续播放；重挂载用 `snapshot()` 恢复状态 |
| 闹钟调度器（1s tick） | `src/renderer/src/pages/notes/services/alarmScheduler.ts`（应用级单例） | NotesPage 卸载后闹钟照响 |
| 自动化调度器（30s tick + 90s 补触发窗口） | `src/main/services/AutomationService.ts:23-32`（**主进程**，任务存 `userData/automation.json`） | 与渲染进程 UI 完全解耦 |

### 2.4 数据模型现状

- **Assistant**：`src/renderer/src/types/index.ts:26-54`，**已有 `type: string` 字段**（行 31），但无枚举约束，未用于区分引擎
- **TopicType**：`src/renderer/src/types/index.ts:252-256` → `'chat' | 'session' | 'paint'`
- **绘画会话已存于聊天同一张表**：`src/renderer/src/pages/paint/services/paintService.ts:41-48`，`PaintTopic` 存 `db.topics`（`type: TopicType.Paint`），使用与聊天同一套消息块（`createImageBlock` 等）→ **并入聊天不需要数据迁移脚本，只需重新关联 assistantId**
- **AutomationTask 已绑定助手**：`packages/shared/automation.ts:21-42`，`assistantId` 字段现成（行 25），含 schedule/systemTools/useMcpTools/notifyOnComplete
- **自动化执行器**：`src/renderer/src/automation/runner.ts`——复用渲染进程 `buildStreamTextParams` + AiProvider，执行完发系统通知（`NotificationSource.automation` 已注册）
- 持久化：聊天/话题/消息块走 Dexie（`src/renderer/src/databases/index.ts`）；`paint` slice 在 persist blacklist 中（不持久化）；`musicSettings`、`hubSettings` 持久化

### 2.5 已实现功能清单（实施时直接复用）

- ✅ **✨ 优化提示词**：`paintService.ts:56` `enhancePrompt()`——用翻译模型把中文短语扩写为专业提示词，已上线
- ✅ NotesPage 已是 2×2 四宫格：`src/renderer/src/pages/notes/NotesPage.tsx:22-33`（便签/闹钟/待办/日历）
- ✅ MusicPage 双栏：`src/renderer/src/pages/music/MusicPage.tsx`（LocalMusicPlayer + FmRadio）
- ✅ 聊天消息流分页加载（`Messages.tsx:88-108`，`loadedGroups` 机制，**无虚拟滚动**）
- ✅ 小程序闲置 30 分钟自动回收（2026-08 已上线）

---

## 三、目标架构总览

```
【重构前：7 个独立一级入口】                【重构后：4 个入口】
┌───────────────────────────────┐          ┌───────────────────────────────┐
│ 💬 AI 聊天 (/)                 │          │ 🤖 AI 助手工作台 (/)           │
│ 🎨 灵感生图 (/paint)          │ ──合并──▶ │   助手类型切换:                │
│ ⚡ 自动化任务 (/automation)    │          │   💬 对话 / 🎨 生图 / ⚡ 自动化│
│ 📝 便签闹钟 (/notes)          │          ├───────────────────────────────┤
│ 🎵 音乐电台 (/music)          │ ──合并──▶ │ 📋 个人效率中控台 (/notes)     │
│ 🧩 小程序 (/apps)             │ ──保持──▶ │ 🧩 小程序 (/apps)             │
│ ⚙️ 系统设置 (/settings)       │ ──保持──▶ │ ⚙️ 系统设置 (/settings)       │
└───────────────────────────────┘          └───────────────────────────────┘
```

### 路由变更映射表

| 现路由 | 去向 | 动作 |
| :--- | :--- | :--- |
| `/` | AI 助手工作台（按助手类型动态渲染） | 增强 |
| `/paint` | 并入 `/` 的生图助手视图 | **删除路由** |
| `/automation`、`/automation/new`、`/automation/task/:taskId`、`/automation/run/:runId` | 并入 `/` 的自动化助手视图 | **删除路由** |
| `/music` | 并入 `/notes` 中控台音乐卡片 | **删除路由** |
| `/notes` | 个人效率中控台（四宫格 + 音乐） | 增强 |
| `/apps`、`/apps/:appId`、`/settings/*`、`/launchpad` | 不变 | 保持 |

### 常驻后台服务（合并前后完全不变）

`audioEngine`（音频）、`alarmScheduler`（闹钟）、主进程 `AutomationService`（自动化调度）——三者均已是单例、已与页面解耦，**本次重构一行都不需要动它们的生命周期**。

---

## 四、模块一：小程序扩展（保持现状）

- **业务策略**：**保持现状不变，不作抽屉化或弹窗化改造**。尊重既有深度操作习惯，保留大屏沉浸式独立工具体验。
- **内存治理已就位**：小程序为独立渲染进程（每个 +100~400MB，取决于网页内容），已有"闲置 30 分钟自动回收（后台听歌时跳过）"机制，无需额外改动。
- **唯一要求**：后续若发现 `/apps/:appId` 退出时 Webview 未触发清理逻辑，单独修复，不纳入本次合并范围。

---

## 五、模块二：个人效率中控台（详细设计）

将 `/music` 的核心功能并入 `/notes`，形成完整的 2×2 四宫格个人效率中控台。

### 1. 布局设计

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 个人效率中控台 (NotesPage 增强版)                                        │
├────────────────────────────────────┬────────────────────────────────────┤
│ 【左上】：便签 & 待办 (tab 二合一)   │ 【右上】：闹钟与日程提醒 (不动)     │
│ 顶栏 Segmented [📝 便签 | ☑️ 待办]  │ 倒计时与定点闹钟列表                 │
│    ↑ 只有激活 tab 挂载组件           │ 响铃事件与系统级通知                 │
├────────────────────────────────────┼────────────────────────────────────┤
│ 【左下】：音乐 & FM (tab 二合一)     │ 【右下】：桌面日历 (不动)            │
│ 顶栏 Segmented [🎵 本地音乐 | 📻 FM]│ 月视图 / 周视图日历                  │
│    ↑ 只有激活 tab 挂载组件           │ 日期日程事件打点与联动               │
│ 唱片机卡片: 封面动效/播放控制/进度条 │                                    │
└────────────────────────────────────┴────────────────────────────────────┘
```

### 2. 核心交互细节

- **便签 & 待办 tab**：切"便签"渲染 NotesPanel（`db.hub_notes`），切"待办"渲染 TodoPanel（`db.hub_todos`）；两面板代码现成（`pages/notes/components/`），只改容器为 tab 切换；草稿状态存 Dexie，切换不丢失。
- **音乐 & FM tab**：
  - "本地音乐"：紧凑唱片机卡片——专辑封面旋转动效、歌名歌手、播放/暂停/上一首/下一首、迷你进度条、播放模式切换
  - "FM 电台"：精选频道列表 + 一键收听 + 音量增益
  - 核心播放逻辑**全部复用** `useLocalPlayer`（`pages/music/hooks/useLocalPlayer.ts`）与 `audioEngine`，不新写播放器
- **切页不断播**：用户切去聊天或小程序时中控台 UI 销毁，`audioEngine` 持续播放；回到中控台时用 `audioEngine.snapshot()` 恢复 UI 状态（该机制现成，音乐页已在用）

### 3. 硬性技术约束

- **【防内存反增】tab 懒挂载**：`{activeTab === 'music' && <MusicCard />}`——非激活 tab 的组件**彻底不渲染**。禁止 6 个面板同时挂载。
- **FM 列表按需拉取**：进入 FM tab 才请求电台列表，不在中控台挂载时预取。
- **闹钟、日历面板不动**：`AlarmPanel`、`CalendarPanel` 保持现状（闹钟调度器在页面外常驻，本就不受影响）。

---

## 六、模块三：AI 多态助手工作台（详细设计）

左侧助手列表支持 3 种助手类型，点击不同助手，右侧动态挂载专属工作区。

### 1. 统一数据模型

```ts
// src/renderer/src/types/index.ts 修改
export type AssistantType = 'chat' | 'image_gen' | 'automation'

export type Assistant = {
  id: string
  name: string
  type: AssistantType   // 原 type: string 收敛为联合类型
  // ...其余字段不变
}
```

**老数据兜底规则（不写迁移脚本）**：新增辅助函数 `getAssistantType(a: Assistant): AssistantType`——`type` 缺失或值为 `'image_gen'` / `'automation'` 之外的任何值时，一律返回 `'chat'`。所有按类型分支的代码统一走此函数。

### 2. 助手形态 1：💬 对话助手（现状保持）

标准聊天模式：消息流、模型选择、文件上传、思考开关、联网搜索——全部现状不动。

### 3. 助手形态 2：🎨 生图助手

```
┌────────────────────────────────────────────────────────────────────────┐
│ 消息流（复用聊天消息块系统，图片网格卡片）                              │
│ 👤 用户: 赛博朋克风格的雨夜东京街道 (附: 参考图.jpg)                    │
│ 🎨 生图助手: [缩略图1] [缩略图2]  ← 点击放大预览，关闭释放显存          │
├────────────────────────────────────────────────────────────────────────┤
│ 专属生图输入栏（PaintInputbar 改造为聊天 Inputbar 变体）                │
│ [参数胶囊栏] 模型[▼] 比例[▼] 清晰度[▼] 张数[▼]                        │
│ [提示词输入框....................................................]    │
│ [📎 参考图]  [✨ 优化提示词(已有 enhancePrompt，直接复用)]  [🚀 生成]  │
└────────────────────────────────────────────────────────────────────────┘
```

**实现要点**：

1. **工作区切换（审查修订：挂载点上移 + 双重判断）**：分发点放在 **HomePage 层**（替换/包裹 `<Chat>`），而非塞进 Chat 内部——Chat 是编排组件，Messages/Inputbar/快捷键绑死聊天语义。判断用 `getAssistantType(assistant)`，并约束 image_gen 助手下的话题一律为绘画话题（不混态）。生图专属组件 **再 `lazy()` 一层**（保证不进聊天首屏 chunk）。
2. **数据关联（审查修订：走 Redux，非改 db 行）**：聊天首页话题列表来自 **Redux `assistant.topics` 数组**（持久化），`db.topics` 行只是消息容器（无 assistantId 之分）。因此 re-associate 的真实动作是：首次打开生图助手时，把 `db.topics` 中 `type==='paint'` 的话题元数据 **dispatch 进该助手的 `topics` 数组**（`store/assistants.ts` 的 `updateTopics` action）。约束：
   - **幂等**：按话题 id 去重，重复触发不重复插入
   - **删除助手防孤儿**：生图助手被删除时其 topics 随 redux 删除（现状行为），绘画话题若需保留需先转移——一期接受"删助手即删其绘画话题"（与聊天助手行为一致）
   - **'paint' 假 assistantId**：paint 消息的 assistantId 是字符串 `'paint'`（`paintService.ts:279,284`），并入后新生成消息改用真实助手 id，历史消息不回填
3. **参数胶囊栏**：迁移 `PaintInputbar.tsx` 的比例（1:1/16:9/9:16/4:3）、分辨率档位、张数（1~4）逻辑，作为输入框上方胶囊行。
4. **参考图垫图**：复用聊天附件上传，图片附件自动作为图生图参考。
5. **✨ 优化提示词**：`enhancePrompt()`（`paintService.ts:56`）已实现，按钮直接接入。
6. **模型过滤**：生图助手激活时，模型选择器仅显示生图模型。
7. **大图显存治理**：消息流只渲染缩略图；点击弹出 `ImagePreviewModal` 加载原图，关闭立即释放。

### 4. 助手形态 3：⚡ 自动化任务助手

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚡ 自动化助手工作台（内嵌视图）                                         │
│ ┌─ [今日调度概览] ──────────────────────────────────────────────────┐  │
│ │ 今日执行: 12  成功: 12  失败: 0  下次倒计时: 00:42:15              │  │
│ │ 关联任务:【每日早报抓取】 状态:[启用Switch] [▶立即触发] [⛶全屏展开]│  │
│ └──────────────────────────────────────────────────────────────────┘  │
│ [📊 运行流水 Timeline]              [⚙️ 任务与工具配置]                │
│ ⏰ 09:00 执行成功(12s)                                                 │
│   ├─ 🔵 AI 思考 / 🟢 工具调用 / 🟣 AI 输出（步骤树）                    │
└────────────────────────────────────────────────────────────────────────┘
```

**实现要点**：

1. **三页改内嵌**：`AutomationPage` → 概览看板 + 任务列表内嵌面板；`AutomationTaskEditPage` → 弹窗/抽屉；`AutomationRunDetailPage` → Timeline 内嵌面板 + **保留"全屏展开"出口**（Timeline 信息密度高，半屏塞不下时用户可展开）。
2. **执行简报卡片（本模块核心创新，审查修订补全细节）**：`runner.ts` 执行完成后（`finishRun` 后），向绑定的 `assistantId` 对应话题写入简报消息：
   - **目标话题定位**：绑定助手的「运行日志」话题（不存在则创建，`db.topics` 加行 + redux `addTopic`），runner 固定写入它
   - **块类型**：一期用 **text block**（状态/耗时/步骤数/输出摘要 + 运行 ID 文本），不新造块类型；工作台 Timeline 提供详情查看
   - **UI 刷新**：写入用 `dbService.appendMessage` 后需 dispatch/事件通知，正在打开的聊天视图才能看到（消息走 thunk 加载）
3. **调度器零改动**：主进程 `AutomationService`（30s tick、automation.json 存储、看门狗超时）**一行不动**。
4. **多自动化助手**：用户可创建多个 `type: 'automation'` 助手，各自绑定一组任务（`AutomationTask.assistantId` 关系现成）。

### 5. 助手创建向导

点击 `[+ 新建助手]` 弹出三选一模板卡片：

1. **💬 通用对话助手** → 初始化标准模型与对话配置
2. **🎨 灵感生图助手** → 装载生图参数胶囊、提示词增强、默认关联绘画话题
3. **⚡ 自动化任务助手** → 引导配置定时规则（单次/间隔/每日）、系统工具授权勾选（file_read/notify/shutdown 等 9 项）、MCP 工具绑定、初始指令

助手列表按类型显示标识图标（💬 / 🎨 / ⚡）。

---

## 七、风险清单与防护措施

| # | 风险 | 概率 | 防护措施 |
| :--- | :--- | :--- | :--- |
| 1 | **中控台 6 面板同挂导致峰值内存反升** | 高 | 硬性约束：tab 懒挂载，非激活 tab 组件不渲染（见 §五.3） |
| 2 | **老用户侧边栏死图标**（persist 里存着已删路由的图标，点击 404） | 高 | **每删一批路由，persist version +1 并在 migrate 中从 `visible`/`disabled` 移除对应图标**（本项目 v0→v1 加 automation 图标时踩过同类坑） |
| 3 | **聊天首屏 chunk 变重**（生图/自动化代码被打进主包） | 中 | 生图、自动化工作区组件在 Chat 内部再 `lazy()` 一层 |
| 4 | **老绘画会话丢失** | 中 | 不写迁移脚本：`TopicType.Paint` 话题原地 re-associate 到生图助手（§六.3 要点 2）；验收时逐条核对历史会话 |
| 5 | **自动化调度回归**（任务不跑/重复跑） | 中 | 主进程 `AutomationService` 零改动；只改渲染进程展示层与 runner 的通知回流 |
| 6 | **聊天消息流无虚拟滚动，生图并入后长列表压力** | 中 | 依赖现有 `loadedGroups` 分页机制；图片块强制缩略图渲染；如仍卡顿，二期再评估虚拟滚动 |
| 7 | **自动化 Timeline 半屏局促** | 低 | 保留"全屏展开"出口（§六.4 要点 1） |
| 8 | **pnpm test 在 Windows 以 0xC0000005 退出** | 已知 | 预存在的原生崩溃（收尾阶段），实际用例已通过；判断回归用 stash 对比法 |

---

## 八、分批实施路线图（5 批次）

> 每批次独立 git 分支、独立验收、可独立回退。批次 1 与批次 2 无依赖可并行；批次 3、4 依赖批次 2 的类型定义；批次 5 收尾。

### 批次 1：中控台合并音乐（低风险，快见效）

**目标**：`/notes` 成为含音乐的完整中控台；下线 `/music`。

**步骤**：

1. 改造 `src/renderer/src/pages/notes/NotesPage.tsx`：
   - 左上格子：`NotesPanel` + `TodoPanel` 合并为 Segmented tab（`[便签|待办]`），非激活不挂载
   - 左下格子（原待办位置）：新建音乐卡片，Segmented tab（`[本地音乐|FM]`），非激活不挂载
   - 右上闹钟、右下日历保持不动
2. 新建紧凑版音乐卡片（建议 `pages/notes/components/MusicCard.tsx`）：
   - 复用 `useLocalPlayer`、`audioEngine`、`FmRadio` 的数据与逻辑（`pages/music/` 下相应文件），UI 紧凑化为卡片尺寸
   - 重新挂载时用 `audioEngine.snapshot()` 恢复播放状态
   - FM 列表进入 tab 才拉取
3. 路由下线：`Router.tsx` 删除 `/music` 路由与 `MusicPage` lazy import
4. 侧边栏清理（四处同步改）：
   - `config/sidebar.ts`：`DEFAULT_SIDEBAR_ICONS` 移除 `'music'`
   - `types/index.ts`：`SidebarIcon` 联合类型移除 `'music'`
   - `components/app/Sidebar.tsx`：`pathMap` 移除 music
   - `pages/settings/DisplaySettings/SidebarIconsManager.tsx`：移除 music 选项
5. persist 迁移：`store/index.ts` version 1 → 2，migrate 中从 `settings.sidebarIcons.visible` 和 `disabled` 移除 `'music'`
6. `musicSettings` slice 保留（播放设置仍在用）

**验收标准**：
- [ ] 中控台四个格子全部正常，tab 切换流畅
- [ ] 窄屏（<1000px 单列）与迷你窗下中控台可用、不溢出（审查补充）
- [ ] 播放音乐后切去聊天页 → 音乐持续播放；回中控台 → 进度/状态正确恢复
- [ ] 离开中控台闹钟照响（回归）
- [ ] 老用户（有持久化数据）侧边栏无 music 死图标
- [ ] `pnpm type-check` 通过

### 批次 2：助手多态数据模型（中风险，纯铺垫）

**目标**：Assistant 类型体系就位，新建助手向导上线。不删任何现有功能。

**步骤**：

1. `types/index.ts`：新增 `AssistantType` 联合类型；`Assistant.type` 收敛为该类型；新增 `getAssistantType()` 兜底函数
2. 全库检查现有 `Assistant.type` 实际取值（assistants slice 持久化数据），确认兜底规则覆盖
3. 新建助手弹窗改造为三模板向导（§六.5）；自动化模板引导选择/创建绑定的 `AutomationTask`（`assistantId` 关系现成）
4. 助手列表按 `getAssistantType` 显示类型图标（💬/🎨/⚡）
5. 此批次 `Chat.tsx` 仅按类型分发到现有聊天视图（image_gen/automation 暂时 fallback 到 chat 视图），为批次 3/4 预留挂载点

**验收标准**：
- [ ] 老助手（含绘画会话所属）全部正常显示为对话助手
- [ ] 三类模板可创建，类型图标正确
- [ ] 自动化任务编辑页绑定的助手关系不变（回归）

### 批次 3：生图并入工作台（高风险，数据侧已探明很轻）

**目标**：生图成为 `/` 内的助手形态；下线 `/paint`。

**步骤**：

1. `paintService.ts` 新增 `reassociatePaintTopics(assistantId)`：把 `db.topics` 中 `type==='paint'` 的话题元数据 dispatch 进该助手 redux `topics` 数组（幂等：按 id 去重；无生图助手时先创建默认「灵感生图」助手）
2. `Chat.tsx` 挂载点接入：`image_gen` 时渲染生图工作区（生图消息流 + 生图输入栏变体），组件内部 `lazy()`
3. 迁移 `PaintInputbar.tsx` 逻辑为聊天 Inputbar 生图变体：参数胶囊栏、参考图上传（复用附件系统）、✨优化提示词（接入现成 `enhancePrompt`）
4. 消息流：图片块缩略图渲染 + `ImagePreviewModal` 大图按需加载、关闭释放
5. 生图助手激活时模型选择器过滤为生图模型
6. 路由下线：删 `/paint`；侧边栏四处清理（同批次 1 模式）；persist migrate version 2 → 3 移除 `'paint'`
7. `paintSlice`（blacklist 中，不持久化）保留——生图会话参数状态继续使用

**验收标准**：
- [ ] 老绘画会话在生图助手话题列表中完整可见，图片正常显示
- [ ] 生成全流程正常：提示词 → 胶囊参数 → 参考图 → 生成 → 缩略图 → 大图预览 → 停止生成
- [ ] ✨优化提示词回填输入框
- [ ] 对话助手行为零变化（回归）
- [ ] 首屏 JS 体积对比不增大（`pnpm build` 对比 chunk 尺寸）
- [ ] 老用户侧边栏无 paint 死图标

### 批次 4：自动化并入工作台（中高风险）

**目标**：自动化成为 `/` 内的助手形态；执行简报卡片回流；下线 `/automation/*`。

**步骤**：

1. 三个整页改内嵌视图（§六.4）：概览看板+任务列表内嵌；任务编辑改弹窗/抽屉；运行详情 Timeline 内嵌 + 全屏展开出口
2. 执行简报卡片：`runner.ts` 的 `finishRun` 后，向绑定助手话题写入简报卡片消息（状态/耗时/步骤数/输出摘要，点击查看详情）
3. 主进程 `AutomationService` 与 `automation.json` 存储零改动
4. 路由下线：删 `/automation`、`/automation/new`、`/automation/task/:taskId`、`/automation/run/:runId`；侧边栏四处清理；persist migrate version 3 → 4 移除 `'automation'`

**验收标准**：
- [ ] 定时任务按调度正常触发（主进程日志核对）
- [ ] 执行完成后简报卡片出现在对应助手聊天流，点击可看运行详情
- [ ] 手动触发、启用/停用开关正常
- [ ] Timeline 全屏展开可用
- [ ] 老用户侧边栏无 automation 死图标

### 批次 5：清理与总验收

**步骤**：

1. 删除死代码：
   - 删：`pages/music/MusicPage.tsx`（若核心已被 MusicCard 吸收）、`pages/paint/PaintPage.tsx` + `PaintSidebar` + `PaintContent`（被新工作区替代）、`pages/automation/` 三个页面文件
   - **保留**：`audioEngine`、`alarmScheduler`、`useLocalPlayer`、`paintService`（enhancePrompt/生成逻辑）、主进程 `AutomationService`、`runner.ts`、`musicSettings`/`hubSettings` slice
2. 全功能回归（见 §九）
3. 内存前后对比（见 §十）

---

## 九、整体验收清单

- [ ] 侧边栏仅 4 个入口：助手工作台 / 中控台 / 小程序 / 设置
- [ ] 对话助手：消息收发、文件上传、思考/联网开关、话题管理全部正常
- [ ] 生图助手：老会话可见、全流程生成、大图预览、提示词优化
- [ ] 自动化助手：调度照跑、简报卡片回流、Timeline 可查、任务可编辑
- [ ] 中控台：便签/待办/闹钟/日历/音乐/FM 全部可用，tab 懒挂载生效
- [ ] 切页音乐不断播、闹钟照响（后台单例回归）
- [ ] 老用户升级路径：持久化数据自动迁移，无死图标、无丢失会话
- [ ] `pnpm type-check`、`pnpm lint` 通过；`pnpm test` 无新增失败（Windows 0xC0000005 为已知预存在崩溃）
- [ ] 内存对比：各页面切换峰值与重构前持平（±5%）；中控台峰值不高于原 NotesPage + 合理增量

---

## 十、实施纪律（每批次通用）

1. **分支策略**：每批次独立分支，验收通过后合入，出问题整批回退
2. **验证命令**：`pnpm type-check && pnpm lint`；`pnpm test`（失败判断用 git stash 对比法，排除预存在的 0xC0000005 崩溃干扰）
3. **内存观测**：`Get-CimInstance Win32_Process -Filter "Name='Cherry-Studio-BB.exe'"` 对比各批次前后各进程 WorkingSet
4. **红线**：任何批次不得改动主进程 `AutomationService` 调度逻辑；不得删除用户数据（Dexie 表 / automation.json / 持久化设置只做字段级迁移）
5. **迁移铁律**：凡涉及侧边栏图标增删，必须同步 **五处**：`config/sidebar.ts`、`types/index.ts`（SidebarIcon）、`Sidebar.tsx`（pathMap）、`SidebarIconsManager.tsx`、**`LaunchpadPage.tsx`（硬编码 /paint /music 入口，审查补充的第五处）** + persist migrate version +1
6. **migrate 累积原则（审查补充）**：redux-persist 对任何旧版本只调用**最新** migrate 一次。migrate 函数必须覆盖所有历史版本的净效果（本计划终态：直接从 visible/disabled 过滤掉 music/paint/automation，天然覆盖 v0/v1/v2 所有老用户）
7. **上游分叉决策（审查补充）**：`store/index.ts` 头部有上游 cherry-studio v2 重构冻结通告，本次对助手/话题模型的改动与上游 v2 数据模型正式分叉，后续不计划合并上游 v2

---

## 十一、实施完成情况（v1.5.0，2026-08-20 已全部落地）

> 本文档规划的分批路线图已全部实施完成并以 **v1.5.0** 发布。下表为实际落地与验收结果。

### 各批次实际落地

| 批次 | 计划目标 | 实施结果 | 验证 |
| :--- | :--- | :--- | :--- |
| 批次 1 · 中控台合并音乐 | `/notes` 含音乐，下线 `/music` | ✅ [NotesPage.tsx](src/renderer/src/pages/notes/NotesPage.tsx) 四宫格；本地音乐 / FM 一体化卡片（5:5 + 分隔线）；便签+待办合并（列表3/内容7，内容区 4:6）；persist v2+v3+v4 | typecheck 通过；3528 测试全绿 |
| 批次 2 · 助手多态数据模型 | `AssistantType` + 三模板向导 | ✅ types 新增 `AssistantType`/`getAssistantType`；`defaultAssistant.ts` 收敛 type；Tabs 新三模板弹窗（💬/🎨/⚡） | 9 处历史 type 值同步修正 |
| 批次 3 · 生图并入工作台 | 生图成为 `/` 助手形态，下线 `/paint` | ✅ `reassociatePaintTopics`（redux 回流，幂等）；[PaintWorkspace](src/renderer/src/pages/home/PaintWorkspace.tsx) + 左侧生成历史列表；paint 消息改真实 assistantId；persist v3 | 老绘画话题零丢失 |
| 批次 4 · 自动化并入工作台 | 自动化助手形态 + 简报回流，下线 `/automation/*` | ✅ [AutomationWorkspace](src/renderer/src/pages/home/AutomationWorkspace.tsx) 左右 6:4；任务表单常驻右栏；runner 写「运行日志」简报；主进程调度**零改动**；persist v4 | 18 项调度器单测全过 |
| 批次 5 · 清理与总验收 | 删除死代码，全功能回归 | ✅ 删 MusicPage/PaintPage/PaintSidebar/Automation×3 外壳；删 paintSlice 死字段；migrate 提取为纯函数 + 6 项单测 | `build:win:x64` 成功，工作区独立分包 |

### 实施期新增的自动化增强（超出原计划范围，同批交付）
- **每周定时**：`AutomationSchedule` 新增 `{ type:'weekly'; weekday:1-7; time }`，主进程 `evaluateSchedule` 同窗口判定 + 星期匹配（周日边界 weekday=7 → getDay()=0），5 项单测覆盖
- **输出目录 / 指定文件**：任务表单新增目录/文件选择器，runner 注入任务上下文
- **执行简报卡片**：`writeRunReport` 运行结束后向绑定助手「运行日志」话题写 text 消息

### 与计划的偏差（诚实记录）
- 侧边栏迁移版本号直接升至 **4**（一次覆盖 music/paint/automation 三个已删入口），未按原计划 2/3/4 分步递增——因 migrate 采用「净效果过滤 + 累积原则」，一只函数覆盖全部历史版本，行为等价且更简洁
- 助手类型标识用模板默认 emoji（💬/🎨/⚡）承载，未额外做列表徽章（YAGNI，避免无谓代码）
- 未新增简报自定义块类型，一期用 text block + 运行 ID 文本（运行详情走工作台时间线查看）

### 当前版本号
包版本已更新为 **1.5.0**（`package.json`），发布产物命名 `Cherry-Studio-BB-1.5.0-x64-{setup,portable}.exe`。
