import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const closeMock = vi.fn()
const onMock = vi.fn()

vi.mock('ws', () => {
  class MockWebSocket {
    on = onMock
    send = sendMock
    close = closeMock
  }
  return { default: MockWebSocket }
})

import { QwenASRAdapter } from '../qwen'

const CHUNK = new Uint8Array([1, 2, 3])

beforeEach(() => {
  sendMock.mockClear()
  closeMock.mockClear()
  onMock.mockClear()
})

const createAdapter = (opts: Partial<ConstructorParameters<typeof QwenASRAdapter>[0]> = {}) =>
  new QwenASRAdapter({ apiKey: 'sk-test', model: 'qwen-audio-3.0-asr-flash-streaming', ...opts })

/** 触发 MockWebSocket 上注册的指定事件处理器 */
const trigger = (event: string, data?: unknown) => {
  const handler = onMock.mock.calls.find((c: unknown[]) => c[0] === event)?.[1] as ((d?: unknown) => void) | undefined
  handler?.(data)
}

/** 构造 result-generated 报文 */
const resultEvent = (sentence: {
  text: string
  begin?: boolean
  end?: boolean
  heartbeat?: boolean
}) =>
  JSON.stringify({
    header: { event: 'result-generated' },
    payload: {
      output: {
        sentence: {
          text: sentence.text,
          sentence_begin: sentence.begin === true,
          sentence_end: sentence.end === true,
          heartbeat: sentence.heartbeat === true
        }
      }
    }
  })

describe('QwenASRAdapter', () => {
  it('connect 建立连接并注册 open/error/message/close 监听，open 后 resolve', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    expect(onMock).toHaveBeenCalledWith('open', expect.any(Function))
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function))
    expect(onMock).toHaveBeenCalledWith('message', expect.any(Function))
    expect(onMock).toHaveBeenCalledWith('close', expect.any(Function))
    trigger('open')
    await connected
  })

  it('startSession 发送 run-task 报文（含模型名）', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected

    adapter.startSession()
    const sent = sendMock.mock.calls[0][0]
    expect(typeof sent).toBe('string')
    const msg = JSON.parse(sent)
    expect(msg.header.action).toBe('run-task')
    expect(msg.payload.model).toBe('qwen-audio-3.0-asr-flash-streaming')
    expect(msg.payload.parameters).toEqual({ sample_rate: 16000, format: 'pcm' })
  })

  it('task-started 之前的音频被缓存，事件到达后 flush 发送', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()

    adapter.sendAudio(CHUNK)
    expect(sendMock.mock.calls.length).toBe(1) // 只有 run-task，音频还没发

    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))
    expect(sendMock.mock.calls.length).toBe(2)
    expect(sendMock.mock.calls[1][0]).toEqual(Buffer.from(CHUNK))
  })

  it('task-started 前 finalize：等待事件到达后再发 finish-task，且音频已 flush', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()

    adapter.sendAudio(CHUNK)
    // 未收到 task-started 就收尾：此时不应发 finish-task，而是挂起等待
    const finalText = adapter.stopAndFinalize()
    expect(sendMock.mock.calls.some((c) => String(c[0]).includes('finish-task'))).toBe(false)

    // 事件到达：flush 缓存音频 + 接着发 finish-task
    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))
    expect(sendMock.mock.calls.some((c) => String(c[0]).includes('finish-task'))).toBe(true)
    expect(sendMock.mock.calls.map((c) => c[0]).filter((c) => !String(c).includes('task'))).toContainEqual(
      Buffer.from(CHUNK)
    )

    trigger('message', resultEvent({ text: '结果', end: true }))
    trigger('message', JSON.stringify({ header: { event: 'task-finished' } }))
    await expect(finalText).resolves.toBe('结果')
  })

  it('中间结果增长：onResult 收到逐步补全的文本', async () => {
    const onResult = vi.fn()
    const adapter = createAdapter({ onResult })
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()
    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))

    trigger('message', resultEvent({ text: '你好', begin: true }))
    trigger('message', resultEvent({ text: '你好世界' }))

    expect(onResult.mock.calls.map((c) => c[0])).toEqual(['你好', '你好世界'])
  })

  it('服务端修正改写当前分句（非前缀增长）时直接替换，不产生重复文本', async () => {
    const onResult = vi.fn()
    const adapter = createAdapter({ onResult })
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()
    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))

    // 真机日志复现：partial "你说今天在主" 被修正为 "你说今天在做些什么东西"
    trigger('message', resultEvent({ text: '你说', begin: true }))
    trigger('message', resultEvent({ text: '你说今天在主' }))
    trigger('message', resultEvent({ text: '你说今天在做些什么东西' }))
    trigger('message', resultEvent({ text: '你说今天在做些什么东西呢？', end: true }))

    expect(onResult.mock.calls.at(-1)![0]).toBe('你说今天在做些什么东西呢？')
    // 最终文本不含重复拼接
    const finalText = adapter.stopAndFinalize()
    trigger('message', JSON.stringify({ header: { event: 'task-finished' } }))
    await expect(finalText).resolves.toBe('你说今天在做些什么东西呢？')
  })

  it('多分句：已结束分句落盘，新分句从 sentence_begin 重新累计', async () => {
    const onResult = vi.fn()
    const adapter = createAdapter({ onResult })
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()
    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))

    trigger('message', resultEvent({ text: '你听到我说话了吗？', begin: true }))
    trigger('message', resultEvent({ text: '你听到我说话了吗？', end: true }))
    trigger('message', resultEvent({ text: '', begin: true })) // 第二句句首（空文本）
    trigger('message', resultEvent({ text: '为什么' }))
    trigger('message', resultEvent({ text: '为什么听不到我说话？', end: true }))

    expect(onResult.mock.calls.at(-1)![0]).toBe('你听到我说话了吗？为什么听不到我说话？')

    const finalText = adapter.stopAndFinalize()
    trigger('message', JSON.stringify({ header: { event: 'task-finished' } }))
    await expect(finalText).resolves.toBe('你听到我说话了吗？为什么听不到我说话？')
  })

  it('心跳包（heartbeat=true）被跳过，不触发 onResult', async () => {
    const onResult = vi.fn()
    const adapter = createAdapter({ onResult })
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()
    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))

    trigger('message', resultEvent({ text: '', heartbeat: true }))
    trigger('message', resultEvent({ text: '', heartbeat: true }))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('stopAndFinalize 发送 finish-task，收到 task-finished 后 resolve 完整文本', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()
    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))
    trigger('message', resultEvent({ text: '今天天气' }))

    const finalText = adapter.stopAndFinalize()
    expect(sendMock.mock.calls.at(-1)![0]).toContain('finish-task')

    trigger('message', JSON.stringify({ header: { event: 'task-started' } })) // 无关事件不影响
    trigger('message', JSON.stringify({ header: { event: 'task-finished' } }))
    await expect(finalText).resolves.toBe('今天天气')
  })

  it('连接中断（close）时 finalize 立即返回当前文本，不悬挂', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()
    trigger('message', JSON.stringify({ header: { event: 'task-started' } }))
    trigger('message', resultEvent({ text: '说了半句' }))

    const finalText = adapter.stopAndFinalize()
    trigger('close') // 网络断开
    await expect(finalText).resolves.toBe('说了半句')
  })

  it('task-failed 回调 onError', async () => {
    const onError = vi.fn()
    const adapter = createAdapter({ onError })
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()

    trigger('message', JSON.stringify({ header: { event: 'task-failed', error_message: '鉴权失败' } }))
    expect(onError).toHaveBeenCalledWith('鉴权失败')
  })

  it('close 关闭已建立的连接', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected

    adapter.close()
    expect(closeMock).toHaveBeenCalled()
  })
})
