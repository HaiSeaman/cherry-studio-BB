import { loggerService } from '@logger'
import { NotificationService } from '@renderer/services/NotificationService'

// 存储每个工具的确认Promise的resolve函数
const toolConfirmResolvers = new Map<string, (value: boolean) => void>()
// 存储每个工具的abort监听器清理函数
const abortListeners = new Map<string, () => void>()

// 订阅机制：当 pending 状态变化时通知组件
type ToolPendingListener = (toolId: string) => void
const pendingListeners = new Set<ToolPendingListener>()

export function onToolPendingChange(listener: ToolPendingListener): () => void {
  pendingListeners.add(listener)
  return () => pendingListeners.delete(listener)
}

function notifyPendingChange(toolId: string) {
  pendingListeners.forEach((listener) => listener(toolId))
}

const logger = loggerService.withContext('Utils:UserConfirmation')

export function requestToolConfirmation(toolId: string, abortSignal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) {
      resolve(false)
      return
    }

    toolConfirmResolvers.set(toolId, resolve)
    notifyPendingChange(toolId)

    if (abortSignal) {
      const abortListener = () => {
        const resolver = toolConfirmResolvers.get(toolId)
        if (resolver) {
          resolver(false)
          cleanupTool(toolId)
        }
      }

      abortSignal.addEventListener('abort', abortListener)

      // 存储清理函数
      const cleanup = () => {
        abortSignal.removeEventListener('abort', abortListener)
        abortListeners.delete(toolId)
      }
      abortListeners.set(toolId, cleanup)
    }
  })
}

function cleanupTool(toolId: string) {
  toolConfirmResolvers.delete(toolId)
  toolIdToNameMap.delete(toolId)

  const cleanup = abortListeners.get(toolId)
  if (cleanup) {
    cleanup()
  }
}

export function confirmToolAction(toolId: string) {
  const resolve = toolConfirmResolvers.get(toolId)
  if (resolve) {
    resolve(true)
    cleanupTool(toolId)
  } else {
    logger.warn(`No resolver found for tool: ${toolId}`)
  }
}

export function cancelToolAction(toolId: string) {
  const resolve = toolConfirmResolvers.get(toolId)
  if (resolve) {
    resolve(false)
    cleanupTool(toolId)
  } else {
    logger.warn(`No resolver found for tool: ${toolId}`)
  }
}

// 获取所有待确认的工具ID
export function getPendingToolIds(): string[] {
  return Array.from(toolConfirmResolvers.keys()).filter((id) => id !== '_global')
}

// 检查某个工具是否在等待确认
export function isToolPending(toolId: string): boolean {
  return toolConfirmResolvers.has(toolId)
}

const toolIdToNameMap = new Map<string, string>()

export function setToolIdToNameMapping(toolId: string, toolName: string): void {
  toolIdToNameMap.set(toolId, toolName)
}

export function clearToolIdToNameMappings(): void {
  toolIdToNameMap.clear()
}

// Debounced notification for tool approval requests.
// Batches rapid-fire tool approval requests into a single notification.
const NOTIFICATION_DEBOUNCE_MS = 500
let pendingNotificationTools: string[] = []
let notificationTimer: ReturnType<typeof setTimeout> | null = null

function flushToolApprovalNotification() {
  notificationTimer = null
  const tools = pendingNotificationTools
  pendingNotificationTools = []

  if (tools.length === 0) return

  const message = `工具 "${tools.join('、')}" 需要审批`

  void NotificationService.getInstance().send({
    id: crypto.randomUUID(),
    type: 'action',
    title: '助手响应',
    message,
    timestamp: Date.now(),
    channel: 'system',
    source: 'assistant'
  })
}

export function sendToolApprovalNotification(toolName: string): void {
  pendingNotificationTools.push(toolName)
  if (notificationTimer) clearTimeout(notificationTimer)
  notificationTimer = setTimeout(flushToolApprovalNotification, NOTIFICATION_DEBOUNCE_MS)
}

export function confirmSameNameTools(confirmedToolName: string): void {
  const toolIdsToConfirm: string[] = []

  for (const [toolId, toolName] of toolIdToNameMap.entries()) {
    if (toolName === confirmedToolName && toolConfirmResolvers.has(toolId)) {
      toolIdsToConfirm.push(toolId)
    }
  }

  toolIdsToConfirm.forEach((toolId) => {
    confirmToolAction(toolId)
  })
}
