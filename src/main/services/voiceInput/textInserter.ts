import { loggerService } from '@logger'
import koffi from 'koffi'

const logger = loggerService.withContext('TextInserter')

/** Win32 INPUT.type */
const INPUT_KEYBOARD = 1
/** KEYBDINPUT.dwFlags */
const KEYEVENTF_EXTENDEDKEY = 0x0001
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

/**
 * 物理按住中的修饰键 → 虚拟键码 / 是否需要扩展键标志 / libuiohook 键码。
 *
 * 为什么必须先松开它们：SendInput 注入的按键会被目标程序按「当前键盘状态」解释。
 * 按住 Ctrl 说话时（默认快捷键就是 Ctrl+`），注入的 VK_BACK 到了 Chromium 那边
 * 就带着 ctrlKey=true，等价于 Ctrl+Backspace = 删一整个词，而打字器是按「删一个字符」算账的，
 * 一错位就会把已经上屏的正确内容一起吃掉。
 * 只松开、不还原：还原会在注入序列里再插一对按下/抬起，而物理键本来就还按着，
 * 反而容易让目标程序看到自相矛盾的键盘状态；主人松手时系统会补一次多余的抬起，无副作用。
 * ponytail: 只处理修饰键这一层，够用；真要支持任意「按住期间按键」的语义再考虑别的方案。
 */
const MODIFIER_KEYS = [
  { vk: 0xa0, extended: false, uiohook: 42 }, // 左 Shift
  { vk: 0xa1, extended: true, uiohook: 54 }, // 右 Shift
  { vk: 0xa2, extended: false, uiohook: 29 }, // 左 Ctrl
  { vk: 0xa3, extended: true, uiohook: 3613 }, // 右 Ctrl
  { vk: 0xa4, extended: false, uiohook: 56 }, // 左 Alt
  { vk: 0xa5, extended: true, uiohook: 3640 }, // 右 Alt
  { vk: 0x5b, extended: true, uiohook: 3675 }, // 左 Win
  { vk: 0x5c, extended: true, uiohook: 3676 } // 右 Win
] as const

/** libuiohook 的键码（PC 扫描码体系），与 uiohook-napi 的 UiohookKey 数值一致 */
const UIOHOOK_BACKSPACE = 14

type SendInputFn = (count: number, records: Buffer) => number
type GetAsyncKeyStateFn = (vk: number) => number

let sendInputFn: SendInputFn | null = null
let asyncKeyStateFn: GetAsyncKeyStateFn | null = null

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

/** 懒加载 user32!GetAsyncKeyState：用来判断哪个修饰键此刻真的被物理按住 */
function getAsyncKeyState(): GetAsyncKeyStateFn | null {
  if (asyncKeyStateFn) return asyncKeyStateFn
  try {
    const user32 = koffi.load('user32.dll')
    const getState = user32.func('short GetAsyncKeyState(int vKey)')
    asyncKeyStateFn = (vk) => getState(vk) as number
    return asyncKeyStateFn
  } catch (error) {
    logger.warn(`加载 user32!GetAsyncKeyState 失败，修饰键将无法自动松开：${(error as Error).message}`)
    return null
  }
}

/** GetAsyncKeyState 的最高位为 1 表示该键当前处于按下状态 */
const isPhysicallyDown = (getState: GetAsyncKeyStateFn, vk: number): boolean => ((getState(vk) ?? 0) & 0x8000) !== 0

/**
 * 收集「此刻物理按住、需要先松开」的修饰键，并生成对应的抬起记录。
 * 返回 null 表示不需要（没有修饰键按住，或 FFI 不可用）。
 */
function collectModifierReleases(): { buffer: Buffer; echoCodes: number[] } | null {
  const getState = getAsyncKeyState()
  if (!getState) return null

  const held = MODIFIER_KEYS.filter((key) => isPhysicallyDown(getState, key.vk))
  if (held.length === 0) return null

  const buffer = Buffer.alloc(held.length * INPUT_RECORD_SIZE)
  const echoCodes: number[] = []
  held.forEach((key, index) => {
    writeKeyRecord(buffer, index, key.vk, 0, KEYEVENTF_KEYUP | (key.extended ? KEYEVENTF_EXTENDEDKEY : 0))
    echoCodes.push(key.uiohook)
  })
  return { buffer, echoCodes }
}

/** 最近一次注入的时刻，供焦点守卫兜底排除「注入回声」（按时间的粗略判据） */
let lastInjectionAt = 0

export function getLastInjectionAt(): number {
  return lastInjectionAt
}

/** 回声登记的追溯时限：超过就作废 —— 宁可少排除，也不能把主人真实按下的键吞掉 */
export const ECHO_TRACE_MS = 2000

/** 我们注入的键事件登记表：uiohook 键码 → 还没被认领的条数 */
const pendingEchoes = new Map<number, { remaining: number; at: number }>()

/**
 * 同一个 uiohook 事件对象会被多个监听器读到（按住检测器 + 焦点守卫）。
 * 判过一次就记下来，避免第二个监听器再扣一次计数。
 */
const classifiedEvents = new WeakSet<object>()

export function registerInjectedEcho(keycode: number, count: number): void {
  if (count <= 0) return
  const now = Date.now()
  const entry = pendingEchoes.get(keycode)
  if (entry) {
    entry.remaining += count
    entry.at = now
    return
  }
  pendingEchoes.set(keycode, { remaining: count, at: now })
}

/**
 * 这个键鼠事件是不是我们自己刚注入的？是的话调用方应当忽略它（不能当成主人的操作）。
 * 精确计数 + 时限兜底：登记多了也不会永久吞掉主人的按键。
 */
export function isInjectedEcho(event: { keycode: number }): boolean {
  if (classifiedEvents.has(event)) return true

  const entry = pendingEchoes.get(event.keycode)
  if (!entry) return false
  if (Date.now() - entry.at > ECHO_TRACE_MS) {
    pendingEchoes.delete(event.keycode)
    return false
  }

  entry.remaining--
  if (entry.remaining <= 0) pendingEchoes.delete(event.keycode)
  classifiedEvents.add(event)
  return true
}

/**
 * 把一批按键记录交给 SendInput。
 * @param records 要注入的记录
 * @param echoCodes 这些记录对应的 uiohook 键码（每条一个），成功后登记为「自己的回声」；
 *                  字符走 VK_PACKET，uiohook 报什么键码无法预知，因此不登记、由时间窗兜底
 */
function send(records: Buffer, echoCodes: readonly number[] = []): void {
  if (records.length === 0) return
  const sendInput = getSendInput()
  if (!sendInput) return

  const releases = collectModifierReleases()
  const batch = releases ? Buffer.concat([releases.buffer, records]) : records
  const expected = batch.length / INPUT_RECORD_SIZE

  let sent = 0
  try {
    sent = sendInput(expected, batch)
    // SendInput 返回实际注入条数；部分失败通常是 UIPI（目标窗口提权）或输入被拦截，
    // 静默会导致「识别出字却没打进去」，记日志便于排查
    if (sent !== expected) logger.warn(`SendInput 部分失败：注入 ${sent}/${expected} 条`)
  } catch (error) {
    logger.error(`模拟输入失败：${(error as Error).message}`)
  } finally {
    lastInjectionAt = Date.now()
  }

  // 只有整批都进去了才登记回声：登记多了会把主人真实按下的键当成自己的回声吞掉
  if (sent !== expected) return

  const tally = new Map<number, number>()
  for (const code of [...(releases?.echoCodes ?? []), ...echoCodes]) {
    tally.set(code, (tally.get(code) ?? 0) + 1)
  }
  for (const [code, count] of tally) registerInjectedEcho(code, count)
}

/** 把文本逐字输入到当前光标处（仅空串不动作，空格等空白属于正常文本） */
export function typeTextAtCursor(text: string): void {
  if (!text) return
  send(buildUnicodeRecords(text))
}

/** 退格删除光标左侧 count 个字符 */
export function backspaceAtCursor(count: number): void {
  if (count <= 0) return
  // 每次退格会注入「按下 + 抬起」两条，两条都要登记成回声
  send(buildBackspaceRecords(count), new Array<number>(count * 2).fill(UIOHOOK_BACKSPACE))
}
