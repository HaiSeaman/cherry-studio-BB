import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { finalizeMock, sendAudioMock } = vi.hoisted(() => ({
  finalizeMock: vi.fn(),
  sendAudioMock: vi.fn()
}))

// 可被测试触发的 begin/end 回调注册表
const captureCallbacks: Record<string, () => void> = {}

beforeEach(() => {
  finalizeMock.mockClear()
  sendAudioMock.mockClear()
  Object.keys(captureCallbacks).forEach((k) => delete captureCallbacks[k])

  Object.defineProperty(window, 'api', {
    value: {
      voiceInput: {
        onBeginCapture: (cb: () => void) => {
          captureCallbacks.begin = cb
          return () => undefined
        },
        onEndCapture: (cb: () => void) => {
          captureCallbacks.end = cb
          return () => undefined
        },
        onState: () => () => undefined,
        sendAudio: sendAudioMock,
        finalize: finalizeMock
      }
    },
    configurable: true
  })
})

const stopTrackMock = vi.fn()
const makeStream = () => ({
  getTracks: () => [{ stop: stopTrackMock }]
})

class MockAudioContext {
  sampleRate = 48000
  destination = {}
  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn()
  }))
  createScriptProcessor = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null
  }))
  close = vi.fn().mockResolvedValue(undefined)
}

const waitMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useVoiceInput 录音生命周期', () => {
  beforeEach(() => {
    stopTrackMock.mockClear()
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(makeStream()) },
      configurable: true
    })
    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  it('正常流程：begin 启动录音，end 停止音轨并 finalize', async () => {
    const { useVoiceInput } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()

    act(() => {
      captureCallbacks.begin()
    })
    await waitMicrotasks()

    act(() => {
      captureCallbacks.end()
    })
    await waitMicrotasks()

    expect(finalizeMock).toHaveBeenCalledTimes(1)
    expect(stopTrackMock).toHaveBeenCalled()
  })

  it('end 早于录音启动完成：仍然 finalize（不悬挂），流稍后启动时立即释放（不泄漏麦克风）', async () => {
  let resolveUserMedia!: (stream: ReturnType<typeof makeStream>) => void
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(
        () =>
          new Promise<ReturnType<typeof makeStream>>((resolve) => {
            resolveUserMedia = resolve
          })
      )
    },
    configurable: true
  })
  const { useVoiceInput } = await import('../useVoiceInput')
  renderHook(() => useVoiceInput())
  await waitMicrotasks()

  // begin 开始录音（getUserMedia 挂起中…）
  act(() => {
    captureCallbacks.begin()
  })
  await waitMicrotasks()

  // end 在录音启动完成前到达
  act(() => {
    captureCallbacks.end()
  })
  await waitMicrotasks()
  expect(finalizeMock).toHaveBeenCalledTimes(1)

  // getUserMedia 这时才 resolve：流应立即释放，不推送任何音频
  await act(async () => {
    resolveUserMedia(makeStream())
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(stopTrackMock).toHaveBeenCalled()
  expect(sendAudioMock).not.toHaveBeenCalled()
})

  it('麦克风被拒：begin→end 仍 finalize（主进程会话能收尾），不报错', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true
    })
    const { useVoiceInput } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()

    act(() => {
      captureCallbacks.begin()
    })
    await waitMicrotasks()
    act(() => {
      captureCallbacks.end()
    })
    await waitMicrotasks()

    expect(finalizeMock).toHaveBeenCalledTimes(1)
    expect(sendAudioMock).not.toHaveBeenCalled()
  })
})