# AI 自动化（定时 AI 任务）设计文档

日期：2026-08-20
状态：已确认（用户已批准方案方向）
> 修订（2026-08-20 · v1.5.1）：任务执行配置由「绑定助手」改为「任务自包含」，详见文末《§11 改动记录 v1.5.1》。

## 1. 功能定位

新增「自动化」模块：让软件中已配置的 AI 助手按时间表自动执行任务。任务可调用：

- 软件中该助手已配置的 MCP 工具（自动批准的）
- 内置系统工具：文件读写/列表、系统通知、打开程序/网页、关机/重启/锁屏

全程留有运行记录（每步 AI 输出、工具调用、工具结果），事后可回看。

**明确不做（第一版）**：命令行执行、可视化工作流、事件触发、cron 表达式、跨重启补跑、运行中人工审批。

## 2. 核心决策

| 决策 | 内容 | 理由 |
|---|---|---|
| 任务绑定助手 | 任务选择一个已有助手（含模型+提示词+MCP 配置） | 复用现有助手体系，界面只需两个选择 |
| 调度在主进程 | AutomationService 用 setInterval(30s) 检查到期任务 | 主窗口关闭/托盘隐藏时任务照常触发 |
| 任务存主进程 JSON | `userData/automation.json`（tasks + runs），防抖写盘（500ms） | 调度不依赖渲染进程；参考 FileStorage 模式 |
| AI 执行在渲染进程 | 复用 AiProvider + buildStreamTextParams + AI SDK 工具循环 | 现有引擎成熟；主窗口隐藏时渲染进程仍存活，IPC 可达 |
| 系统工具分两侧实现 | 文件/电源在主进程（新 IPC）；通知/打开复用现有渲染进程 API | 通知走渲染进程才能被通知设置开关拦截 |
| 错过即跳过 | 补触发窗口 90 秒（复用闹钟思想），窗口外标记「已跳过」，一次性任务自动停用 | 用户已选定；行为可预期 |
| 手动「立即运行」不消耗调度状态 | 手动触发不更新 lastRunAt/lastTriggerKey/启用状态 | 一次性任务试跑后仍会按计划触发；间隔节拍不被重置 |

## 3. 数据模型（packages/shared/automation.ts）

```typescript
export type AutomationSchedule =
  | { type: 'once'; at: number }                    // 一次性（时间戳），触发后自动停用
  | { type: 'interval'; everyMinutes: number }      // 固定间隔
  | { type: 'daily'; time: string }                 // 每天 HH:mm

export type AutomationSystemToolId =
  | 'file_read' | 'file_write' | 'file_list'        // 文件组
  | 'notify' | 'open_path' | 'open_url'             // 通知与打开组
  | 'shutdown' | 'restart' | 'lock'                 // 电源组（高危）

export interface AutomationTask {
  id: string
  name: string
  assistantId: string
  instruction: string                    // 自然语言指令
  schedule: AutomationSchedule
  enabled: boolean
  systemTools: AutomationSystemToolId[]  // 已授权的系统工具
  useMcpTools: boolean                   // 是否允许使用助手已配置的 MCP 工具
  notifyOnComplete: boolean              // 运行结束后是否通知
  createdAt: number
  updatedAt: number
  // —— 以下由主进程调度器维护 ——
  lastRunAt?: number
  /** daily 任务当日去重键（YYYY-MM-DD），兼作「当天已跳过」标记 */
  lastTriggerKey?: string
}

export type AutomationRunStatus = 'running' | 'success' | 'failed' | 'timeout' | 'skipped'

export interface AutomationRunStep {
  time: number
  type: 'text' | 'tool_call' | 'tool_result' | 'error'
  content: string
}

export interface AutomationRun {
  id: string
  taskId: string
  taskName: string
  status: AutomationRunStatus
  startedAt: number
  finishedAt?: number
  steps: AutomationRunStep[]
  output?: string        // AI 最终输出
  error?: string         // 失败原因
  /** skipped/timeout 的说明 */
  note?: string
}
```

运行历史保留最近 200 条，超出自动裁剪最旧记录。

## 4. IPC 通道（IpcChannel.ts 新增）

```
automation:get-tasks       → AutomationTask[]
automation:save-task       (task) → AutomationTask          // 新建或更新
automation:delete-task     (taskId) → void
automation:run-task        (taskId) → AutomationRun | null  // 立即运行
automation:get-runs        (limit?) → AutomationRun[]       // 列表（含 steps 摘要，详情单独取）
automation:get-run         (runId) → AutomationRun | null
automation:trigger-run     main→renderer { task, runId }    // 执行指令
automation:update-run      renderer→main (runId, step)      // 追加运行步骤
automation:finish-run      renderer→main (runId, result)    // 结束运行
automation:tasks-changed   main→renderer                    // 数据变化通知（UI 重新拉取）
automation:sys-file-read   (path) → { ok, content?|error }  // 最多读 1MB utf8
automation:sys-file-write  (path, content) → { ok, bytes|error }
automation:sys-file-list   (path) → { ok, entries: {name,isDir}[]|error }  // 最多 500 项
automation:sys-power       (action: 'shutdown'|'restart'|'lock') → { ok, message|error }
```

## 5. 主进程 AutomationService（src/main/services/AutomationService.ts）

### 5.1 存储

- `userData/automation.json`：`{ tasks: AutomationTask[], runs: AutomationRun[] }`
- 启动时读取（不存在则空初始化）；每次变更后防抖写盘（500ms）
- runs 超 200 条裁剪

### 5.2 调度器

`setInterval(30s)` 每跳检查所有 enabled 任务：

| 调度类型 | 到期判定 | 触发后 |
|---|---|---|
| once | `at <= now <= at+90s` 且从未运行 | lastRunAt=now，任务 enabled=false |
| once（错过） | `now > at+90s` 且从未运行 | 记 skipped 运行，enabled=false |
| daily | 当天时间在 `[t, t+90s]` 窗口内且 lastTriggerKey ≠ 今天 | lastTriggerKey=今天，lastRunAt=now |
| daily（错过） | 启动/每跳发现当天窗口已完全过去且未触发 | 记 skipped 运行，lastTriggerKey=今天（防重复记） |
| interval | `now >= lastRunAt + everyMinutes` | lastRunAt=now（保持节拍；落后多个周期只跑一次） |

**触发流程**：

1. 全局并发 ≥ 2 → 本次不标记触发，下跳重试（90 秒窗口内会补上）
2. 创建 run（status=running），写盘，广播 tasks-changed
3. `mainWindow.webContents.send(Automation_TriggerRun, { task, runId })`
4. 启动 10 分钟看门狗：到时仍 running → 标记 timeout（渲染进程同款超时，双保险）

**主窗口不可用**（销毁，极罕见）：run 直接记 failed（note: '窗口不可用'）。

### 5.3 finishRun 处理

- run 已非 running（如已 timeout）→ 忽略并记日志
- 写入 status/finishedAt/output/error，更新任务，once 已在触发时停用
- 广播 tasks-changed

### 5.4 系统工具实现

- `sys-file-read`：fs.promises.readFile utf8，截断 1MB
- `sys-file-write`：递归建目录后写文件
- `sys-file-list`：readdir withFileTypes，最多 500 项
- `sys-power`（Windows 专用，项目只支持 Win x64）：
  - shutdown → `shutdown /s /t 60`（60 秒宽限，用户可 `shutdown /a` 取消）
  - restart → `shutdown /r /t 60`
  - lock → `rundll32.exe user32.dll,LockWorkStation`（立即）

## 6. 渲染进程执行链路

### 6.1 执行器（src/renderer/src/automation/runner.ts）

```
executeAutomationTask(task, runId):
  1. 从 Redux 取助手（assistantId）；无助手或无模型 → finishRun(failed)
  2. 组装工具集：
     - task.useMcpTools → fetchMcpTools(assistant)（已遵循助手 MCP 配置），
       全部转 AI SDK 工具（自动化=用户任务级授权，全部自动批准，
       allowedTools 传全量 id 避免弹确认框阻塞无人值守运行）
     - task.systemTools → buildSystemTools()（见 6.2）
  3. AbortController + 10 分钟 setTimeout 超时
  4. params: {
       system: replacePromptVariables(assistant.prompt) + 自动化上下文块（当前时间、无人值守规则）,
       messages: [{ role: 'user', content: task.instruction }],
       tools, stopWhen: stepCountIs(25), abortSignal,
       onStepFinish: 每步 toolCall/toolResult/text → updateRun(runId, step)
     }
  5. new AiProvider(model, providerWithRotatedKey).completions(modelId, params, {...最小中间件配置})
  6. 成功 → finishRun(success, output)；异常 → finishRun(failed/timeout)
  7. task.notifyOnComplete → NotificationService.send({ source: 'automation', ... })（受设置开关拦截）
```

复用：`fetchMcpTools`、`convertMcpToolsToAiSdkTools`、`getProviderByModel`、`getRotatedApiKey`、`replacePromptVariables`、`AiProvider`、`stepCountIs`。

### 6.2 系统工具（src/renderer/src/automation/systemTools.ts）

用 AI SDK `tool()` + zod schema 构建，只导出任务已授权的工具：

| 工具 | 参数 | 实现 |
|---|---|---|
| file_read | path | window.api.automation.sysFileRead |
| file_write | path, content | window.api.automation.sysFileWrite |
| file_list | path | window.api.automation.sysFileList |
| notify | title, message | 渲染进程 NotificationService（受通知设置开关控制） |
| open_path | path | window.api.openPath（打开文件/程序） |
| open_url | url | window.api.shell.openExternal |
| shutdown/restart/lock | reason? | window.api.automation.sysPower |

工具描述用中文写明效果；shutdown/restart 描述注明 60 秒宽限与取消方式。

### 6.3 监听注册

App 顶层 hook（useAutomationRunner）：useEffect 注册 `window.api.automation.onTriggerRun` 监听 → 调 runner，cleanup 移除监听。运行中任务集合防重入。

## 7. UI

### 7.1 侧边栏与路由

- `SidebarIcon` 类型 + `DEFAULT_SIDEBAR_ICONS` + Sidebar.tsx iconMap/pathMap + i18n label 新增 `automation`（图标：lucide `Bot`，路径 `/automation`）
- 渲染顺序：现有逻辑把 assistants 固定在底部，新图标追加在 visible 列表末尾 = 恰好位于聊天图标正上方（用户要求）
- 老用户数据迁移：redux-persist version 0→1，visible 数组末尾补 'automation'（若缺失）
- 路由（懒加载）：`/automation`（列表）、`/automation/new`、`/automation/task/:taskId`（编辑）、`/automation/run/:runId`（运行详情）
- 设置 → 显示 → 侧边栏图标管理同步支持新图标

### 7.2 列表页 AutomationPage

- 顶部：标题 + 「新建任务」按钮
- 统计条：今日运行 / 成功 / 失败 / 下次运行时间（学 n8n 概览）
- Tab：任务 | 运行历史
- 任务卡片：名称、调度描述（"每天 08:00"）、助手名、上次状态徽章、下次运行、启用 Switch、菜单（立即运行/编辑/复制/删除）
- 运行历史行：任务名、状态徽章、开始时间、耗时，点击进详情
- 数据全部经 IPC 拉取，监听 tasks-changed 刷新

### 7.3 编辑页 AutomationTaskEditPage

分区表单（antd）：
1. 基本信息：任务名、选择助手（Select，显示模型）、指令（TextArea）
2. 时间表：类型单选（一次性 DatePicker / 固定间隔 数字 / 每天固定时间 TimePicker）
3. 工具与权限：MCP 工具开关（说明：使用助手已配置且自动批准的 MCP 工具）、系统工具三组 Checkbox（文件组 / 通知与打开组 / 电源组——电源组带醒目红色警示文案）
4. 完成通知 Switch

### 7.4 运行详情页 AutomationRunDetailPage

- 头部：状态徽章、任务名、开始时间、耗时
- 时间线（antd Timeline）：每步 text/tool_call/tool_result/error，工具调用高亮
- 最终输出文本块

### 7.5 通知设置

- `NotificationSource` 增加 `'automation'`
- settings.notification 增加 `automation: boolean`（默认 true）
- 常规设置 → 通知设置 → 新增「自动化」开关行

## 8. 安全防线汇总

| 层 | 措施 |
|---|---|
| 授权 | 系统工具按任务勾选；MCP 工具按任务开关；未授权工具不进入工具集（AI 根本看不到） |
| 步数 | stopWhen: stepCountIs(25)，单次最多 25 步 |
| 超时 | 渲染进程 AbortSignal 10 分钟 + 主进程看门狗 10 分钟 |
| 并发 | 全局同时最多 2 个运行 |
| 审计 | 每步 tool_call/tool_result/text/error 落 run 记录，UI 可回看 |
| 通知 | 完成通知受设置开关控制 |

已知残留风险（已向用户披露）：写文件不限制目录；电源操作无运行时二次确认；提示注入可诱导 AI 调用已授权工具。防线 = 最小授权 + 审计 + 步数/超时兜底。

## 9. 文件改动清单

**新增**
- `packages/shared/automation.ts` — 类型
- `src/main/services/AutomationService.ts` — 存储+调度+系统工具
- `src/renderer/src/automation/runner.ts` — AI 执行器
- `src/renderer/src/automation/systemTools.ts` — 系统工具定义
- `src/renderer/src/automation/useAutomationRunner.ts` — 顶层监听 hook
- `src/renderer/src/pages/automation/AutomationPage.tsx` — 列表页
- `src/renderer/src/pages/automation/AutomationTaskEditPage.tsx` — 编辑页
- `src/renderer/src/pages/automation/AutomationRunDetailPage.tsx` — 运行详情页

**修改**
- `packages/shared/IpcChannel.ts` — 新增 automation:* 通道
- `src/main/ipc.ts` — 注册 IPC
- `src/main/index.ts` — 启动 AutomationService
- `src/preload/index.ts` — automation API 组 + onTriggerRun/onTasksChanged
- window.api 类型声明文件 — automation 组类型
- `src/renderer/src/types/index.ts` — SidebarIcon 增加 'automation'
- `src/renderer/src/config/sidebar.ts` — 默认图标
- `src/renderer/src/components/app/Sidebar.tsx` — iconMap/pathMap
- `src/renderer/src/pages/settings/DisplaySettings/SidebarIconsManager.tsx` — 图标
- `src/renderer/src/i18n/label.ts` — 标签
- `src/renderer/src/Router.tsx` — 路由
- `src/renderer/src/store/index.ts` — persist 迁移 0→1
- `src/renderer/src/store/settings.ts` — notification.automation
- `src/renderer/src/types/notification.ts` — NotificationSource
- `src/renderer/src/pages/settings/GeneralSettings.tsx` — 通知开关行
- `src/renderer/src/App.tsx` — 挂 useAutomationRunner

## 10. 验证方式

1. `pnpm typecheck` 全量类型检查
2. `pnpm lint` 无新增错误
3. `pnpm test` 现有 3500+ 用例不回归
4. 构建通过
5. 手工冒烟（用户执行）：新建任务（每天 1 分钟后）→ 触发 → 查看运行详情步骤 → 通知开关生效 → 关闭主窗口（托盘）任务仍触发

## 11. 改动记录 v1.5.1（2026-08-20）

本轮将**任务执行配置从「绑定助手」改为「任务自包含」**，并加了一处设置页入口。背景：原「执行助手」把模型+提示词+MCP 打包在一起，MCP 开关只控制「用不用」、却决定不了「用哪些」（由助手决定），语义分裂；任务还依赖一个可能被删除的助手。

### 11.1 执行配置自包含

任务自身直接保存执行所需的一切，不再强依赖某个助手：

| 字段 | 说明 |
|---|---|
| `model` | 执行的模型快照（结构兼容渲染进程 Model）。运行时按快照的 provider id 定位服务商，模型/服务商被删则明确报错，不再静默乱跑。 |
| `prompt` | 选填自定义提示词（作为系统提示词，留空用默认）。 |
| `mcpServerIds` | 任务级勾选的 MCP 服务器 id（仅当 `useMcpTools` 时生效）。 |
| `weekdays` | weekly 调度由单值 `weekday` 改为数组，支持一次多选星期（如每周一/三/五）。 |

- 表单把「执行助手」下拉换成「AI 模型」下拉（复用聊天页 ModelSelector 组件，按服务商分组），新增「自定义提示词」多行框。
- MCP 开关保留；打开后出现多选框，**默认空选**（须至少选一个），未启用的服务器置灰标注（届时运行跳过并记一条 `notice` 黄色提示）。
- weekly 调度的星期改为多选（antd Select `mode="multiple"`），列表展示形如「每周一/三/五 08:00」。

### 11.2 旧数据自动迁移（无需用户操作）

- 主进程加载 `automation.json` 时调用 `normalizeTaskSchedules()`：把旧的 `weekly.weekday` 单选转成 `weekdays` 数组（幂等）。
- 运行期对无 `model` 的老任务：回退取 `assistantId` 绑定助手的模型/提示词/MCP 配置（沿用原助手设置），保证旧任务照常执行；编辑保存一次后即转为新格式。
- schema 兼容：`assistantId` 降级为可选，仅作「运行简报归属的工作台助手/话题」用途，不再决定执行模型。

### 11.3 运行时间线新增 `notice` 类型

`AutomationRunStep.type` 增加 `'notice'`（黄色「提示」），用于记录「勾选的 MCP 服务器未启用/已删除 → 跳过」，避免无声失效。

### 11.4 边界修复（本次审查中发现并修复）

- 模型有效性校验不再依赖 `provider.models[]` 里不一定存在的 `provider` 字段，改为按快照的 provider id 从 store 定位服务商再校验模型 id。
- 表单加载 effect 此前依赖 `assistants` 数组（任何对话变动都会触发）→ 会反复重置/覆盖用户未保存的编辑；改为 `getAssistantById` 直读 store（不订阅）并修正 deps。
- 老任务（auto 模式）MCP 回显会带入虚拟 Hub 服务器 id，保存后运行必报「未启用」→ 回显时过滤掉非设置面板内的服务器 id。

### 11.5 设置页「关注」

常规设置 → 开发者模式下方新增「关注」分组：显示软件名 `cherry-studio-BB` + 当前版本号（`window.api.getAppInfo().version` 实时读取），右侧「发布地址」按钮把 `https://github.com/HaiSeaman/cherry-studio-BB` 复制到剪贴板并 toast 提示。

### 11.6 测试与验证

- `AutomationService.test.ts` 由 21 → 28 例：新增 weekly 多选星期命中/未命中/空数组、`normalizeTaskSchedules` 归一化（单选→数组、幂等、非 weekly 不变、缺失 weekday）。
- 全量验证通过：`pnpm typecheck`（node/web/aicore）、eslint/oxlint、28 个 AutomationService 测试全绿。
