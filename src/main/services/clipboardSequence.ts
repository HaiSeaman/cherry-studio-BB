import { loggerService } from '@logger'
import koffi from 'koffi'

const logger = loggerService.withContext('ClipboardSequence')

type SequenceFn = () => number

/** undefined = 还没试过加载；null = 加载失败，别再试 */
let sequenceFn: SequenceFn | null | undefined

/**
 * Windows 剪贴板序列号：剪贴板内容每变化一次就 +1（user32!GetClipboardSequenceNumber）。
 *
 * 为什么要它：原来的轮询每 500ms 就把剪贴板的每种格式都读一遍，含图片时还要
 * `readImage()` → `toPNG()` → `md5()`（4K 截图是几十毫秒级的 PNG 编码）。
 * 主进程同时还负责转发语音音频、注入按键，被这么占着，语音输入会跟着一顿一顿。
 * 用序列号在昂贵读取之前先判断「到底变没变」，没变就直接跳过这一轮。
 *
 * FFI 不可用（或调用时抛异常）返回 null：调用方退回原来的逐格式读取，
 * 功能不受影响，只是继续费一点 CPU。
 */
export function getClipboardSequenceNumber(): number | null {
  if (sequenceFn === undefined) {
    try {
      const user32 = koffi.load('user32.dll')
      const readSequence = user32.func('uint32 GetClipboardSequenceNumber()')
      sequenceFn = () => readSequence() as number
    } catch (error) {
      logger.warn(`加载 user32!GetClipboardSequenceNumber 失败，剪贴板轮询退回逐格式读取：${(error as Error).message}`)
      sequenceFn = null
    }
  }

  if (!sequenceFn) return null
  try {
    return sequenceFn()
  } catch (error) {
    logger.warn(`读取剪贴板序列号失败，本轮退回逐格式读取：${(error as Error).message}`)
    return null
  }
}
