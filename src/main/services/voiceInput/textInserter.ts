import { loggerService } from '@logger'
import koffi from 'koffi'

const logger = loggerService.withContext('TextInserter')

/** Win32 INPUT.type */
const INPUT_KEYBOARD = 1
/** KEYBDINPUT.dwFlags */
const KEYEVENTF_KEYUP = 0x0002
/** KEYEVENTF_UNICODE：wScan 作为 Unicode 码元投递，走 WM_CHAR 通道 */
const KEYEVENTF_UNICODE = 0x0004
/** VK_BACK 与它的 Set 1 扫描码 */
const VK_BACK = 0x08
const SCAN_BACKSPACE = 0x0e

/**
 * x64 下 INPUT 结构体固定 40 字节：type(4) + 4 字节对齐 + union(32)。
 * union 内 KEYBDINPUT = wVk(2) + wScan(2) + dwFlags(4) + time(4) + 4 字节对齐 + dwExtraInfo(8)，
 * 即 wVk/wScan/dwFlags 位于记录偏移 8/10/12，dwExtraInfo 位于 24。
 */
export const INPUT_RECORD_SIZE = 40

function writeKeyRecord(buffer: Buffer, index: number, vk: number, scan: number, flags: number): void {
  const offset = index * INPUT_RECORD_SIZE
  buffer.writeUInt32LE(INPUT_KEYBOARD, offset)
  buffer.writeUInt16LE(vk, offset + 8)
  buffer.writeUInt16LE(scan, offset + 10)
  buffer.writeUInt32LE(flags, offset + 12)
}

/**
 * 构造「逐字输入」的 INPUT 记录：每个 UTF-16 码元一条按下 + 一条抬起。
 * 用 KEYEVENTF_UNICODE 而不是剪贴板粘贴，一是能逐字上屏，二是走 WM_CHAR 通道，
 * 不受物理按住的修饰键影响（按住 Ctrl 说话时不会被拼成 Ctrl+V 之类的组合键）。
 */
export function buildUnicodeRecords(text: string): Buffer {
  const units: number[] = []
  for (const char of text) {
    // 按 UTF-16 码元展开：emoji 等代理对拆成两个码元连续投递，由系统合成
    for (let i = 0; i < char.length; i++) units.push(char.charCodeAt(i))
  }
  const buffer = Buffer.alloc(units.length * 2 * INPUT_RECORD_SIZE)
  units.forEach((unit, index) => {
    const base = index * 2
    writeKeyRecord(buffer, base, 0, unit, KEYEVENTF_UNICODE)
    writeKeyRecord(buffer, base + 1, 0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)
  })
  return buffer
}

/** 构造退格记录：每个退格一条按下 + 一条抬起（真实 VK_BACK 按键） */
export function buildBackspaceRecords(count: number): Buffer {
  const buffer = Buffer.alloc(count * 2 * INPUT_RECORD_SIZE)
  for (let i = 0; i < count; i++) {
    const base = i * 2
    writeKeyRecord(buffer, base, VK_BACK, SCAN_BACKSPACE, 0)
    writeKeyRecord(buffer, base + 1, VK_BACK, SCAN_BACKSPACE, KEYEVENTF_KEYUP)
  }
  return buffer
}

type SendInputFn = (count: number, records: Buffer) => number

let sendInputFn: SendInputFn | null = null

/** 懒加载 user32!SendInput；加载失败（非 Windows / FFI 异常）时返回 null 并记日志 */
function getSendInput(): SendInputFn | null {
  if (sendInputFn) return sendInputFn
  try {
    const user32 = koffi.load('user32.dll')
    const sendInput = user32.func('uint32 SendInput(uint32 cInputs, uint8 *pInputs, int cbSize)')
    sendInputFn = (count, records) => sendInput(count, records, INPUT_RECORD_SIZE) as number
    return sendInputFn
  } catch (error) {
    logger.error(`加载 user32!SendInput 失败：${(error as Error).message}`)
    return null
  }
}

/** 最近一次注入的时刻，供焦点守卫区分「用户真实输入」与「自己的注入回声」 */
let lastInjectionAt = 0

export function getLastInjectionAt(): number {
  return lastInjectionAt
}

function send(records: Buffer): void {
  if (records.length === 0) return
  const sendInput = getSendInput()
  if (!sendInput) return
  try {
    sendInput(records.length / INPUT_RECORD_SIZE, records)
  } catch (error) {
    logger.error(`模拟输入失败：${(error as Error).message}`)
  }
  lastInjectionAt = Date.now()
}

/** 把文本逐字输入到当前光标处（仅空串不动作，空格等空白属于正常文本） */
export function typeTextAtCursor(text: string): void {
  if (!text) return
  send(buildUnicodeRecords(text))
}

/** 退格删除光标左侧 count 个字符 */
export function backspaceAtCursor(count: number): void {
  if (count <= 0) return
  send(buildBackspaceRecords(count))
}
