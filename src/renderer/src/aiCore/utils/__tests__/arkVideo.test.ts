/**
 * arkVideo.ts Unit Tests
 * 火山引擎 Ark（Seedance）视频生成适配
 */

import type { Provider } from '@renderer/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateArkVideo, getArkBaseUrl } from '../arkVideo'

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
  id: 'doubao',
  name: '火山引擎（豆包）',
  type: 'openai',
  apiKey: 'ark-test-key',
  apiHost: 'https://ark.cn-beijing.volces.com/api/v3/',
  models: [],
  enabled: true
} as unknown as Provider

const baseParams = {
  provider: baseProvider,
  model: 'doubao-seedance-1-0-lite-t2v-250428',
  prompt: '城市夜景延时摄影'
}

const fastPoll = { intervalMs: 0, timeoutMs: 1000 }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetchSequence(responses: Array<(url: string, init?: RequestInit) => Response>) {
  let callIndex = 0
  const urls: string[] = []
  const inits: RequestInit[] = []
  const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
    urls.push(String(url))
    inits.push(init ?? {})
    const handler = responses[Math.min(callIndex, responses.length - 1)]
    callIndex += 1
    return Promise.resolve(handler(String(url), init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, urls, inits }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getArkBaseUrl', () => {
  it('去掉尾部斜杠', () => {
    expect(getArkBaseUrl('https://ark.cn-beijing.volces.com/api/v3/')).toBe(
      'https://ark.cn-beijing.volces.com/api/v3'
    )
  })

  it('apiHost 未含版本段时自动补 /api/v3', () => {
    expect(getArkBaseUrl('https://ark.cn-beijing.volces.com')).toBe('https://ark.cn-beijing.volces.com/api/v3')
  })
})

describe('generateArkVideo', () => {
  it('文生视频：提交 content.text 含内嵌参数并轮询到 succeeded', async () => {
    const { urls, inits } = mockFetchSequence([
      () => jsonResponse({ id: 'cgt-task-1' }),
      () => jsonResponse({ status: 'queued' }),
      () => jsonResponse({ status: 'running' }),
      () => jsonResponse({ status: 'succeeded', content: { video_url: 'https://tos/video.mp4' } })
    ])

    const onStatus = vi.fn()
    const url = await generateArkVideo({ ...baseParams, duration: '5', resolution: '1080p' }, onStatus, fastPoll)

    expect(url).toBe('https://tos/video.mp4')
    // 提交端点与 Bearer 鉴权
    expect(urls[0]).toBe('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks')
    expect((inits[0].headers as Record<string, string>).Authorization).toBe('Bearer ark-test-key')
    // 参数以内嵌指令形式拼接
    const body = JSON.parse(String(inits[0].body))
    expect(body.model).toBe(baseParams.model)
    expect(body.content[0].text).toContain('城市夜景延时摄影')
    expect(body.content[0].text).toContain('--duration 5')
    expect(body.content[0].text).toContain('--resolution 1080p')
    // 无 image_url 项
    expect(body.content).toHaveLength(1)
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ state: 'running' }))
  })

  it('图生视频：content 追加 image_url 项', async () => {
    const { inits } = mockFetchSequence([
      () => jsonResponse({ id: 't' }),
      () => jsonResponse({ status: 'succeeded', content: { video_url: 'u' } })
    ])

    await generateArkVideo({ ...baseParams, inputImage: 'data:image/png;base64,AAA' }, undefined, fastPoll)

    const body = JSON.parse(String(inits[0].body))
    expect(body.content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } })
  })

  it('failed 状态透出 message', async () => {
    mockFetchSequence([
      () => jsonResponse({ id: 't' }),
      () => jsonResponse({ status: 'failed', error: { message: '内容审核未通过' } })
    ])

    await expect(generateArkVideo(baseParams, undefined, fastPoll)).rejects.toThrow(/内容审核未通过/)
  })

  it('缺少 API Key 给出中文提示', async () => {
    await expect(
      generateArkVideo({ ...baseParams, provider: { ...baseProvider, apiKey: '' } }, undefined, fastPoll)
    ).rejects.toThrow('API Key 未配置')
  })

  it('超时抛错', async () => {
    mockFetchSequence([
      () => jsonResponse({ id: 't' }),
      () => jsonResponse({ status: 'running' })
    ])

    await expect(generateArkVideo(baseParams, undefined, { intervalMs: 0, timeoutMs: 30 })).rejects.toThrow('超时')
  })
})
