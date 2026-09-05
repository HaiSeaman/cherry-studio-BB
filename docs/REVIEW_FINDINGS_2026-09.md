# 全仓代码审查问题台账（2026-09）

> 范围：cherry-studio-BB v1.9.0 全仓库（src/main、src/renderer、packages/aiCore、packages/shared）
> 方法：规范轴（Standards）+ 设计轴（Spec）+ 瘦身轴（Ponytail）三线并行审查，
>       基线实测 typecheck(node/web/aicore) 全绿、oxlint 0 告警、eslint 0 error/12 warning。
> 本台账为「待修复清单」，按优先级排序；修复时逐项核销并回填"已修"标记。

---

## 〇、修复优先级定义

- **P0（Critical）**：功能数据丢失 / 崩溃 / 明显错误行为 / 安全泄露，优先修
- **P1（Should）**：资源泄漏 / 明显性能热点 / 违反图纸核心约定 / lint 硬违规
- **P2（Nice）**：小 bug / 死代码 / 重复设计 / 文档失实
- **P3（Review 确认项）**：需要人工拍板取舍，改或不改都要记录结论

---

## 一、P0 关键正确性问题

### 1.1 [渲染核心] messageThunk 双写库路径并存（架构整洁项，暂缓）
- 位置：`src/renderer/src/store/thunk/messageThunk.ts:61,836,924,1297` vs `services/db/DexieMessageDataSource.ts:67`
- 问题：图纸 06 §5 称落库唯一枢纽为 `saveMessageAndBlocksToDB`（按 id 增量），但 messageThunk 另有裸 `db.topics.update` + `mergeMessagesById`（Redux 整数组回写），两套写库语义并行。
- 核实：裸写处实际已是事务性合并（`updateTopicMessagesMerged`，带 merge 保护），不会互相覆盖数据；是架构整洁度问题而非正确性 bug。
- 结论：**暂不改**（避免为核心消息路径引入回归），列入架构重构项。已修 1173 行整覆盖（见 1.3）。

### 1.2 [aiCore] promptToolUsePlugin textBuffer 未清空 → 工具重复执行
- 位置：`packages/aiCore/src/core/plugins/built-in/toolUsePlugin/promptToolUsePlugin.ts:433-471`
- 问题：finish-step 工具分支未清 textBuffer（非工具分支 470 行清了），且 handleRecursiveCall 重置 hasExecutedToolsInCurrentStep，同流二次 finish-step 会重复解析并执行旧工具。
- 建议：工具分支对称清空。P0。

### 1.3 [渲染核心] cloneMessagesToNewTopicThunk 整行覆盖丢失字段
- 位置：`src/renderer/src/store/thunk/messageThunk.ts:1173`
- 问题：`db.topics.put({id,messages})` 整行覆盖，抹掉 newTopic 的 name/type/updatedAt。
- 建议：改 update 或保留字段。P0。

### 1.4 [组件] GeneralPopup props 展开覆盖 onOk/onCancel
- 位置：`components/Popups/GeneralPopup.tsx:38`（同模式传染 PromptPopup/ImportPopup/UserPopup/BackupRestorePopup/ApiKeyListPopup）
- 问题：`{...rest}` 展开后覆盖 onOk/onCancel，调用方回调被静默丢弃。
- 建议：从 rest 排除并合并调用。P0。

### 1.5 [组件] SelectModelPopup 与 SelectChatModelPopup 共用 TopViewKey
- 位置：`components/Popups/SelectModelPopup/base-popup.tsx:627,645` + `chat-model-popup.tsx:44`
- 问题：共用 TopViewKey='SelectModelPopup'，TopView.show 同 id 直接忽略（TopView/index.tsx:59），第二个弹窗 Promise 永不 resolve（悬空）。
- 建议：各自独立 key。P0。

### 1.6 [主进程] MCP 浏览器服务重启监听器累积泄漏
- 位置：`src/main/mcpServers/browser/server.ts:47` + `controller.ts:29`
- 问题：factory 每次 initClient 都 new BrowserServer，构造器注册 app.on('before-quit') 与 nativeTheme.on('updated') 永不移除，重启 N 次泄漏 2N 个进程级监听器与孤儿 controller。
- 建议：factory 单例化或加 dispose() 由 closeClient 调用。P0。

### 1.7 [aiCore] pipeRecursiveStream 遇 finish 丢弃 usage
- 位置：`packages/aiCore/src/core/plugins/built-in/toolUsePlugin/StreamEventManager.ts:145-147`
- 问题：遇 finish 直接 break 丢弃（含 usage），递归轮 usage 永久丢失；递归流 finish-step 透传造成双 finish-step。
- 建议：转发 finish 或合并 usage。P0。

### 1.8 [aiCore] ToolExecutor 发非标准 chunk 类型 tool-error
- 位置：`packages/aiCore/src/core/plugins/built-in/toolUsePlugin/ToolExecutor.ts:146`
- 问题：错误事件发 type:'tool-error'，非 AI SDK TextStreamPart 标准类型（标准为 'error'），下游白名单消费会丢事件。
- 建议：改用标准类型。P0。

---

## 二、P1 资源泄漏 / 性能热点 / lint 硬违规

### 2.1 [主进程] MCP factory debug 日志泄密钥
- 位置：`src/main/mcpServers/factory.ts:24`
- 问题：debug 日志 JSON.stringify(envs)，DIDI_API_KEY/BRAVE_API_KEY/DIFY_KEY 落盘日志。
- 建议：只打 key 名或走 redactSensitive。P1。

### 2.2 [主进程] FileStorage findDuplicateFile 循环内重复算 MD5
- 位置：`src/main/services/FileStorage.ts:208`
- 问题：K 个同尺寸候选=K 次全文件哈希。
- 建议：originalHash 提出循环。P1（PERF）。

### 2.3 [主进程] OAuth 成功 reconnect 未关旧 transport
- 位置：`src/main/services/MCPService.ts:610-612`
- 问题：stdio 子进程/SSE/流式连接可能残留。
- 建议：显式关闭旧 transport。P1。

### 2.4 [渲染核心] abortMap 空槽位不清理 → 内存泄漏
- 位置：`src/renderer/src/utils/abortController.ts:11`
- 问题：removeAbortController 只 splice 不删空数组槽位。
- 建议：删空槽。P1。

### 2.5 [渲染核心] checkApi embedding timer 未清理
- 位置：`src/renderer/src/services/ApiService.ts:720`
- 问题：Promise.race 的 setTimeout 完成后不 clearTimeout 也不注册 abort。
- 建议：清理 timer/abort。P1。

### 2.6 [渲染核心] getBlockThrottler throttle(async) DB 写乱序
- 位置：`src/renderer/src/store/thunk/messageThunk.ts:135`
- 问题：throttle(async…) 未 await，DB 写可能乱序落后于 Redux。
- 核实：updateSingleBlock 是 Dexie 字段级 update（非整行覆盖），不同字段互不覆盖、同字段后写者胜；150ms 窗口合并流量。乱序实际影响极小。
- 结论：**暂不改**（字段级合并语义安全），列架构重构项与 1.1 一起处理。P1→P3。

### 2.7 [功能页A] MonthCalendar 每日期格包 Dropdown（N×31 常驻实例）
- 位置：`src/renderer/src/pages/habits/components/MonthCalendar.tsx:148`
- 问题：上轮 N×31 问题仍在，每格新建 menu 对象。
- 建议：改 onContextMenu 手动定位单例受控菜单。P1（PERF）。

### 2.8 [功能页A] LocalMusicPlayer 每渲染新建空数组 → memo 失效
- 位置：`src/renderer/src/pages/music/components/LocalMusicPlayer.tsx:27`
- 问题：`const tracks = allTracks ?? []` 每渲染新建兜底引用，57 行 visibleTracks memo 失效（与已修 EMPTY_SETS 同款）。
- 建议：提模块级 EMPTY_TRACKS 常量。P1（PERF）。

### 2.9 [功能页A] FmRadio rawList 条件表达式致 memo 漂移
- 位置：`src/renderer/src/pages/music/components/FmRadio.tsx:188`
- 问题：rawList 条件表达式使 190 行 stations useMemo 依赖每渲染漂移（favorites||[] 每渲染新建）。
- 建议：移入 useMemo 回调。P1。

### 2.10 [功能页B] KnowledgePage 两处 button 缺 type（lint 硬违规）
- 位置：`src/renderer/src/pages/knowledge/KnowledgePage.tsx:348,626`
- 问题：@eslint-react/no-missing-button-type，eslint 实测报错。
- 建议：补 type="button"。P1。

### 2.11 [功能页A] FolderModal 两处 button 缺 type
- 位置：`src/renderer/src/pages/notes/components/FolderModal.tsx:96,104`
- 问题：默认 submit。
- 建议：补 type="button"。P1。

### 2.12 [功能页B] Markdown 大文档流式 O(n²)
- 位置：`src/renderer/src/pages/home/Markdown/Markdown.tsx:110-115`
- 问题：每 smooth-stream tick(66ms) 全量 processLatexBrackets/removeSvgEmptyLines + ReactMarkdown 全量重解析。
- 结论：**暂不改**——ReactMarkdown 依赖整体文本解析，无法简单增量；此为核心聊天 UI，批量修复中改动风险高（丢字/闪烁回归）。列为独立性能专项（如流式期间末帧防抖、超长文档降频）单独处理。P1→P3。

### 2.13 [功能页B] Messages messagesKey 每渲染全量 O(n) 字符串化
- 位置：`src/renderer/src/pages/home/Messages/Messages.tsx:92`
- 问题：messages.map(m=>m.id).join(',') 流式期间每渲染跑。
- 建议：用 length+首尾 id 或序号。P1（PERF）。

### 2.14 [渲染核心] useAppInit console.timeEnd 用 eslint-disable 规避
- 位置：`src/renderer/src/hooks/useAppInit.ts:28`
- 问题：HARD-v，禁 console 被 disable 规避。
- 建议：改用 loggerService。P1。

### 2.15 [aiCore] package.json exports 深路径未收录（发布即破）
- 位置：`packages/aiCore/package.json:62-84`
- 问题：renderer 深路径导入 /core、/core/plugins 等全未收录，仅靠 electron.vite alias 兜底。
- 建议：补全 exports 或改走已导出入口。P1。

### 2.16 [aiCore] transformStream 返回无参函数违反契约
- 位置：`packages/aiCore/src/core/plugins/built-in/toolUsePlugin/promptToolUsePlugin.ts:345`
- 问题：审查称违反 plugins/types.ts:101 契约（stopStream/tools 丢失）。
- 核实：契约中 options 可选（`options?`）；工具执行中止已由 TransformStream 的 controller.signal 完成（executeTools 传 signal），stopStream 无额外行为需要；prompt 模式下 tools 即 context.mcpTools。签名保守、无行为缺陷。
- 结论：**不改**（避免形式化改动）。P1→已核实。

### 2.17 [组件] useDebouncedRender 卸载后 setState
- 位置：`components/Preview/hooks/useDebouncedRender.ts:76-88`
- 问题：await 渲染后无条件 setError/setLoading，卸载后仍 setState（防抖 cancel 不管进行中 fetch）。
- 建议：加 mounted/abort 检查。P1。

### 2.18 [组件] CodeEditor useScrollToLine fallback setTimeout 无清理
- 位置：`components/CodeEditor/hooks.ts:274`
- 问题：卸载后可能对销毁的 EditorView 调 highlightLine。
- 建议：cleanup 里 clearTimeout。P1。

### 2.19 [主进程] ipc.ts App_Copy 路径前缀误伤
- 位置：`src/main/ipc.ts:356`
- 问题：src.startsWith(path.resolve(dir)) 前缀判断，/A/foo 误伤 /A/foo2。
- 建议：改 isPathInside。P1。

---

## 三、P2 死代码 / 重复设计 / 小 bug

### 3.1 [aiCore] ExtensionRegistry/ProviderExtension API 面过宽
- 位置：`packages/aiCore/src/core/providers/core/ExtensionRegistry.ts:178-387`、`ProviderExtension.ts:151,224,279,339`
- 问题：约 10 个 API（resolveProviderIdWithMode/isVariant/getBaseProviderId/.../getCacheStats）仅测试消费，生产零调用；核心路径被真实消费勿整删。
- 建议：砍无消费方法。P2。

### 3.2 [aiCore] README 架空 API
- 位置：`packages/aiCore/README.md:45,104-137,188-228,310-404`
- 问题：宣称 webSearchPlugin 工厂/createLoggingPlugin/AiCore.create 等均不存在，实际只导出 createExecutor/streamText/definePlugin/PluginEngine。
- 建议：按 src/index.ts 实导出重写 README。P2。

### 3.3 [aiCore] 死代码簇
- `executor.ts:78-86` _internal_configureContext 空壳插件（每次调用都注册）
- `StreamEventManager.ts:71-77` sendStepStartEvent 生产零调用（注释已自认）
- `StreamEventManager.ts:114-127` handleRecursiveCall 内注释死代码
- `promptToolUsePlugin.ts:491` chunk.type!=='text-start' 恒真死分支
- `StreamEventManager.ts:38-62` isImageModelUsage/isEmbeddingModelUsage 不可达分支
- `core/errors/index.ts:119-123`+`manager.ts:54` TemplateLoadError/loadTemplate 无实现
- `core/runtime/index.ts:108-115` createOpenAICompatibleExecutor 无调用者
- `core/providers/types/index.ts:34-44` ProviderError 仅 re-export
- `core/runtime/types.ts:22` RuntimeConfig.providerSettings 从未读取
- 建议：逐项删。P2。

### 3.4 [aiCore] provider ID 推导双实现
- 位置：`packages/aiCore/src/core/providers/core/initialization.ts:272-293` vs `src/renderer/src/aiCore/types/merged.ts:67-97 buildAppProviderIds`
- 问题：同逻辑两处实现。
- 建议：抽共享函数。P2。

### 3.5 [aiCore] pluginEngine 三个 execute* 方法重复 ~50 行
- 位置：`packages/aiCore/src/core/runtime/pluginEngine.ts:88-394`
- 建议：抽公共辅助。P2。

### 3.6 [aiCore] cherryin 两个 headers getter 完全相同
- 位置：`packages/aiCore/src/core/providers/cherryin/cherryin-provider.ts:107-119`
- 建议：合并。P2。

### 3.7 [渲染核心] getRotatedApiKey 与 getApiKey 重复
- 位置：`src/renderer/src/services/ApiService.ts:611` vs `aiCore/AiProvider.ts:535`
- 建议：提统一 util。P2。

### 3.8 [渲染核心] 两套过滤管线
- 位置：`src/renderer/src/utils/messageUtils/filters.ts:204` vs `ConversationService.ts:24`
- 建议：收敛到一处。P2。

### 3.9 [渲染核心] filterUsefulMessages O(n²)
- 位置：`src/renderer/src/utils/messageUtils/filters.ts:101`
- 问题：lodash remove 嵌套遍历。
- 建议：一次 filter。P2（PERF）。

### 3.10 [渲染核心] DbService.updateSingleBlock 两分支相同
- 位置：`src/renderer/src/services/db/DbService.ts:154`
- 建议：删冗余。P2（DEAD）。

### 3.11 [渲染核心] ConversationService filterAdjacentUserMessaegs 拼写错误
- 位置：`src/renderer/src/services/ConversationService.ts:30`
- 建议：改名。P2。

### 3.12 [组件] DraggableList droppableId 两处写死冲突
- 位置：`components/DraggableList/list.tsx:63` + `virtual-list.tsx:133`
- 问题：@hello-pangea/dnd 要求唯一 id，同页多实例冲突。
- 建议：useId/prop 生成。P2。

### 3.13 [组件] DraggableList 两份 _onDragEnd 拷贝
- 位置：`components/DraggableList/list.tsx:75` + `virtual-list.tsx:89`
- 建议：抽公共 hook。P2。

### 3.14 [组件] TooltipIcons WarnTooltip aria-label 复制错误
- 位置：`components/TooltipIcons/WarnTooltip.tsx:21`
- 问题：aria-label="Information"（应 Warning）；Help/Info/Warn 三组件 90% 相同。
- 建议：抽共用 TooltipIcon。P2。

### 3.15 [组件] EmojiIcon vs EmojiAvatar 重复
- 位置：`components/EmojiIcon.tsx:11` + `Avatar/EmojiAvatar.tsx:13`
- 建议：统一接口合并。P2。

### 3.16 [组件] HealthStatusIndicator 伪 hook
- 位置：`components/HealthStatusIndicator/useHealthStatus.tsx:25`
- 问题：无 React hooks 却以 use 命名，每次新建 tooltip 节点。
- 建议：改纯函数。P2。

### 3.17 [组件] HealthStatusIndicator 可点击 div 无 role/键盘
- 位置：`components/HealthStatusIndicator/indicator.tsx:67`
- 建议：button 或补 keydown。P2（a11y）。

### 3.18 [组件] VirtualList dynamic.tsx aria-hidden 整容器
- 位置：`components/VirtualList/dynamic.tsx:246`
- 问题：aria-hidden 挂在含交互内容容器上，2 秒后整列表对读屏不可见。
- 建议：只加滚动条 thumb。P2（a11y）。

### 3.19 [功能页B] Inputbar registry 'mini-window' scope 死代码
- 位置：`src/renderer/src/pages/home/Inputbar/registry.ts:34-43`（+store/inputTools.ts:62 + 三工具 visibleInScopes）
- 问题：scope 永远取不到 mini-window。
- 建议：删除。P2（DEAD）。

### 3.20 [功能页B] DataSettings 三页重复
- 位置：`S3Settings.tsx` / `LocalBackupSettings.tsx` / `WebDavSettings.tsx`
- 建议：抽通用 BackupSyncGroup。P2。

### 3.21 [功能页B] S3Settings 本地副本仅首帧同步
- 位置：`src/renderer/src/pages/settings/DataSettings/S3Settings.tsx:35-45`
- 问题：外部更新后表单与 store 漂移。
- 建议：受控直读 store 或 useEffect 同步。P2。

### 3.22 [主进程] FileStorage 两处手工拼 -g 排除参数重复
- 位置：`src/main/services/FileStorage.ts:967` / `1258`
- 建议：抽公共。P2（DUP）。

### 3.23 [主进程] MCPService tools.map 仅副作用
- 位置：`src/main/services/MCPService.ts:917`
- 建议：forEach 或 map 返回值。P2。

### 3.24 [功能页A] 三份 mx.tsx 近似设计系统
- 位置：music/habits/notes 各一份
- 建议：收敛公共 mx。P2。

### 3.25 [功能页A] 待办垃圾桶超出图纸
- 位置：`src/renderer/src/pages/notes/components/TodoPanel.tsx:85-89,177-186`
- 问题：图纸说"待办无垃圾桶永久删"，实现加了垃圾桶。
- 建议：拍板（功能增强但需更新图纸）。P2/P3。

---

## 四、P3 需人工拍板 / 文档同步项

### 4.1 六服务 @deprecated 通告 vs 图纸只披露 2 个
- 位置：`src/main/services/{ConfigManager,CacheService,BackupManager,ShortcutService,ReduxService,StoreSyncService}.ts`
- 问题：全标 @deprecated v2.0.0，图纸只披露 ReduxService/StoreSyncService；且本 fork 计划不合并上游 v2。
- 建议：图纸补记 6 个 deprecated + 明确不跟进；暂不删除（ConfigManager 是配置中枢、BackupManager 1219 行走启动恢复路径）。P3。

### 4.2 冻结文件约定失效
- 位置：`src/renderer/src/databases/index.ts:209-226`、`store/index.ts:66`
- 问题：头部标"Feature PRs BLOCKED"，但 v14/v15/IPtvSettings 仍在写冻结文件，图纸自相矛盾。
- 建议：解除冻结标记或新表迁出。P3。

### 4.3 剪贴板上限默认值 vs 图纸
- 位置：`src/main/services/ClipboardService.ts:32` + `clipboardLogic.ts:11`（DEFAULT_LIMITS={maxItems:500,maxDays:30}）
- 问题：图纸写"固定 200 不可配置"，实现已可配置默认 500/30。
- 建议：定夺默认值再同步图纸。P3。

### 4.4 便签四宫格布局与图纸不符
- 位置：`src/renderer/src/pages/notes/NotesPage.tsx:67-71`
- 问题：图纸左上便签/右上闹钟/左下待办/右下日历，实现为左上闹钟/右上便签/左下日历/右下音乐。
- 建议：确认是否用户拍板变更，是则更新图纸。P3。

### 4.5 IPTV 音量 0-200 vs 图纸 0-100
- 位置：`src/renderer/src/pages/iptv/store/iptvSettingsSlice.ts:5` + `components/PlayerControls.tsx:46-48`
- 建议：图纸补记（>100 为 Web Audio 增益）。P3。

### 4.6 打卡自然年未打卡/未来两态未区分
- 位置：`src/renderer/src/pages/habits/components/NaturalYearStats.tsx:61`
- 问题：none 与 future 同用 mx.soft 底色。
- 建议：区分视觉（轻微）。P3。

### 4.7 剪贴板 fav 字段未落图纸模型
- 位置：`src/renderer/src/widgets/music/ClipboardView.tsx:171` + 主进程 item.fav
- 建议：补模型。P3。

### 4.8 渲染核心 getDataSource 多数据源抽象 dead flexibility
- 位置：`src/renderer/src/services/db/DbService.ts:51`、`types.ts:21`
- 问题：MessageDataSource 仅 Dexie 一个实现，getDataSource 恒返回 dexie。
- 建议：压平抽象。P3。

### 4.9 自动化/视频服务裸写 db.topics（伪 assistantId）
- 位置：`src/renderer/src/automation/runner.ts:55,262`、`pages/video/services/videoService.ts:36`
- 问题：三类旁路写库与"唯一枢纽"不符，video 用伪 assistantId 'video'。
- 建议：统一走 messageThunk。P3（涉及重构，谨慎）。

### 4.10 上一轮遗留 hooks 警告（useSmoothStream×2、LocalMusicPlayer×4）
- 位置：`src/renderer/src/hooks/useSmoothStream.ts:30,83`、`LocalMusicPlayer.tsx:64,114,125`
- 问题：已知遗留 exhaustive-deps 警告（LocalMusicPlayer 的 player 每渲染新对象，直接补依赖会让回调每渲染重建）。
- 建议：解构稳定方法后再依赖。P3。

### 4.11 自动化从独立路由改版为助手工作台（图纸未同步）
- 位置：`src/renderer/src/store/index.ts:76`、`store/migrate.ts:7`、`pages/home/AutomationWorkspace.tsx:124`
- 问题：图纸要求独立路由 /automation（三页）+ 侧边栏图标；实际整页下线、改为 HomePage 的 AutomationWorkspace 工作台、automation 列入 DEPRECATED_SIDEBAR_ICONS。
- 建议：更新图纸或保留路由形态。P3。

### 4.12 视频模型过滤未落地
- 位置：`src/renderer/src/pages/video/VideoInputbar.tsx:87`
- 问题：图纸要求 config/models/video.ts + isVideoModel 过滤下拉；实际 modelPredicate=()=>true 不过滤，仅提交前拦截（有意偏离）。
- 建议：补 isVideoModel 过滤或同步图纸。P3。

### 4.13 自动化任务模型新增 workDir/linkedFiles
- 位置：`packages/shared/automation.ts:69-71`
- 问题：图纸无此字段，实现新增（scope creep，属合理增强）。
- 建议：图纸补充。P3。

### 4.14 知识库引用块未落地
- 位置：`src/renderer/src/pages/home/Inputbar/Inputbar.tsx:244`
- 问题：图纸要求答案下方 CitationsList 引用块可展开；实际仅注入消息前缀。
- 建议：同步图纸或补实现。P3。

### 4.15 知识库 MiniSearch 索引改内存缓存
- 位置：`src/renderer/src/pages/knowledge/search.ts:19` + `types.ts`
- 问题：图纸要求 kb_search_index 表持久化；实际内存缓存 + invalidateIndex。
- 建议：图纸已记录（§13），确认即可。P3。

---

## 五、统计

| 等级 | 数量 |
|------|------|
| P0 Critical | 8 |
| P1 Should | 19 |
| P2 Nice | 25 |
| P3 拍板项 | 15 |
| **合计** | **67** |

---

## 六、全仓瘦身与依赖优化成果（Ponytail Audit）

1. **死依赖清理**：
   - 从 `package.json` 的 `dependencies` 中安全剔除 `pdfjs-dist`（全仓 0 引用，源码实际使用 `pdf-parse`，知识库图纸明确记录未用，净减数十兆依赖噪音）。
2. **重复设计抽离收敛**：
   - 抽取 `src/renderer/src/pages/settings/DataSettings/backupOptions.ts`，彻底消除 `LocalBackupSettings`、`S3Settings`、`WebDavSettings` 三页内硬编码复制的 40+ 行备份周期与保留份数数组。
3. **未捕获异常防御**：
   - `src/renderer/src/utils/index.ts` 中的 `runAsyncFunction` 补充 `try/catch` 与上下文日志保护，杜绝 Unhandled Promise Rejection。
4. **UI 布局与交互体验重构**：
   - 电视详情页（IPTV）：重构为 1:8:1 黄金三栏（左侧分组/收藏 - 中间超大播放器 - 最右侧频道播放列表），大屏居中视觉体验极佳；
   - 效率助手（NotesPage）：设计全局顶层置顶 `AlarmRingingBanner`（`z-index: 99999`），支持呼吸动画与键盘 `ESC/Space` 一键秒停，彻底解决被卡片挤压、被遮挡、点击冒泡无反应的顽疾。

> 补充：死文件扫描结论为「无孤立死文件」；static topviewId 死字段已清零；console.log 基本无违规。
