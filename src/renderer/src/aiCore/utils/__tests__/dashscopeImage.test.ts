/**
 * dashscopeImage.ts Unit Tests
 * 阿里云百炼原生图像生成适配的单元测试
 */

import type { Provider } from '@renderer/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateDashScopeImage, getNativeBaseUrl, isDashScopeProvider, toDashScopeSize } from '../dashscopeImage'

// Mock dependencies
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

vi.mock('@renderer/utils', () => ({
  getLowerBaseModelName: (id: string) => id.split('/').pop()!.toLowerCase().replace(':free', '')
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

function mockFetch(responses: Array<(url: string, init?: RequestInit) => Response>) {
  let callIndex = 0
  const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
    const handler = responses[Math.min(callIndex, responses.length - 1)]
    callIndex += 1
    return Promise.resolve(handler(String(url), init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isDashScopeProvider', () => {
  it('按 provider id 识别', () => {
    expect(isDashScopeProvider(baseProvider)).toBe(true)
  })

  it('按 dashscope 域名识别（含 intl/us 与业务空间域名）', () => {
    const custom = { ...baseProvider, id: 'custom' }
    expect(isDashScopeProvider({ ...custom, apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })).toBe(true)
    expect(isDashScopeProvider({ ...custom, apiHost: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' })).toBe(
      true
    )
    expect(
      isDashScopeProvider({ ...custom, apiHost: 'https://llm-x.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' })
    ).toBe(true)
  })

  it('非百炼 provider 返回 false', () => {
    expect(isDashScopeProvider({ ...baseProvider, id: 'openai', apiHost: 'https://api.openai.com/v1' })).toBe(false)
    expect(isDashScopeProvider({ ...baseProvider, id: 'custom', apiHost: 'https://example.com/v1' })).toBe(false)
  })
})

describe('getNativeBaseUrl', () => {
  it('剥离 compatible-mode 与版本段', () => {
    expect(getNativeBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1/')).toBe(
      'https://dashscope.aliyuncs.com'
    )
    expect(getNativeBaseUrl('https://llm-x.cn-beijing.maas.aliyuncs.com/compatible-mode/v1')).toBe(
      'https://llm-x.cn-beijing.maas.aliyuncs.com'
    )
    expect(getNativeBaseUrl('https://dashscope.aliyuncs.com')).toBe('https://dashscope.aliyuncs.com')
  })
})

describe('toDashScopeSize', () => {
  it('OpenAI 像素格式转换为百炼星号格式', () => {
    expect(toDashScopeSize('1024x1024')).toBe('1024*1024')
    expect(toDashScopeSize('1664x928')).toBe('1664*928')
    expect(toDashScopeSize('1024X1024')).toBe('1024*1024')
  })

  it('分辨率缩写原样保留（转大写）', () => {
    expect(toDashScopeSize('2k')).toBe('2K')
    expect(toDashScopeSize('2K')).toBe('2K')
  })

  it('空值返回 undefined', () => {
    expect(toDashScopeSize(undefined)).toBeUndefined()
  })
})

describe('generateDashScopeImage - 同步接口', () => {
  it('文生图：调用 multimodal-generation 端点并返回图片 URL', async () => {
    const fetchMock = mockFetch([
      (_url, init) => {
        expect(init?.method).toBe('POST')
        const body = JSON.parse(String(init?.body))
        expect(body.model).toBe('qwen-image-3.0')
        expect(body.input.messages[0].content).toEqual([{ text: '一只猫' }])
        expect(body.parameters.size).toBe('1024*1024')
        return jsonResponse({
          output: {
            choices: [{ message: { role: 'assistant', content: [{ image: 'https://oss.example.com/a.png' }] } }]
          }
        })
      }
    ])

    const images = await generateDashScopeImage({
      provider: baseProvider,
      model: 'qwen-image-3.0',
      prompt: '一只猫',
      imageSize: '1024x1024',
      batchSize: 1
    })

    expect(images).toEqual(['https://oss.example.com/a.png'])
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
    )
  })

  it('图生图：参考图放入 content 且文本在后', async () => {
    const fetchMock = mockFetch([
      (_url, init) => {
        const body = JSON.parse(String(init?.body))
        expect(body.input.messages[0].content).toEqual([
          { image: 'data:image/png;base64,xxx' },
          { text: '把背景换成海滩' }
        ])
        return jsonResponse({
          output: {
            choices: [{ message: { content: [{ image: 'https://oss.example.com/b.png' }] } }]
          }
        })
      }
    ])

    const images = await generateDashScopeImage({
      provider: baseProvider,
      model: 'wan2.7-image',
      prompt: '把背景换成海滩',
      inputImages: ['data:image/png;base64,xxx'],
      imageSize: '1024x1024'
    })

    expect(images).toEqual(['https://oss.example.com/b.png'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('size 参数报错时去掉 size 重试（服务端不接受 size 的场景）', async () => {
    mockFetch([
      () => jsonResponse({ code: 'InvalidParameter', message: 'size is not supported' }, 400),
      (_url, init) => {
        const body = JSON.parse(String(init?.body))
        expect(body.parameters).not.toHaveProperty('size')
        return jsonResponse({
          output: { choices: [{ message: { content: [{ image: 'https://oss.example.com/c.png' }] } }] }
        })
      }
    ])

    const images = await generateDashScopeImage({
      provider: baseProvider,
      model: 'qwen-image-3.0',
      prompt: 'test',
      imageSize: '1024x1024'
    })

    expect(images).toEqual(['https://oss.example.com/c.png'])
  })
})

describe('generateDashScopeImage - 异步模型不支持图生图', () => {
  it('异步任务模型传入参考图时抛出明确错误（不静默丢弃参考图）', async () => {
    await expect(
      generateDashScopeImage({
        provider: baseProvider,
        model: 'wan2.2-t2i-flash',
        prompt: '把背景换成海滩',
        inputImages: ['data:image/png;base64,xxx']
      })
    ).rejects.toThrow('不支持图生图')
  })
})

describe('generateDashScopeImage - 异步任务接口', () => {
  it('wan2.2-t2i：提交任务后轮询直至成功', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = mockFetch([
        (url, init) => {
          expect(url).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis')
          const headers = init?.headers as Record<string, string> | undefined
          expect(headers?.['X-DashScope-Async']).toBe('enable')
          const body = JSON.parse(String(init?.body))
          expect(body.input).toEqual({ prompt: '一间花店' })
          expect(body.parameters.size).toBe('1024*1024')
          return jsonResponse({ output: { task_id: 'task-123', task_status: 'PENDING' } })
        },
        () => jsonResponse({ output: { task_id: 'task-123', task_status: 'RUNNING' } }),
        () =>
          jsonResponse({
            output: {
              task_id: 'task-123',
              task_status: 'SUCCEEDED',
              results: [{ url: 'https://oss.example.com/d.png' }, { url: 'https://oss.example.com/e.png' }]
            }
          })
      ])

      const promise = generateDashScopeImage({
        provider: baseProvider,
        model: 'wan2.2-t2i-flash',
        prompt: '一间花店',
        imageSize: '1024x1024',
        batchSize: 2
      })
      // 推进两轮轮询间隔（2s x 2）
      await vi.advanceTimersByTimeAsync(2100)
      await vi.advanceTimersByTimeAsync(2100)
      const images = await promise

      expect(images).toEqual(['https://oss.example.com/d.png', 'https://oss.example.com/e.png'])
      expect(fetchMock.mock.calls[1][0]).toBe('https://dashscope.aliyuncs.com/api/v1/tasks/task-123')
    } finally {
      vi.useRealTimers()
    }
  })

  it('任务失败时抛出包含原因的错误', async () => {
    vi.useFakeTimers()
    try {
      mockFetch([
        () => jsonResponse({ output: { task_id: 'task-456', task_status: 'PENDING' } }),
        () =>
          jsonResponse({
            output: { task_id: 'task-456', task_status: 'FAILED', code: 'InternalError', message: '模型推理失败' }
          })
      ])

      const promise = generateDashScopeImage({
        provider: baseProvider,
        model: 'wanx-v1',
        prompt: 'test'
      })
      // 先挂上断言再推进时钟，避免出现未处理的 rejection
      const expectation = expect(promise).rejects.toThrow('模型推理失败')
      await vi.advanceTimersByTimeAsync(2100)
      await expectation
    } finally {
      vi.useRealTimers()
    }
  })

  it('API Key 未配置时抛出明确错误', async () => {
    await expect(
      generateDashScopeImage({
        provider: { ...baseProvider, apiKey: '' },
        model: 'wan2.2-t2i-flash',
        prompt: 'test'
      })
    ).rejects.toThrow('API Key 未配置')
  })
})
