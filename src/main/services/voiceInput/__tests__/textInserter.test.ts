import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendInputMock, getAsyncKeyStateMock, downKeys, loadMock } = vi.hoisted(() => {
  const downKeys = new Set<number>()
  return {
    sendInputMock: vi.fn<(count: number, records: Buffer, size: number) => number>((count) => count),
    getAsyncKeyStateMock: vi.fn((vk: number) => (downKeys.has(vk) ? -32768 : 0)),
    downKeys,
    loadMock: vi.fn(() => ({
      func: (signature: string) => (signature.includes('GetAsyncKeyState') ? getAsyncKeyStateMock : sendInputMock)
    }))
  }
})

vi.mock('koffi', () => ({ default: { load: loadMock } }))

import {
  backspaceAtCursor,
  buildBackspaceRecords,
  buildUnicodeRecords,
  INPUT_RECORD_SIZE,
  typeTextAtCursor
} from '../textInserter'

/** 解析第 index 条 INPUT 记录（x64 布局：type@0，wVk@8，wScan@10，dwFlags@12，dwExtraInfo@24） */
const parseRecord = (buffer: Buffer, index: number) => {
  const base = index * INPUT_RECORD_SIZE
  return {
    type: buffer.readUInt32LE(base),
    vk: buffer.readUInt16LE(base + 8),
    scan: buffer.readUInt16LE(base + 10),
    flags: buffer.readUInt32LE(base + 12),
    extraInfo: buffer.readBigUInt64LE(base + 24)
  }
}

/** 最近一次 SendInput 真正发出去的记录条数 */
const lastSentCount = () => sendInputMock.mock.calls.at(-1)?.[0] ?? 0
const lastSentBuffer = () => sendInputMock.mock.calls.at(-1)?.[1] as Buffer

const VK_LCONTROL = 0xa2
const VK_RCONTROL = 0xa3
const VK_LSHIFT = 0xa0
const KEYEVENTF_KEYUP = 0x0002
const KEYEVENTF_EXTENDEDKEY = 0x0001
/** uiohook 的键码（左 Ctrl / 右 Ctrl / 退格） */
const UIOHOOK_CTRL = 29
const UIOHOOK_CTRL_RIGHT = 3613
const UIOHOOK_BACKSPACE = 14

beforeEach(() => {
  sendInputMock.mockClear()
  getAsyncKeyStateMock.mockClear()
  downKeys.clear()
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildUnicodeRecords（逐字输入的 INPUT 记录）', () => {
  it('每个字符生成「按下 + 抬起」两条记录，走 KEYEVENTF_UNICODE 且不带修饰键', () => {
    const buffer = buildUnicodeRecords('中A')
    expect(buffer.length).toBe(4 * INPUT_RECORD_SIZE)

    const down = parseRecord(buffer, 0)
    expect(down).toEqual({
      type: 1, // INPUT_KEYBOARD
      vk: 0, // 不设虚拟键：由 wScan 直接投递 Unicode 码元
      scan: '中'.charCodeAt(0),
      flags: 0x0004, // KEYEVENTF_UNICODE
      extraInfo: 0n
    })

    const up = parseRecord(buffer, 1)
    expect(up.scan).toBe('中'.charCodeAt(0))
    expect(up.flags).toBe(0x0004 | 0x0002) // KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
    expect(parseRecord(buffer, 2).scan).toBe('A'.charCodeAt(0))
    expect(parseRecord(buffer, 3).flags).toBe(0x0006)
  })

  it('代理对（emoji）按 UTF-16 码元连续投递，由系统合成', () => {
    const buffer = buildUnicodeRecords('😀')
    expect(buffer.length).toBe(4 * INPUT_RECORD_SIZE)
    expect(parseRecord(buffer, 0).scan).toBe(0xd83d)
    expect(parseRecord(buffer, 2).scan).toBe(0xde00)
  })

  it('空文本不产生记录', () => {
    expect(buildUnicodeRecords('').length).toBe(0)
  })
})

describe('buildBackspaceRecords（退格输入）', () => {
  it('每个退格生成「按下 + 抬起」两条 VK_BACK 记录', () => {
    const buffer = buildBackspaceRecords(2)
    expect(buffer.length).toBe(4 * INPUT_RECORD_SIZE)

    const down = parseRecord(buffer, 0)
    expect(down).toEqual({ type: 1, vk: 0x08, scan: 0x0e, flags: 0, extraInfo: 0n })
    expect(parseRecord(buffer, 1).flags).toBe(0x0002)
    expect(parseRecord(buffer, 2).vk).toBe(0x08)
  })
})

describe('全局逐字输入', () => {
  it('typeTextAtCursor 一次性把文本记录交给 SendInput', () => {
    typeTextAtCursor('你好')
    expect(loadMock).toHaveBeenCalledWith('user32.dll')
    expect(sendInputMock).toHaveBeenCalledTimes(1)
    const [count, records, size] = sendInputMock.mock.calls[0]
    expect(count).toBe(4) // 2 个字 × 按下/抬起
    expect(size).toBe(INPUT_RECORD_SIZE)
    expect(records.length).toBe(4 * INPUT_RECORD_SIZE)
  })

  it('backspaceAtCursor 按次数生成退格记录', () => {
    backspaceAtCursor(3)
    expect(sendInputMock).toHaveBeenCalledTimes(1)
    expect(lastSentCount()).toBe(6)
  })

  it('空文本与零退格不触发系统调用', () => {
    typeTextAtCursor('')
    backspaceAtCursor(0)
    backspaceAtCursor(-1)
    expect(sendInputMock).not.toHaveBeenCalled()
  })

  it('SendInput 部分失败时要补一次「还原修饰键」：不能让修饰键停在松开状态', () => {
    downKeys.add(VK_LCONTROL)
    sendInputMock.mockReturnValueOnce(1) // 一整批只进去 1 条 → 算部分失败

    backspaceAtCursor(1)

    expect(sendInputMock).toHaveBeenCalledTimes(2) // 第二批只发还原记录
    const [count, records] = sendInputMock.mock.calls[1]
    expect(count).toBe(1)
    expect(parseRecord(records as Buffer, 0)).toMatchObject({ vk: VK_LCONTROL, flags: 0 })
  })

  it('修饰键没按住时，部分失败也不需要补还原（本来就没动过它）', () => {
    sendInputMock.mockReturnValueOnce(0)

    backspaceAtCursor(1)

    expect(sendInputMock).toHaveBeenCalledTimes(1)
  })
})

describe('修饰键释放：退格不能变成「Ctrl+退格」（删一整个词）', () => {
  it('物理按住左 Ctrl 时，退格记录前面先插一条 Ctrl 抬起、末尾再把它按回去', () => {
    downKeys.add(VK_LCONTROL)

    backspaceAtCursor(2)

    // 1 条 Ctrl 抬起 + 2 次退格 × (按下+抬起) + 1 条 Ctrl 按下（还原）
    expect(lastSentCount()).toBe(1 + 4 + 1)
    expect(parseRecord(lastSentBuffer(), 0)).toMatchObject({ vk: VK_LCONTROL, flags: KEYEVENTF_KEYUP, type: 1 })
    // 原有的退格记录仍在，且排在中间
    expect(parseRecord(lastSentBuffer(), 1)).toMatchObject({ vk: 0x08, flags: 0 })
    expect(parseRecord(lastSentBuffer(), 2)).toMatchObject({ vk: 0x08, flags: KEYEVENTF_KEYUP })
  })

  it('末尾的还原记录必须是「按下」而不是「抬起」', () => {
    downKeys.add(VK_LCONTROL)
    backspaceAtCursor(1)

    const restore = parseRecord(lastSentBuffer(), lastSentCount() - 1)
    expect(restore).toMatchObject({ vk: VK_LCONTROL, type: 1 })
    expect(restore.flags & KEYEVENTF_KEYUP).toBe(0)
  })

  it('注入完必须把修饰键按回去：只松开不还原，主人按住的那个键会开始自动重复、被打成真实字符', () => {
    // 回归：v1.11.2 只松开不还原 → 目标程序看到的 Ctrl 一直是"没按"，
    // 于是主人按住不放的 ` 的自动重复从「Ctrl+`（不产生字符）」变成「裸 `（直接打出反引号）」，
    // 实测能把一整句话撕成 `我的```语音素无法```这样` 的形状。
    downKeys.add(VK_LCONTROL)

    typeTextAtCursor('测试')

    const buffer = lastSentBuffer()
    const count = lastSentCount()
    expect(parseRecord(buffer, 0)).toMatchObject({ vk: VK_LCONTROL, flags: KEYEVENTF_KEYUP })
    expect(parseRecord(buffer, count - 1)).toMatchObject({ vk: VK_LCONTROL, flags: 0 })
  })

  it('修饰键没按住时绝不注入「按下」记录：否则会把 Ctrl 卡在按下状态，主人之后打字全变快捷键', () => {
    backspaceAtCursor(1)

    const count = lastSentCount()
    for (let i = 0; i < count; i++) {
      expect(parseRecord(lastSentBuffer(), i).vk).toBe(0x08) // 只有退格，没有任何修饰键记录
    }
  })

  it('按住的是 Shift 时同理（左 Shift 不带扩展键标志）', () => {
    downKeys.add(VK_LSHIFT)
    backspaceAtCursor(1)

    const first = parseRecord(lastSentBuffer(), 0)
    expect(first).toMatchObject({ vk: VK_LSHIFT, flags: KEYEVENTF_KEYUP })
    expect(first.flags & KEYEVENTF_EXTENDEDKEY).toBe(0)

    const restore = parseRecord(lastSentBuffer(), lastSentCount() - 1)
    expect(restore).toMatchObject({ vk: VK_LSHIFT, flags: 0 })
  })

  it('按住的是右 Ctrl 时，释放与还原记录都带扩展键标志', () => {
    downKeys.add(VK_RCONTROL)
    backspaceAtCursor(1)

    expect(parseRecord(lastSentBuffer(), 0)).toMatchObject({
      vk: VK_RCONTROL,
      flags: KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY
    })
    expect(parseRecord(lastSentBuffer(), lastSentCount() - 1)).toMatchObject({
      vk: VK_RCONTROL,
      flags: KEYEVENTF_EXTENDEDKEY
    })
  })

  it('没有修饰键按住时不插入任何额外记录', () => {
    backspaceAtCursor(1)
    expect(lastSentCount()).toBe(2)
    expect(parseRecord(lastSentBuffer(), 0)).toMatchObject({ vk: 0x08, flags: 0 })
  })

  it('打字（不是退格）也先松开修饰键：字符通道同样不该带着物理按住的修饰键', () => {
    downKeys.add(VK_LCONTROL)
    typeTextAtCursor('中')

    expect(lastSentCount()).toBe(1 + 2 + 1)
    expect(parseRecord(lastSentBuffer(), 0)).toMatchObject({ vk: VK_LCONTROL, flags: KEYEVENTF_KEYUP })
    expect(parseRecord(lastSentBuffer(), 1).scan).toBe('中'.charCodeAt(0))
  })
})

describe('isInjectedEcho：把「自己注入的事件」登记下来，供焦点守卫/按住检测器排除', () => {
  // 回声登记表是模块级状态：每个用例都取一份全新实例，避免用例之间互相污染
  let mod: typeof import('../textInserter')

  beforeEach(async () => {
    vi.resetModules()
    mod = await import('../textInserter')
  })

  it('未注入过的键码不是回声', () => {
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(false)
  })

  it('退格注入后登记「按下 + 抬起」两次，第三次不再是回声', () => {
    mod.backspaceAtCursor(1)

    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(true)
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(true)
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(false)
  })

  it('同一个事件对象被多个监听器问到，只扣一次、都判为回声', () => {
    mod.backspaceAtCursor(1)
    const downEvent = { keycode: UIOHOOK_BACKSPACE }

    expect(mod.isInjectedEcho(downEvent)).toBe(true)
    expect(mod.isInjectedEcho(downEvent)).toBe(true)
    // 但抬起是另一个事件对象，仍要能认出来
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(true)
  })

  it('注入的修饰键抬起与还原都登记（否则按住检测器会以为主人松手了）', () => {
    downKeys.add(VK_LCONTROL)
    mod.backspaceAtCursor(1)

    // 抬起 + 按下 两条都登记 → 前两次认得出，第三次才不是回声
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_CTRL })).toBe(true)
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_CTRL })).toBe(true)
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_CTRL })).toBe(false)
  })

  it('按住的是右 Ctrl 时，登记的是右 Ctrl 的键码', () => {
    downKeys.add(VK_RCONTROL)
    mod.backspaceAtCursor(1)

    expect(mod.isInjectedEcho({ keycode: UIOHOOK_CTRL_RIGHT })).toBe(true)
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_CTRL })).toBe(false)
  })

  it('登记超过追溯时限后自动失效：宁可少排除，也不能把主人真实的按键吞掉', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    mod.backspaceAtCursor(1)
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(true)

    mod.backspaceAtCursor(1)
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(false)
  })

  it('SendInput 整体失败时不登记（避免吞掉主人真实的按键）', () => {
    sendInputMock.mockReturnValueOnce(0)
    mod.backspaceAtCursor(1)

    expect(mod.isInjectedEcho({ keycode: UIOHOOK_BACKSPACE })).toBe(false)
  })
})
