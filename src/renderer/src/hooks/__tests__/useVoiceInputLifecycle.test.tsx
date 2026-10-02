import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { finalizeMock, sendAudioMock } = vi.hoisted(() => ({
  finalizeMock: vi.fn(),
  sendAudioMock: vi.fn()
}))

// 可被测试触发的 begin/end/state 回调注册表
const captureCallbacks: Record<string, (state?: string) => void> = {}

beforeEach(() => {
  finalizeMock.mockClear()
  sendAudioMock.mockClear()
  Object.keys(captureCallbacks).forEach((k) => delete captureCallbacks[k])
  // useVoiceInput 里有一个模块级的「语音输入进行中」标记：每个用例拿一份全新的模块实例，避免互相污染
  vi.resetModules()

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
        onState: (cb: (state: string) => void) => {
          captureCallbacks.state = (state?: string) => cb(state ?? '')
          return () => undefined
        },
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

/** 每次 createScriptProcessor 生成的处理器（退回老路径时才会出现） */
const processors: { connect: unknown; disconnect: unknown; onaudioprocess: ((e: unknown) => void) | null }[] = []
/** 每次 new AudioWorkletNode 生成的节点（首选路径） */
const workletNodes: { port: { onmessage: ((e: { data: Float32Array }) => void) | null } }[] = []
/** AudioWorklet 是否可用（回退用例会置 false） */
let workletAvailable = true
/** 建起了几条录音链路：两条路径合计，用例只关心"几条" */
const chainCount = () => processors.length + workletNodes.length

class MockAudioWorkletNode {
  port = { onmessage: null as ((e: { data: Float32Array }) => void) | null }
  connect = vi.fn()
  disconnect = vi.fn()
  constructor() {
    workletNodes.push(this)
  }
}

class MockAudioContext {
  sampleRate = 48000
  destination = {}
  audioWorklet = {
    addModule: vi.fn(async () => {
      if (!workletAvailable) throw new Error('AudioWorklet 不可用')
    })
  }
  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn()
  }))
  createScriptProcessor = vi.fn(() => {
    const processor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as ((e: unknown) => void) | null
    }
    processors.push(processor)
    return processor
  })
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
    processors.length = 0
    workletNodes.length = 0
    workletAvailable = true
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode)
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

  it('快速重按（begin→end→begin 全落在 getUserMedia 未返回窗口内）：只建一条链路，被取消那轮立即释放麦克风', async () => {
    const pendingResolvers: ((stream: { getTracks: () => { stop: () => void }[] }) => void)[] = []
    const stops: ReturnType<typeof vi.fn>[] = []

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(
          () =>
            new Promise((resolve) => {
              const stop = vi.fn()
              stops.push(stop)
              pendingResolvers.push((stream) => resolve(stream))
            })
        )
      },
      configurable: true
    })

    const streamAt = (index: number) => ({ getTracks: () => [{ stop: stops[index] }] })

    const { useVoiceInput } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()

    act(() => captureCallbacks.begin())
    await waitMicrotasks()
    act(() => captureCallbacks.end()) // 录音还没建起来，这一轮实际什么都没建
    await waitMicrotasks()
    act(() => captureCallbacks.begin()) // 立刻再按
    await waitMicrotasks()

    expect(pendingResolvers.length).toBe(2)
    expect(chainCount()).toBe(0)

    // 两次 getUserMedia 现在才返回
    await act(async () => {
      pendingResolvers[0](streamAt(0))
      await Promise.resolve()
    })
    await act(async () => {
      pendingResolvers[1](streamAt(1))
      await Promise.resolve()
    })

    expect(chainCount()).toBe(1) // 只有真正在录的那一轮建了链路
    expect(stops[0]).toHaveBeenCalled() // 被取消的那一轮立刻释放，不能留下常开的麦克风
    expect(stops[1]).not.toHaveBeenCalled()
  })

  it('优先用 AudioWorklet 采集：处理跑在音频线程，主线程忙的时候不会丢音频', async () => {
    const { useVoiceInput } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()

    act(() => captureCallbacks.begin())
    await waitMicrotasks()

    expect(workletNodes).toHaveLength(1)
    expect(processors).toHaveLength(0) // 走新路径就不该再建 ScriptProcessor

    act(() => {
      workletNodes[0].port.onmessage?.({ data: new Float32Array(4800) }) // 48k 下正好 100ms
    })

    expect(sendAudioMock).toHaveBeenCalledTimes(1)
    expect((sendAudioMock.mock.calls[0][0] as ArrayBuffer).byteLength).toBe(3200)
  })

  it('AudioWorklet 不可用时自动退回 ScriptProcessor：不能因为新方案挂掉就录不了音', async () => {
    workletAvailable = false
    const { useVoiceInput } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()

    act(() => captureCallbacks.begin())
    await waitMicrotasks()

    expect(workletNodes).toHaveLength(0)
    expect(processors).toHaveLength(1)

    act(() => {
      processors[0].onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4800) } })
    })

    expect(sendAudioMock).toHaveBeenCalledTimes(1)
  })

  it('worklet 必须从同源路径加载：data:/blob: 会被页面 CSP（script-src self）拦掉，等于白装', async () => {
    const { resolveWorkletUrl } = await import('../useVoiceInput')

    const url = resolveWorkletUrl()

    expect(url.protocol).not.toBe('data:')
    expect(url.protocol).not.toBe('blob:')
    expect(url.pathname.endsWith('voiceCapture.worklet.js')).toBe(true)
  })

  it('麦克风已经拿到、但音频上下文建不起来时，必须把麦克风关掉（否则会一直常开）', async () => {
    const stops: ReturnType<typeof vi.fn>[] = []
    class FailingAudioContext {
      constructor() {
        throw new Error('音频设备不可用')
      }
    }
    vi.stubGlobal('AudioContext', FailingAudioContext)
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => {
          const stop = vi.fn()
          stops.push(stop)
          return { getTracks: () => [{ stop }] }
        })
      },
      configurable: true
    })

    const { useVoiceInput } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()

    act(() => captureCallbacks.begin())
    await waitMicrotasks()

    expect(stops[0]).toHaveBeenCalled()
    expect(sendAudioMock).not.toHaveBeenCalled()
  })

  it('录音期间标记为「语音输入中」，主进程报 done 后才解除（输入框据此关掉自动高度）', async () => {
    const { useVoiceInput, isVoiceInputActive } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()
    expect(isVoiceInputActive()).toBe(false)

    act(() => captureCallbacks.begin())
    await waitMicrotasks()
    expect(isVoiceInputActive()).toBe(true)

    act(() => captureCallbacks.end())
    await waitMicrotasks()
    // 松手之后主进程还要上屏最终校正，这期间同样不能打开自动高度
    expect(isVoiceInputActive()).toBe(true)

    act(() => captureCallbacks.state('done'))
    await waitMicrotasks()
    expect(isVoiceInputActive()).toBe(false)
  })

  it('主进程报 error 时也要解除标记，否则输入框会一直不自动增高', async () => {
    const { useVoiceInput, isVoiceInputActive } = await import('../useVoiceInput')
    renderHook(() => useVoiceInput())
    await waitMicrotasks()

    act(() => captureCallbacks.begin())
    await waitMicrotasks()
    expect(isVoiceInputActive()).toBe(true)

    act(() => captureCallbacks.state('error'))
    await waitMicrotasks()
    expect(isVoiceInputActive()).toBe(false)
  })
})