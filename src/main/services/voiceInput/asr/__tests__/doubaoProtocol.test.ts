import { describe, expect, it } from 'vitest'

import { buildClientRequestPayload, buildDoubaoFrame, buildDoubaoHeader, extractDoubaoFrames } from '../doubao'

describe('豆包大模型流式语音识别二进制协议（官方 /api/v3/sauc/bigmodel）', () => {
  it('buildDoubaoHeader：首帧/音频帧/末包音频帧的 4 字节头（version=1, headersize=1 → 0x11 开头）', () => {
    // 首帧：version=1|headersize=1 → 0x11；type=0b0001(request)|flags=0 → 0x10；serial=JSON|comp=0 → 0x10
    expect(Array.from(buildDoubaoHeader('request'))).toEqual([0x11, 0x10, 0x10, 0x00])
    // 音频帧：type=0b0010(audio only), serial=0
    expect(Array.from(buildDoubaoHeader('audio'))).toEqual([0x11, 0x20, 0x00, 0x00])
    // 末包音频帧：flags=0b0010
    expect(Array.from(buildDoubaoHeader('audio-last'))).toEqual([0x11, 0x22, 0x00, 0x00])
  })

  it('buildClientRequestPayload：大模型接口字段（user/audio/request.model_name，无 app 鉴权字段）', () => {
    const payload = JSON.parse(buildClientRequestPayload({ uid: 'u1' }))
    expect(payload.user.uid).toBe('u1')
    expect(payload.audio).toEqual({ format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 })
    expect(payload.request.model_name).toBe('bigmodel')
    // 新版接口鉴权走 HTTP Header，payload 里不再有 app/appid/token/cluster
    expect(payload.app).toBeUndefined()
  })

  it('buildDoubaoFrame：4 字节头 + 4 字节大端长度 + payload', () => {
    const header = buildDoubaoHeader('audio')
    const payload = new Uint8Array([1, 2, 3])
    const frame = buildDoubaoFrame(header, payload)
    expect(frame.length).toBe(4 + 4 + 3)
    expect(Array.from(frame.slice(0, 4))).toEqual([0x11, 0x20, 0x00, 0x00])
    expect(new DataView(frame.buffer, 4, 4).getUint32(0)).toBe(3)
    expect(Array.from(frame.slice(8))).toEqual([1, 2, 3])
  })

  it('extractDoubaoFrames：单帧/粘包/半包解析（无 sequence 扩展头）', () => {
    const frame1 = buildDoubaoFrame(buildDoubaoHeader('request'), new TextEncoder().encode('{"a":1}'))
    const frame2 = buildDoubaoFrame(buildDoubaoHeader('audio'), new Uint8Array([9, 9]))

    // 粘包：两帧合在一起，应拆出两个帧
    const joined = new Uint8Array(frame1.length + frame2.length)
    joined.set(frame1, 0)
    joined.set(frame2, frame1.length)
    const parsed = extractDoubaoFrames(joined)
    expect(parsed.frames).toHaveLength(2)
    expect(parsed.rest.length).toBe(0)

    // 半包：只给前几字节，应无完整帧、剩余保留
    const partial = extractDoubaoFrames(frame1.slice(0, 6))
    expect(partial.frames).toHaveLength(0)
    expect(partial.rest.length).toBe(6)

    // 半包补齐后能解析
    const rest = new Uint8Array([...partial.rest, ...frame1.slice(6)])
    const done = extractDoubaoFrames(rest)
    expect(done.frames).toHaveLength(1)
    expect(new TextDecoder().decode(done.frames[0].payload)).toBe('{"a":1}')
  })

  it('extractDoubaoFrames：服务端响应带 sequence 扩展头（flags=0x01）也能正确解析；flags=0x03 标记末包', () => {
    // 服务端帧：header(type=0x09, flags=0x01) + 4 字节 sequence + 4 字节长度 + payload
    const seqFrames = new Uint8Array([
      0x11,
      0x91,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x01, // sequence = 1
      0x00,
      0x00,
      0x00,
      0x07, // payload 长度 7
      ...new TextEncoder().encode('{"a":1}')
    ])
    const parsed = extractDoubaoFrames(seqFrames)
    expect(parsed.frames).toHaveLength(1)
    expect(new TextDecoder().decode(parsed.frames[0].payload)).toBe('{"a":1}')
    expect(parsed.frames[0].isLast).toBe(false)

    // flags=0x03（末包响应）：sequence 存在且标记末包
    const lastFrame = new Uint8Array([
      0x11,
      0x93,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x0a, // sequence = 10
      0x00,
      0x00,
      0x00,
      0x02,
      ...new TextEncoder().encode('{}')
    ])
    const last = extractDoubaoFrames(lastFrame)
    expect(last.frames[0].isLast).toBe(true)
  })
})