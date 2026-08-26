/**
 * dashscopeVideo.ts Unit Tests
 * 阿里云百炼视频生成适配（异步任务提交 + 轮询）
 */

import type { Provider } from '@renderer/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateDashScopeVideo } from '../dashscopeVideo'

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
  id: 'dashscope',
  name: 'Bailian',
  type: 'openai',
  apiKey: 'sk-test-key',
  apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
  models: [],
  enabled: true
} as unknown as Provider

const baseParams = {
  provider: baseProvider,
  model: 'wan2.6-t2v-plus',
  prompt: '一只猫在草地上奔跑'
}

const fastPoll = { intervalMs: 0, timeoutMs: 1000 }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** 按调用次序依次返回响应序列 */
function mockFetchSequence(responses: Array<(url: string, init?: RequestInit) => Response>) {
  let callIndex = 0
  const urls: string[] = []
  const bodies: unknown[] = []
  const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
    urls.push(String(url))
    if (init?.body) {
      try {
        bodies.push(JSON.parse(String(init.body)))
      } catch {
        bodies.push(undefined)
      }
    }
    const handler = responses[Math.min(callIndex, responses.length - 1)]
    callIndex += 1
    return Promise.resolve(handler(String(url), init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, urls, bodies }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('generateDashScopeVideo', () => {
  it('提交任务后轮询至 SUCCEEDED 并返回 video_url', async () => {
    const { urls, bodies } = mockFetchSequence([
      () => jsonResponse({ output: { task_id: 'task-123', task_status: 'PENDING' } }),
      () => jsonResponse({ output: { task_id: 'task-123', task_status: 'RUNNING' } }),
      () => jsonResponse({ output: { task_status: 'SUCCEEDED', video_url: 'https://oss/video.mp4' } })
    ])

    const onStatus = vi.fn()
    const url = await generateDashScopeVideo(baseParams, onStatus, fastPoll)

    expect(url).toBe('https://oss/video.mp4')
    // 提交走原生视频合成端点并带异步头
    expect(urls[0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
    const submitInit = JSON.stringify(bodies[0])
    expect(submitInit).toContain('"prompt"')
    // 轮询走 tasks 端点
    expect(urls[1]).toBe('https://dashscope.aliyuncs.com/api/v1/tasks/task-123')
    // 状态回调至少上报过 queued 与 running
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ state: 'queued' }))
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ state: 'running' }))
  })

  it('图生视频把首帧图放入 input.img_url', async () => {
    const { bodies } = mockFetchSequence([
      () => jsonResponse({ output: { task_id: 't', task_status: 'SUCCEEDED' }, output2: null }),
      () => jsonResponse({ output: { task_status: 'SUCCEEDED', video_url: 'u' } })
    ])

    await generateDashScopeVideo({ ...baseParams, inputImage: 'data:image/png;base64,AAA' }, undefined, fastPoll)

    expect((bodies[0] as { input: { img_url: string } }).input.img_url).toBe('data:image/png;base64,AAA')
  })

  it('duration/resolution 参数进入 parameters', async () => {
    const { bodies } = mockFetchSequence([
      () => jsonResponse({ output: { task_id: 't', task_status: 'SUCCEEDED' } }),
      () => jsonResponse({ output: { task_status: 'SUCCEEDED', video_url: 'u' } })
    ])

    await generateDashScopeVideo(
      { ...baseParams, duration: '5', resolution: '720p' },
      undefined,
      fastPoll
    )

    const parameters = (bodies[0] as { parameters: Record<string, unknown> }).parameters
    expect(parameters.duration).toBe(5)
    // 百炼要求大写 P（'1080P'/'720P'/'480P'），对话框小写值归一化
    expect(parameters.resolution).toBe('720P')
  })

  it('全能参考模型（wan3.x）走 input.media 协议并携带 ratio', async () => {
    const { bodies } = mockFetchSequence([
      () => jsonResponse({ output: { task_id: 't', task_status: 'SUCCEEDED' } }),
      () => jsonResponse({ output: { task_status: 'SUCCEEDED', video_url: 'u' } })
    ])

    await generateDashScopeVideo(
      {
        ...baseParams,
        model: 'wan3.0-video',
        inputImage: 'data:image/png;base64,AAA',
        aspectRatio: '16:9',
        resolution: '1080p'
      },
      undefined,
      fastPoll
    )

    const input = (bodies[0] as { input: { media?: Array<{ type: string; url: string }>; img_url?: string } }).input
    expect(input.media).toEqual([{ type: 'reference_image', url: 'data:image/png;base64,AAA' }])
    expect(input.img_url).toBeUndefined()
    const parameters = (bodies[0] as { parameters: Record<string, unknown> }).parameters
    expect(parameters.ratio).toBe('16:9')
    expect(parameters.resolution).toBe('1080P')
  })

  it('服务端要求 input.media 时给出可操作提示且不去参重试', async () => {
    const { fetchMock } = mockFetchSequence([
      () =>
        jsonResponse(
          { code: 'InvalidParameter', message: 'Field required: input.media & Input should be a valid string' },
          400
        )
    ])

    await expect(generateDashScopeVideo({ ...baseParams, model: 'wan3.0-video' }, undefined, fastPoll)).rejects.toThrow(
      /参考生视频|上传首帧/
    )
    // 未触发去参重试：只发了一次提交请求
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('FAILED 任务透出 code 与 message', async () => {
    mockFetchSequence([
      () => jsonResponse({ output: { task_id: 't', task_status: 'PENDING' } }),
      () =>
        jsonResponse({
          output: { task_status: 'FAILED', code: 'Arrearage', message: '余额不足，请充值后重试' }
        })
    ])

    await expect(generateDashScopeVideo(baseParams, undefined, fastPoll)).rejects.toThrow(/余额不足/)
  })

  it('提交缺少 API Key 时给出中文提示', async () => {
    await expect(
      generateDashScopeVideo({ ...baseParams, provider: { ...baseProvider, apiKey: '' } }, undefined, fastPoll)
    ).rejects.toThrow('API Key 未配置')
  })

  it('轮询超时抛出超时错误', async () => {
    mockFetchSequence([
      () => jsonResponse({ output: { task_id: 't', task_status: 'PENDING' } }),
      () => jsonResponse({ output: { task_id: 't', task_status: 'RUNNING' } })
    ])

    await expect(
      generateDashScopeVideo(baseParams, undefined, { intervalMs: 0, timeoutMs: 30 })
    ).rejects.toThrow('超时')
  })

  it('提交失败透出服务端错误信息', async () => {
    mockFetchSequence([() => jsonResponse({ code: 'InvalidApiKey', message: 'Invalid API-key provided.' }, 401)])

    await expect(generateDashScopeVideo(baseParams, undefined, fastPoll)).rejects.toThrow(/InvalidApiKey|401/)
  })
})
