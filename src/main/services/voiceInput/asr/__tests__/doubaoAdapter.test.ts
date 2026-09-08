import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMock, closeMock, onMock, wsConstructs } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  closeMock: vi.fn(),
  onMock: vi.fn(),
  wsConstructs: vi.fn()
}))

vi.mock('ws', () => {
  class MockWebSocket {
    on = onMock
    send = sendMock
    close = closeMock
    constructor(url?: string, options?: unknown) {
      wsConstructs(url, options)
    }
  }
  return { default: MockWebSocket }
})

import { DoubaoASRAdapter } from '../doubao'

const trigger = (event: string, data?: unknown) => {
  const handler = onMock.mock.calls.find((c: unknown[]) => c[0] === event)?.[1] as ((d?: unknown) => void) | undefined
  handler?.(data)
}

const seq = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

/** 构造服务端响应帧（type=0x09 + sequence 扩展头；payload 为真机实测结构 result.text；isLast → flags=0x03） */
const responseFrame = (text: string, sequence: number, isLast: boolean = false) => {
  const payload = Buffer.from(
    JSON.stringify({ audio_info: { duration: 1000 }, result: { additions: { log_id: 'x' }, text } })
  )
  const len = Buffer.alloc(4)
  len.writeUInt32BE(payload.length)
  const header = Buffer.from(isLast ? [0x11, 0x93, 0x00, 0x00] : [0x11, 0x91, 0x00, 0x00])
  return Buffer.concat([header, seq(sequence), len, payload])
}

/** 构造错误响应帧（code 非 1000） */
const errorFrame = (code: number, message: string, sequence: number) => {
  const payload = Buffer.from(JSON.stringify({ code, message }))
  const len = Buffer.alloc(4)
  len.writeUInt32BE(payload.length)
  return Buffer.concat([Buffer.from([0x11, 0x91, 0x00, 0x00]), seq(sequence), len, payload])
}

beforeEach(() => {
  sendMock.mockClear()
  closeMock.mockClear()
  onMock.mockClear()
  wsConstructs.mockClear()
})

const createAdapter = (opts: Partial<ConstructorParameters<typeof DoubaoASRAdapter>[0]> = {}) =>
  new DoubaoASRAdapter({ apiKey: 'app-key-123', resourceId: 'volc.seedasr.sauc.duration', ...opts })

describe('DoubaoASRAdapter（大模型流式接口）', () => {
  it('connect 使用大模型接口地址并携带官方鉴权请求头（含 X-Api-Sequence: -1）', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected

    const [url, options] = wsConstructs.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(url).toBe('wss://openspeech.bytedance.com/api/v3/sauc/bigmodel')
    expect(options.headers['X-Api-Key']).toBe('app-key-123')
    expect(options.headers['X-Api-Resource-Id']).toBe('volc.seedasr.sauc.duration')
    expect(options.headers['X-Api-Request-Id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(options.headers['X-Api-Connect-Id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(options.headers['X-Api-Sequence']).toBe('-1')
  })

  it('startSession 发送首帧（0x11 头 + 大模型接口 JSON payload：model_name=bigmodel）', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected

    adapter.startSession()
    const sent = sendMock.mock.calls[0][0] as Buffer
    expect(Array.from(sent.subarray(0, 4))).toEqual([0x11, 0x10, 0x10, 0x00]) // 首帧头（version=1）
    const payload = JSON.parse(sent.subarray(8, 8 + sent.readUInt32BE(4)).toString())
    expect(payload.request.model_name).toBe('bigmodel')
    expect(payload.audio.format).toBe('pcm')
    expect(payload.app).toBeUndefined()
  })

  it('sendAudio 发送音频帧（header type=0b0010）', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()

    adapter.sendAudio(new Uint8Array([1, 2, 3]))
    const sent = sendMock.mock.calls.at(-1)![0] as Buffer
    expect(Array.from(sent.subarray(0, 4))).toEqual([0x11, 0x20, 0x00, 0x00])
    expect(sent.readUInt32BE(4)).toBe(3)
  })

  it('startSession 前的音频被缓存，startSession 后随首帧一并补发', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected

    adapter.sendAudio(new Uint8Array([1, 2, 3]))
    expect(sendMock).not.toHaveBeenCalled()

    adapter.startSession()
    expect(sendMock.mock.calls.length).toBe(2) // 首帧 + 缓存音频
    const first = sendMock.mock.calls[0][0] as Buffer
    const audio = sendMock.mock.calls[1][0] as Buffer
    expect(Array.from(first.subarray(0, 4))).toEqual([0x11, 0x10, 0x10, 0x00])
    expect(Array.from(audio.subarray(0, 4))).toEqual([0x11, 0x20, 0x00, 0x00])
    expect(audio.readUInt32BE(4)).toBe(3)
  })

  it('响应帧（带 sequence 扩展头）按全量文本替换；末包帧（flags=0x03）后 stopAndFinalize resolve 完整文本', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()
    adapter.sendAudio(new Uint8Array([1]))

    const finalText = adapter.stopAndFinalize()
    // finalize 应发送末包帧（flags=0b0010）
    const last = sendMock.mock.calls.at(-1)![0] as Buffer
    expect(Array.from(last.subarray(0, 4))).toEqual([0x11, 0x22, 0x00, 0x00])

    trigger('message', responseFrame('今天天气', 2))
    trigger('message', responseFrame('今天天气不错', 3))
    trigger('message', responseFrame('今天天气不错', 4, true)) // 末包响应（flags=0x03）
    await expect(finalText).resolves.toBe('今天天气不错')
  })

  it('onResult 实时回调累计全量文本；服务端修正改写（非前缀增长）时替换而非拼接', async () => {
    const onResult = vi.fn()
    const adapter = createAdapter({ onResult })
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()

    // 真机响应（result_type=full）：每次都是从头开始的累计全量文本
    trigger('message', responseFrame('你好', 2))
    trigger('message', responseFrame('你好世界', 3))
    trigger('message', responseFrame('你好世界第二句', 4))
    expect(onResult.mock.calls.map((c) => c[0])).toEqual(['你好', '你好世界', '你好世界第二句'])

    // 服务端对前文修正（旧文本不再是新文本前缀）：应整体替换，不产生重复
    onResult.mockClear()
    trigger('message', responseFrame('你好世界第二句（修正版）', 5))
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith('你好世界第二句（修正版）')
  })

  it('错误响应帧（code 非 1000）回调 onError', async () => {
    const onError = vi.fn()
    const adapter = createAdapter({ onError })
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()

    trigger('message', errorFrame(4001, '参数不合法', 2))
    expect(onError).toHaveBeenCalledWith('参数不合法')
  })

  it('close 关闭连接', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.close()
    expect(closeMock).toHaveBeenCalled()
  })
})