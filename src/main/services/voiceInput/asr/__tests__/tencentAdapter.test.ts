import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMock, closeMock, onMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  closeMock: vi.fn(),
  onMock: vi.fn()
}))

vi.mock('ws', () => {
  class MockWebSocket {
    on = onMock
    send = sendMock
    close = closeMock
  }
  return { default: MockWebSocket }
})

import { TencentASRAdapter } from '../tencent'

const trigger = (event: string, data?: unknown) => {
  const handler = onMock.mock.calls.find((c: unknown[]) => c[0] === event)?.[1] as ((d?: unknown) => void) | undefined
  handler?.(data)
}

const message = (code: number, text: string, opts: { final?: number; sliceType?: number } = {}) =>
  JSON.stringify({
    code,
    message: code === 0 ? 'success' : '错误',
    final: opts.final ?? 0,
    result: { slice_type: opts.sliceType ?? 2, voice_text_str: text }
  })

beforeEach(() => {
  sendMock.mockClear()
  closeMock.mockClear()
  onMock.mockClear()
})

const createAdapter = (opts: Partial<ConstructorParameters<typeof TencentASRAdapter>[0]> = {}) =>
  new TencentASRAdapter({
    appid: '125922069',
    secretId: 'AKIDtest',
    secretKey: 'secretkey-test',
    engineModel: '16k_zh',
    ...opts
  })

describe('TencentASRAdapter', () => {
  it('connect 使用带签名参数的地址建立连接', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    expect(onMock).toHaveBeenCalledWith('open', expect.any(Function))
    expect(onMock).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('sendAudio 发送二进制音频块', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected
    adapter.startSession()

    adapter.sendAudio(new Uint8Array([1, 2, 3]))
    expect(sendMock).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
  })

  it('startSession 前的音频被缓存，startSession 后补发', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected

    adapter.sendAudio(new Uint8Array([1, 2, 3]))
    expect(sendMock).not.toHaveBeenCalled()

    adapter.startSession()
    expect(sendMock).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
  })

  it('收到稳态结果（slice_type=2）追加累积；final=1 后 stopAndFinalize resolve 完整文本', async () => {
    const adapter = createAdapter()
    const connected = adapter.connect()
    trigger('open')
    await connected

    const finalText = adapter.stopAndFinalize()
    expect(sendMock).toHaveBeenCalledWith('{"end":true}')

    trigger('message', message(0, '今天天气', { sliceType: 1 }))
    trigger('message', message(0, '今天天气不错。', { sliceType: 2 }))
    trigger('message', message(0, '明天出太阳。', { sliceType: 2 }))
    trigger('message', message(0, '', { final: 1 }))

    await expect(finalText).resolves.toBe('今天天气不错。明天出太阳。')
  })

  it('onResult 实时回调累积文本（多段话拼接）', async () => {
    const onResult = vi.fn()
    const adapter = createAdapter({ onResult })
    const connected = adapter.connect()
    trigger('open')
    await connected

    trigger('message', message(0, '你好'))
    trigger('message', message(0, '你们好'))
    expect(onResult.mock.calls.map((c) => c[0])).toEqual(['你好', '你好你们好'])
  })

  it('code 非 0 时回调 onError', async () => {
    const onError = vi.fn()
    const adapter = createAdapter({ onError })
    const connected = adapter.connect()
    trigger('open')
    await connected

    trigger('message', message(4002, ''))
    expect(onError).toHaveBeenCalledWith('错误')
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