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
  it('文生视频：提交带 TC3 签名头并轮询到 Done 返回 VideoUrl', async () => {
    const { inits } = mockFetchSequence([
      () => jsonResponse({ Response: { TaskId: 'tvjob-1' } }),
      () => jsonResponse({ Response: { Status: 'Processing' } }),
      () => jsonResponse({ Response: { Status: 'Done', VideoUrl: 'https://cos/video.mp4' } })
    ])

    const onStatus = vi.fn()
    const url = await generateHunyuanVideo({ ...baseParams, resolution: '720p' }, onStatus, fastPoll)

    expect(url).toBe('https://cos/video.mp4')
    const submitInit = inits[0]
    expect(submitInit.method).toBe('POST')
    // TC3 签名头齐全
    const headers = submitInit.headers as Record<string, string>
    expect(headers['X-TC-Action']).toBe('SubmitHunyuanVideoJob')
    expect(headers['X-TC-Version']).toBe('2023-09-01')
    expect(headers.Authorization).toMatch(/^TC3-HMAC-SHA256 Credential=mock_secret_id\//)
    // 业务参数进入请求体
    const submitBody = JSON.parse(String(submitInit.body))
    expect(submitBody.Prompt).toBe('海浪拍打礁石')
    expect(submitBody.Resolution).toBe('720p')
    // 轮询请求体带 TaskId
    const pollBody = JSON.parse(String(inits[1].body))
    expect(pollBody).toEqual({ TaskId: 'tvjob-1' })
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ state: 'running' }))
  })

  it('图生视频：data URL 首帧转为 ImageBase64 字段', async () => {
    const { inits } = mockFetchSequence([
      () => jsonResponse({ Response: { TaskId: 't' } }),
      () => jsonResponse({ Response: { Status: 'Done', VideoUrl: 'u' } })
    ])

    await generateHunyuanVideo({ ...baseParams, inputImage: 'data:image/png;base64,QUJD' }, undefined, fastPoll)

    const submitBody = JSON.parse(String(inits[0].body))
    expect(submitBody.ImageBase64).toBe('QUJD')
  })

  it('Fail 状态透出错误信息', async () => {
    mockFetchSequence([
      () => jsonResponse({ Response: { TaskId: 't' } }),
      () => jsonResponse({ Response: { Status: 'Fail', ErrorMessage: '提示词涉及违规内容' } })
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
      () => jsonResponse({ Response: { TaskId: 't' } }),
      () => jsonResponse({ Response: { Status: 'Processing' } })
    ])

    await expect(generateHunyuanVideo(baseParams, undefined, { intervalMs: 0, timeoutMs: 30 })).rejects.toThrow('超时')
  })
})
