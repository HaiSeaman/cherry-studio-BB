/**
 * tencentHunyuanVideo.ts Unit Tests
 * 腾讯云混元视频生成适配（TC3 签名 + 提交/轮询）
 */

import type { Provider } from '@renderer/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateHunyuanVideo } from '../tencentHunyuanVideo'

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    })
  }
}))

const baseProvider: Provider = {
  id: 'hunyuan',
  name: '腾讯混元',
  type: 'openai',
  apiKey: 'mock_secret_id:mock_secret_key',
  apiHost: 'https://hunyuan.tencentcloudapi.com/',
  models: [],
  enabled: true
} as unknown as Provider

const baseParams = {
  provider: baseProvider,
  model: 'hunyuan-video',
  prompt: '海浪拍打礁石'
}

const fastPoll = { intervalMs: 0, timeoutMs: 1000 }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetchSequence(responses: Array<() => Response>) {
  let callIndex = 0
  const inits: RequestInit[] = []
  const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
    inits.push(init ?? {})
    const handler = responses[Math.min(callIndex, responses.length - 1)]
    callIndex += 1
    return Promise.resolve(handler())
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, inits }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('generateHunyuanVideo', () => {
  it('文生视频：提交带 TC3 签名头并轮询到 DONE 返回 ResultVideoUrl', async () => {
    const { fetchMock, inits } = mockFetchSequence([
      () => jsonResponse({ Response: { JobId: 'tvjob-1' } }),
      () => jsonResponse({ Response: { Status: 'RUN' } }),
      () => jsonResponse({ Response: { Status: 'DONE', ResultVideoUrl: 'https://cos/video.mp4' } })
    ])

    const onStatus = vi.fn()
    const url = await generateHunyuanVideo({ ...baseParams, resolution: '720p' }, onStatus, fastPoll)

    expect(url).toBe('https://cos/video.mp4')
    // 请求发往官方 vclm 域名
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://vclm.tencentcloudapi.com')
    const submitInit = inits[0]
    expect(submitInit.method).toBe('POST')
    // TC3 签名头齐全（vclm 接口：Action/Version/Region）
    const headers = submitInit.headers as Record<string, string>
    expect(headers['X-TC-Action']).toBe('SubmitHunyuanToVideoJob')
    expect(headers['X-TC-Version']).toBe('2024-05-23')
    expect(headers['X-TC-Region']).toBe('ap-guangzhou')
    expect(headers.Authorization).toMatch(/^TC3-HMAC-SHA256 Credential=mock_secret_id\//)
    // 业务参数进入请求体
    const submitBody = JSON.parse(String(submitInit.body))
    expect(submitBody.Prompt).toBe('海浪拍打礁石')
    expect(submitBody.Resolution).toBe('720p')
    // 轮询请求体带 JobId
    const pollBody = JSON.parse(String(inits[1].body))
    expect(pollBody).toEqual({ JobId: 'tvjob-1' })
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ state: 'running' }))
  })

  it('图生视频：data URL 首帧转为 Image.Base64 字段；http URL 转为 Image.Url', async () => {
    const { inits } = mockFetchSequence([
      () => jsonResponse({ Response: { JobId: 't' } }),
      () => jsonResponse({ Response: { Status: 'DONE', ResultVideoUrl: 'u' } })
    ])

    await generateHunyuanVideo({ ...baseParams, inputImage: 'data:image/png;base64,QUJD' }, undefined, fastPoll)

    const submitBody = JSON.parse(String(inits[0].body))
    expect(submitBody.Image).toEqual({ Base64: 'QUJD' })

    const second = mockFetchSequence([
      () => jsonResponse({ Response: { JobId: 't' } }),
      () => jsonResponse({ Response: { Status: 'DONE', ResultVideoUrl: 'u2' } })
    ])
    await generateHunyuanVideo(
      { ...baseParams, inputImage: 'https://example.com/first.png' },
      undefined,
      fastPoll
    )
    const secondBody = JSON.parse(String(second.inits[0].body))
    expect(secondBody.Image).toEqual({ Url: 'https://example.com/first.png' })
  })

  it('FAIL 状态透出错误信息', async () => {
    mockFetchSequence([
      () => jsonResponse({ Response: { JobId: 't' } }),
      () => jsonResponse({ Response: { Status: 'FAIL', ErrorMessage: '提示词涉及违规内容' } })
    ])

    await expect(generateHunyuanVideo(baseParams, undefined, fastPoll)).rejects.toThrow(/违规/)
  })

  it('apiKey 格式错误给出可操作提示', async () => {
    await expect(
      generateHunyuanVideo(
        { ...baseParams, provider: { ...baseProvider, apiKey: 'only-one-value' } },
        undefined,
        fastPoll
      )
    ).rejects.toThrow(/SecretId:SecretKey/)
  })

  it('超时抛错', async () => {
    mockFetchSequence([
      () => jsonResponse({ Response: { JobId: 't' } }),
      () => jsonResponse({ Response: { Status: 'RUN' } })
    ])

    await expect(generateHunyuanVideo(baseParams, undefined, { intervalMs: 0, timeoutMs: 30 })).rejects.toThrow('超时')
  })
})
