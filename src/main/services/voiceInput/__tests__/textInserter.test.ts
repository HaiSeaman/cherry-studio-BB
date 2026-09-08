import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { readTextMock, writeTextMock, keyTapMock } = vi.hoisted(() => ({
  readTextMock: vi.fn(),
  writeTextMock: vi.fn(),
  keyTapMock: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: { readText: readTextMock, writeText: writeTextMock }
}))

vi.mock('uiohook-napi', async () => {
  const actual = (await vi.importActual('uiohook-napi')) as Record<string, unknown>
  return { ...actual, uIOhook: { keyTap: keyTapMock } }
})

import { UiohookKey } from 'uiohook-napi'

import { insertTextAtCursor } from '../textInserter'

beforeEach(() => {
  vi.useFakeTimers()
  readTextMock.mockReset().mockReturnValue('主人原来的剪贴板')
  writeTextMock.mockReset()
  keyTapMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('insertTextAtCursor（全局打字）', () => {
  it('备份剪贴板 → 写入识别文本 → 模拟 Ctrl+V → 延迟后恢复原剪贴板', () => {
    insertTextAtCursor('今天天气不错')

    expect(readTextMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).toHaveBeenNthCalledWith(1, '今天天气不错')
    expect(keyTapMock).toHaveBeenCalledWith(UiohookKey.V, [UiohookKey.Ctrl])

    // 恢复是延迟的（等粘贴完成），立即恢复会覆盖
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(writeTextMock).toHaveBeenNthCalledWith(2, '主人原来的剪贴板')
  })

  it('空白文本不动作（不碰剪贴板、不模拟按键）', () => {
    insertTextAtCursor('   ')
    insertTextAtCursor('')
    expect(readTextMock).not.toHaveBeenCalled()
    expect(writeTextMock).not.toHaveBeenCalled()
    expect(keyTapMock).not.toHaveBeenCalled()
  })
})