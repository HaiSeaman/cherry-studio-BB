import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  buildTencentEndMessage,
  buildTencentWsUrl,
  parseTencentMessage,
  signTencentQuery
} from '../tencent'

describe('腾讯云实时语音识别（官方 /asr/v2 WebSocket）', () => {
  it('signTencentQuery：HMAC-SHA1 + base64 可复现', () => {
    const params = {
      appid: '125922069',
      secretid: 'AKIDtest',
      secretkey: 'secretkey-test',
      timestamp: 1745932688,
      expired: 1746019088,
      nonce: 8743357,
      engine_model_type: '16k_zh',
      voice_id: 'voice-001',
      voice_format: 1
    }
    const signature = signTencentQuery(params)

    // 独立重算：字典序排序的 query + path 作为签名原文
    const source =
      'asr.cloud.tencent.com/asr/v2/125922069?appid=125922069&engine_model_type=16k_zh&expired=1746019088&nonce=8743357&secretid=AKIDtest&timestamp=1745932688&voice_format=1&voice_id=voice-001'
    const expected = createHmac('sha1', 'secretkey-test').update(source).digest('base64')
    expect(signature).toBe(expected)
  })

  it('buildTencentWsUrl：wss 地址含 appid、签名参数与 urlencode 后的 signature', () => {
    const url = buildTencentWsUrl({
      appid: '125922069',
      secretId: 'AKIDtest',
      secretKey: 'secretkey-test',
      engineModel: '16k_zh',
      voiceId: 'voice-001',
      timestamp: 1745932688,
      expired: 1746019088,
      nonce: 8743357
    })

    expect(url.startsWith('wss://asr.cloud.tencent.com/asr/v2/125922069?')).toBe(true)
    expect(url).toContain('engine_model_type=16k_zh')
    expect(url).toContain('voice_format=1')
    expect(url).toContain('secretid=AKIDtest')
    expect(url).toContain(`signature=${encodeURIComponent(signTencentQuery({
      appid: '125922069',
      secretid: 'AKIDtest',
      secretkey: 'secretkey-test',
      timestamp: 1745932688,
      expired: 1746019088,
      nonce: 8743357,
      engine_model_type: '16k_zh',
      voice_id: 'voice-001',
      voice_format: 1
    }))}`)
  })

  it('buildTencentWsUrl：未传时间参数时自动生成（timestamp/expired/nonce）', () => {
    const url = buildTencentWsUrl({ appid: '1', secretId: 's', secretKey: 'k', engineModel: '16k_zh', voiceId: 'v' })
    expect(url).toContain('timestamp=')
    expect(url).toContain('expired=')
    expect(url).toContain('nonce=')
  })

  it('parseTencentMessage：解析正常结果与 final 标志', () => {
    const msg = parseTencentMessage(
      JSON.stringify({ code: 0, message: 'success', final: 1, result: { slice_type: 2, voice_text_str: '今天天气不错' } })
    )
    expect(msg).toEqual({ code: 0, text: '今天天气不错', final: true, sliceType: 2 })
  })

  it('parseTencentMessage：非稳态结果（slice_type=1）也取文本，供实时回调', () => {
    const msg = parseTencentMessage(
      JSON.stringify({ code: 0, final: 0, result: { slice_type: 1, voice_text_str: '今天' } })
    )
    expect(msg.text).toBe('今天')
    expect(msg.final).toBe(false)
    expect(msg.sliceType).toBe(1)
  })

  it('parseTencentMessage：解析错误码与错误信息', () => {
    const msg = parseTencentMessage(JSON.stringify({ code: 4002, message: '鉴权失败' }))
    expect(msg).toEqual({ code: 4002, text: '', final: false, errorMessage: '鉴权失败' })
  })

  it('buildTencentEndMessage：结束消息格式', () => {
    expect(buildTencentEndMessage()).toBe('{"end":true}')
  })
})