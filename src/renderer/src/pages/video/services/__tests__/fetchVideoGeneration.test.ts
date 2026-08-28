/**
 * fetchVideoGeneration.ts Unit Tests
 * 按服务商路由到对应视频适配器；未适配服务商提前拦截
 */

import type { Provider } from '@renderer/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchVideoGeneration, resolveVideoAdapter } from '../fetchVideoGeneration'

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

const dashscopeMock = vi.fn()
const arkMock = vi.fn()
const hunyuanMock = vi.fn()

vi.mock('@renderer/aiCore/utils/dashscopeVideo', () => ({
  generateDashScopeVideo: (...a: unknown[]) => dashscopeMock(...a)
}))
vi.mock('@renderer/aiCore/utils/arkVideo', () => ({ generateArkVideo: (...a: unknown[]) => arkMock(...a) }))
vi.mock('@renderer/aiCore/utils/tencentHunyuanVideo', () => ({
  generateHunyuanVideo: (...a: unknown[]) => hunyuanMock(...a)
}))

function makeProvider(id: string, apiHost: string): Provider {
  return { id, name: id, type: 'openai', apiKey: 'k', apiHost, models: [] } as unknown as Provider
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('resolveVideoAdapter', () => {
  it('内置 id 优先路由', () => {
    expect(resolveVideoAdapter(makeProvider('dashscope', ''))?.name).toContain('DashScope')
    expect(resolveVideoAdapter(makeProvider('doubao', ''))?.name).toContain('Ark')
    expect(resolveVideoAdapter(makeProvider('hunyuan', ''))?.name).toContain('Hunyuan')
  })

  it('自定义服务商按 API 域名识别', () => {
    expect(
      resolveVideoAdapter(makeProvider('my-custom', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/'))?.name
    ).toContain('DashScope')
    expect(resolveVideoAdapter(makeProvider('my-custom', 'https://ark.example.volces.com/api/v3/'))?.name).toContain(
      'Ark'
    )
    expect(resolveVideoAdapter(makeProvider('my-custom', 'https://hunyuan.tencentcloudapi.com/'))?.name).toContain(
      'Hunyuan'
    )
  })

  it('未知服务商返回 null（调用方拦截）', () => {
    expect(resolveVideoAdapter(makeProvider('openai', 'https://api.openai.com/v1'))).toBeNull()
  })
})

describe('fetchVideoGeneration', () => {
  const params = { model: 'm', prompt: 'p' }

  it('路由到百炼并透传参数', async () => {
    dashscopeMock.mockResolvedValue('https://v/ds.mp4')
    const provider = makeProvider('dashscope', 'https://dashscope.aliyuncs.com')
    const url = await fetchVideoGeneration({ ...params, provider })
    expect(url).toBe('https://v/ds.mp4')
    expect(dashscopeMock).toHaveBeenCalledWith(expect.objectContaining({ provider }), undefined)
  })

  it('路由到 Ark / 腾讯混元', async () => {
    arkMock.mockResolvedValue('u1')
    hunyuanMock.mockResolvedValue('u2')
    await expect(fetchVideoGeneration({ ...params, provider: makeProvider('doubao', '') })).resolves.toBe('u1')
    await expect(fetchVideoGeneration({ ...params, provider: makeProvider('hunyuan', '') })).resolves.toBe('u2')
  })

  it('未适配服务商抛出可读错误且不发起请求', async () => {
    await expect(
      fetchVideoGeneration({ ...params, provider: makeProvider('openai', 'https://api.openai.com/v1') })
    ).rejects.toThrow('该服务商暂不支持视频生成')
    expect(dashscopeMock).not.toHaveBeenCalled()
  })
})
