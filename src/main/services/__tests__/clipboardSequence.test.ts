import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadMock, sequenceMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  sequenceMock: vi.fn()
}))

vi.mock('koffi', () => ({ default: { load: loadMock } }))

const useWorkingFfi = () => {
  loadMock.mockImplementation(() => ({ func: () => sequenceMock }))
}

describe('getClipboardSequenceNumber', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    useWorkingFfi()
  })

  it('返回系统给出的剪贴板序列号', async () => {
    sequenceMock.mockReturnValue(7)
    const { getClipboardSequenceNumber } = await import('../clipboardSequence')

    expect(getClipboardSequenceNumber()).toBe(7)
  })

  it('连续调用复用同一个已加载的函数，不重复 load', async () => {
    sequenceMock.mockReturnValue(1)
    const { getClipboardSequenceNumber } = await import('../clipboardSequence')

    getClipboardSequenceNumber()
    getClipboardSequenceNumber()
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('FFI 加载失败时返回 null，让调用方退回逐格式读取', async () => {
    loadMock.mockImplementation(() => {
      throw new Error('koffi 不可用')
    })
    const { getClipboardSequenceNumber } = await import('../clipboardSequence')

    expect(getClipboardSequenceNumber()).toBeNull()
  })

  it('调用时抛异常也返回 null：不能让整个剪贴板历史静默失效', async () => {
    sequenceMock.mockImplementation(() => {
      throw new Error('boom')
    })
    const { getClipboardSequenceNumber } = await import('../clipboardSequence')

    expect(getClipboardSequenceNumber()).toBeNull()
  })
})
