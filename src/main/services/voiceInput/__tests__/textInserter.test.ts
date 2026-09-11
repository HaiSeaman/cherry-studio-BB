import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendInputMock, loadMock } = vi.hoisted(() => {
  const sendInputMock = vi.fn<(count: number, records: Buffer, size: number) => number>(() => 1)
  return {
    sendInputMock,
    loadMock: vi.fn(() => ({ func: () => sendInputMock }))
  }
})

vi.mock('koffi', () => ({ default: { load: loadMock } }))

import {
  backspaceAtCursor,
  buildBackspaceRecords,
  buildUnicodeRecords,
  getLastInjectionAt,
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

beforeEach(() => {
  sendInputMock.mockClear()
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
    expect(sendInputMock.mock.calls[0][0]).toBe(6)
  })

  it('空文本与零退格不触发系统调用', () => {
    typeTextAtCursor('')
    backspaceAtCursor(0)
    backspaceAtCursor(-1)
    expect(sendInputMock).not.toHaveBeenCalled()
  })

  it('注入后记录时刻，供焦点守卫区分注入回声', () => {
    const before = Date.now()
    typeTextAtCursor('测试')
    expect(getLastInjectionAt()).toBeGreaterThanOrEqual(before)
  })
})
