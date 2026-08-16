# 闹钟便签 Tab 页设计（BB 版）

> 2026-08-16 · 已与用户两轮确认。参照 `便签和闹钟.md`（StickyNotes-Ai 分析报告），按 Cherry Studio BB 架构重写。
> 用户核心要求：闹钟↔日历关联（日历闹钟由闹钟引擎统一调度，含音量与铃声）；日历当日待办、左上便签、左下待办三者数据完全独立；重视删除/归档按键与文件夹；不做小纸条独立窗口。

## 1. 已确认决策（两轮沟通结论）

| 决策点 | 结论 |
|---|---|
| 布局 | 2×2 四宫格（左上便签 / 右上闹钟 / 左下待办 / 右下日历），<1000px 单列滚动 |
| 闹钟数据 | 单一数据源 `hub_alarms`：定时闹钟无 date（每天可响）、日历闹钟带 date（仅当日触发）；调度/音量/7 种铃声全部由闹钟引擎统一处理 |
| 日历当日待办 | 独立存 `hub_day_notes`（按日期），不进便签列表、不进待办模块 |
| 便签↔待办 | 完全独立，各有归档；便签删除进垃圾桶（可还原/永久删），待办 ✕ = 轻确认后永久删（无垃圾桶） |
| 增强功能 | Markdown 预览（react-markdown+dompurify 已有依赖）、历史版本后悔药、一键转长图（Canvas+剪贴板）；**不做**小纸条独立窗口 |
| 响铃行为 | 系统通知 + 持续响铃直到手动停 + 若窗口在后台自动唤起到前台（新增 Window_Focus IPC） |
| UI | 晨间绿洲浅色（复用音乐页 mx 主题，re-export 扩展），固定浅色不随应用主题 |

## 2. 页面接入

照音乐页 8 处接线：`SidebarIcon` 加 `'notes'`、DEFAULT_SIDEBAR_ICONS、label「闹钟便签」、Sidebar iconMap（lucide `StickyNote`）+ pathMap `/notes`、SidebarIconsManager、Router 懒加载路由、TabContainer 图标/标题、Launchpad 卡片；Redux 迁移 v215（老用户追加 notes 图标）。

## 3. 数据架构

- **Dexie v12 新表**（databases/index.ts，全量重 declare）：
  - `hub_notes: '++id, status'`（status: active/archived/trashed；content/createdAt/updatedAt/trashedAt?/archivedAt?）
  - `hub_todos: '++id, status'`（status: active/archived；text/done/completedAt?/archivedAt?）
  - `hub_alarms: '++id'`（h/m/s/enabled/triggered/label/sound/date?/lastTriggerKey?）
  - `hub_day_notes: '++id, date'`（date: 'YYYY-MM-DD'，content）
  - `hub_activity: '&date'`（date → {note, todo} 热力图计数）
  - `hub_note_history: '++id, noteId'`（content/ts/locked；每便签未锁定最多 50 条，快照间隔 ≥60s 且内容有变化）
- **Redux persist** `hubSettings`：{ alarmVolume: 0-300 默认 100, defaultSound: 'default' }
- **主进程**：仅新增 `IpcChannel.Window_Focus`（restore/show/focus 主窗口，响铃唤起用），无文件 IO、无新依赖

## 4. 闹钟引擎（渲染层，模块单例）

- **Web Audio 纯合成**（照 §6.2 一比一移植）：AudioContext + masterGain（音量/100，>100% 增益放大；suspended 主动 resume）；`playNote` ADSR 包络（linearRamp 起音 → exponentialRamp 到 0.001）
- **7 种铃声**（周期循环 tick 调度）：default 双音叮咚 880/660 800ms / apple C5-E5-G5 琶音 900ms / android 660→440 square 700ms / nokia 五音 1800ms / crystal A6-C7 800ms / bird 三次频率滑变啁啾 700ms / electronic 1000Hz 方波×3 800ms
- **调度器**（核心抽纯函数 `computeDueAlarms(alarms, now, lastCheckDate)` 便于单测）：每秒检查；跨天重置 triggered；`a.date && a.date !== 今天` 跳过；触发窗口 = 闹钟时刻 ≤ 当前秒 ≤ +90s（补触发防休眠漏响）；`lastTriggerKey = date-h-m-s` 防同秒重复；命中 → 响铃 + `new Notification(...)` + `document.hidden` 时 `window.api.window.focus()`
- **时钟**：每秒 `HH:MM:SS` + `YYYY年M月D日` + 星期
- **倒计时**：时间戳法（防系统休眠漂移）+ 250ms tick + SVG 进度环（stroke-dashoffset）+ 开始/暂停/重置 + 标签 + 铃声选择；结束进入响铃态（红色脉冲），响铃直到手动停

## 5. 四模块

- **左上 · 便签**：列表（预览文本+创建时间+active 高亮+hover 归档📦/删除✕）+ 搜索（200ms 防抖）+ 新建（无便签自动建一条）；编辑器（500ms 防抖自动保存 + 切换时落盘）+ 工具行（历史/长图/Markdown 预览切换）；头部「归档」「垃圾桶」文件夹按钮
- **左下 · 待办**：勾选列表（未完成在前，同状态按创建倒序；圆形渐变勾选框 + 划线完成态 + hover 归档/删除）+ 添加输入框（Enter/＋）+ 计数徽标；头部「归档」文件夹按钮；✕ 轻确认后永久删
- **右上 · 闹钟**：实时时钟大字 → 子 tab（倒计时｜定时闹钟，MXTabs 胶囊）→ 定时闹钟：时/分/秒输入+添加、已设列表（排序、开关滑钮、HH:MM:SS、标签、铃声名、X秒后响铃 info、✕）、「停止响铃」红钮（响铃时脉冲）；音量滑条（0-300%）+ 默认铃声下拉
- **右下 · 日历**：365 天热力图（GitHub 风格周列×7 天，绿系 5 档 lvl-0..4：0/1/≤3/≤6/>6，未来日透明，hover title，可折叠）→ 月历 42 格（前后月灰显、今天强调、选中高亮、蓝点=当日待办、琥珀点=日历闹钟）→ 当日详情两栏：左=当日闹钟（时间+标签+铃声选择添加行、列表可删）｜右=当日待办（textarea+保存、列表可删，Ctrl+Enter 保存）

## 6. 热力图计数规则

便签编辑（每次防抖保存且内容有变化 +1）+ 待办完成（未完成→完成 +1）；日历当日待办不计入。

## 7. UI 规范

复用音乐页 `pages/music/components/mx.tsx`（`pages/notes/components/mx.tsx` re-export 并扩展），晨间绿洲浅色；响铃红色脉冲、勾选渐变、热力图绿阶、MXTabs/MXDialog/MXGhostPill 等既有组件；`prefers-reduced-motion` 降级。

## 8. 文件清单

```
packages/shared/IpcChannel.ts [改] +Window_Focus
src/main/ipc.ts [改] 注册 Window_Focus
src/preload/index.ts [改] window.focus()
src/renderer/src/{Router.tsx,types/index.ts,config/sidebar.ts,i18n/label.ts,
  components/app/Sidebar.tsx,pages/settings/.../SidebarIconsManager.tsx,
  store/migrate.ts,store/index.ts,databases/index.ts,
  components/Tab/TabContainer.tsx,pages/launchpad/LaunchpadPage.tsx} [改]
src/renderer/src/pages/notes/
  NotesPage.tsx
  components/{mx.tsx(re-export),NotesPanel,NoteEditor,NoteHistoryPanel,
    TodoPanel,AlarmPanel,CalendarPanel,FolderModal}.tsx
  hooks/{useAlarmEngine,useCountdown}.ts
  services/{alarmSounds,hubStore,exportImage,schedule}.ts
  store/hubSettingsSlice.ts
  __tests__/{schedule.test.ts,heatmap.test.ts,calendarUtils.test.ts}
```

## 9. 测试与验收

- vitest 单测：`computeDueAlarms`（date 过滤/90s 窗口/lastTriggerKey/跨天重置）、热力图档位映射、月历 42 格构建（首日星期/跨月标记）、便签/待办排序规则
- 全仓测试 + typecheck 通过；`pnpm dev` 手动回归四模块联动；最后 `npm run build:win:x64` 打包
