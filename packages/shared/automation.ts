/** AI 自动化（定时 AI 任务）共享类型 —— 主进程 / 渲染进程 / preload 三端共用 */

/** 定时方式：一次性 / 固定间隔 / 每天固定时间 / 每周固定时间（可多选星期） */
export type AutomationSchedule =
  | { type: 'once'; at: number }
  | { type: 'interval'; everyMinutes: number }
  | { type: 'daily'; time: string }
  | { type: 'weekly'; weekdays: number[]; time: string }

/** weekly 的 weekday 取值：1=周一 … 7=周日 */
export const WEEKDAY_MIN = 1
export const WEEKDAY_MAX = 7

/** weekday(1-7, 周一为首) → JS Date.getDay()（0=周日…6=周六） */
export function weekdayToJsDay(weekday: number): number {
  return weekday % 7
}

/** JS Date.getDay()（0=周日…6=周六）→ weekday(1-7, 周一为首） */
export function jsDayToWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 系统工具授权项（按任务勾选） */
export type AutomationSystemToolId =
  | 'file_read'
  | 'file_write'
  | 'file_list'
  | 'notify'
  | 'open_path'
  | 'open_url'
  | 'shutdown'
  | 'restart'
  | 'lock'

/** 模型快照（结构兼容渲染进程 Model 类型；主进程只透传不读取内部字段） */
export type AutomationModel = {
  id: string
  provider: string
  name: string
  group: string
  [key: string]: unknown
}

export interface AutomationTask {
  id: string
  name: string
  /** 任务归属的工作台助手（运行简报写入其「运行日志」话题；不决定执行模型）。老数据兼容字段 */
  assistantId?: string
  /** 执行模型快照；老任务为空时运行期回退到 assistantId 绑定助手的模型 */
  model?: AutomationModel
  /** 自定义提示词（选填：作为系统提示词，留空用默认） */
  prompt?: string
  /** 自然语言指令 */
  instruction: string
  schedule: AutomationSchedule
  enabled: boolean
  /** 已授权的系统工具 */
  systemTools: AutomationSystemToolId[]
  /** 是否允许使用 MCP 工具 */
  useMcpTools: boolean
  /** 允许使用的 MCP 服务器 id（仅 useMcpTools 时生效）；老任务为空时回退助手配置 */
  mcpServerIds?: string[]
  /** 运行结束后是否发送通知 */
  notifyOnComplete: boolean
  /** 输出目录：AI 生成文档的默认保存位置（注入任务上下文，需勾选 file_write） */
  workDir?: string
  /** 指定文件：任务要读取/修改的本地文件（注入任务上下文，需勾选 file_read/file_write） */
  linkedFiles?: string[]
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
  type: 'text' | 'notice' | 'tool_call' | 'tool_result' | 'error'
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
  /** AI 最终输出 */
  output?: string
  /** 失败原因 */
  error?: string
  /** skipped/timeout 附带说明 */
  note?: string
}

export interface AutomationSysFileResult {
  ok: boolean
  content?: string
  error?: string
}

export interface AutomationSysFileListResult {
  ok: boolean
  entries?: { name: string; isDir: boolean }[]
  error?: string
}

export interface AutomationSysPowerResult {
  ok: boolean
  message?: string
  error?: string
}
