import { loggerService } from '@logger'
import { clipboard } from 'electron'
import { uIOhook,UiohookKey } from 'uiohook-napi'

const logger = loggerService.withContext('TextInserter')

/** 模拟 Ctrl+V 后延迟恢复剪贴板的毫秒数（等目标软件完成粘贴） */
const RESTORE_DELAY_MS = 100

/**
 * 全局打字：把识别文本落到鼠标光标处。
 * 流程：备份剪贴板 → 写入识别文本 → uiohook 模拟一次 Ctrl+V → 延迟恢复原剪贴板。
 * 不逐字模拟按键，避开与中文输入法的冲突；Ctrl+V 天然落到当前前台窗口的光标处。
 */
export function insertTextAtCursor(text: string): void {
  if (!text.trim()) return

  const backup = clipboard.readText()
  clipboard.writeText(text)
  try {
    uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl])
  } catch (error) {
    logger.error(`模拟粘贴失败：${(error as Error).message}`)
  }
  setTimeout(() => {
    clipboard.writeText(backup)
  }, RESTORE_DELAY_MS)
}