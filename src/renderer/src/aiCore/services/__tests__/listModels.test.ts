/**
 * ModelListService conversion tests
 * Uses real API responses captured from providers to verify model conversion
 */
import type { Provider } from '@renderer/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetFromApi = vi.fn()
const mockToastError = vi.fn()
const createMockStoreState = () => ({
  llm: {
    settings: {}
  }
})
let mockStoreState = createMockStoreState()
vi.mock('@ai-sdk/provider-utils', () => ({
  createJsonResponseHandler: vi.fn(() => 'json-handler'),
  createJsonErrorResponseHandler: vi.fn(() => 'error-handler'),
  getFromApi: (...args: unknown[]) => mockGetFromApi(...args),
  zodSchema: vi.fn((s: unknown) => s)
}))

vi.mock('@renderer/utils', () => ({
  formatApiHost: (host: string) => host?.replace(/\/$/, ''),
  getDefaultGroupName: (id: string, provider?: string) => {
    const parts = id.toLowerCase().split(/[-_]/)
    return provider && parts.length > 1 ? `${parts[0]}-${parts[1]}` : id.toLowerCase()
  },
  withoutTrailingSlash: (s: string) => s?.replace(/\/$/, ''),
  getLowerBaseModelName: (id: string) => id.toLowerCase()
}))

vi.mock('@renderer/utils/provider', () => ({
  isGeminiProvider: (p: Provider) => p.id === 'gemini' || p.type === 'gemini',
  isOllamaProvider: (p: Provider) => p.id === 'ollama' || p.type === 'ollama'
}))

vi.mock('@shared/utils', () => ({
  defaultAppHeaders: () => ({ 'X-App': 'CherryStudio' })
}))

vi.mock('@renderer/store', () => ({
  default: {
    getState: () => mockStoreState
  }
}))

const { listModels } = await import('../listModels')
const { OllamaTagsResponseSchema } = await import('../schemas')

// === Real API response fixtures (captured 2026-03-19) ===

// From https://openrouter.ai/api/v1/models (public, no auth)
const REAL_OPENROUTER = {
  data: [
    { id: 'xiaomi/mimo-v2-omni', object: 'model', created: 1773863703, owned_by: null },
    { id: 'xiaomi/mimo-v2-pro', object: 'model', created: 1773863643, owned_by: null },
    { id: 'minimax/minimax-m2.7', object: 'model', created: 1773836697, owned_by: null },
    { id: 'openai/gpt-5.4-nano', object: 'model', created: 1773748187, owned_by: null },
    { id: 'openai/gpt-5.4-mini', object: 'model', created: 1773748178, owned_by: null },
    { id: 'mistralai/mistral-small-2603', object: 'model', created: 1773695685, owned_by: null },
    { id: 'z-ai/glm-5-turbo', object: 'model', created: 1773583573, owned_by: null },
    { id: 'x-ai/grok-4.20-multi-agent-beta', object: 'model', created: 1773325367, owned_by: null }
  ]
}

// From https://api.deepseek.com/v1/models
const REAL_DEEPSEEK = {
  object: 'list',
  data: [
    { id: 'deepseek-chat', object: 'model', owned_by: 'deepseek' },
    { id: 'deepseek-reasoner', object: 'model', owned_by: 'deepseek' }
  ]
}

// From https://generativelanguage.googleapis.com/v1beta/models
const REAL_GEMINI = {
  models: [
    {
      name: 'models/gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      description:
        'Stable version of Gemini 2.5 Flash, our mid-size multimodal model that supports up to 1 million tokens, released in June of 2025.'
    },
    {
      name: 'models/gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro',
      description: 'Stable release (June 17th, 2025) of Gemini 2.5 Pro'
    },
    {
      name: 'models/gemini-2.0-flash',
      displayName: 'Gemini 2.0 Flash',
      description: 'Gemini 2.0 Flash'
    },
    {
      name: 'models/gemini-2.0-flash-001',
      displayName: 'Gemini 2.0 Flash 001',
      description:
        'Stable version of Gemini 2.0 Flash, our fast and versatile multimodal model for scaling across diverse tasks, released in January of 2025.'
    },
    {
      name: 'models/gemini-2.0-flash-lite-001',
      displayName: 'Gemini 2.0 Flash-Lite 001',
      description: 'Stable version of Gemini 2.0 Flash-Lite'
    },
    {
      name: 'models/gemini-2.0-flash-lite',
      displayName: 'Gemini 2.0 Flash-Lite',
      description: 'Gemini 2.0 Flash-Lite'
    }
  ]
}

// From https://api.anthropic.com/v1/models
const REAL_ANTHROPIC = {
  data: [
    {
      id: 'claude-opus-4-8-20260101',
      display_name: 'Claude Opus 4.8',
      created_at: '2026-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'claude-sonnet-4-5-20250929',
      display_name: 'Claude Sonnet 4.5',
      created_at: '2025-09-29T00:00:00Z',
      type: 'model'
    }
  ],
  has_more: false,
  first_id: 'claude-opus-4-8-20260101',
  last_id: 'claude-sonnet-4-5-20250929'
}

// From https://api.together.xyz/v1/models
const REAL_TOGETHER = [
  { id: 'hexgrad/Kokoro-82M', display_name: 'Kokoro 82M', organization: 'Hexgrad', description: null },
  { id: 'cartesia/sonic', display_name: 'Cartesia Sonic', organization: 'Cartesia', description: null },
  {
    id: 'black-forest-labs/FLUX.1-krea-dev',
    display_name: 'FLUX.1 Krea [dev]',
    organization: 'Black Forest Labs',
    description: null
  },
  {
    id: 'google/imagen-4.0-preview',
    display_name: 'Google Imagen 4.0 Preview',
    organization: 'Google',
    description: null
  },
  { id: 'cartesia/sonic-2', display_name: 'Cartesia Sonic 2', organization: 'Cartesia', description: null }
]

// From https://api.siliconflow.cn/v1/models
const REAL_SILICONFLOW = {
  object: 'list',
  data: [
    { id: 'Pro/MiniMaxAI/MiniMax-M2.5', object: 'model', created: 1773863703, owned_by: '' },
    { id: 'Pro/zai-org/GLM-5', object: 'model', created: 1773863703, owned_by: '' },
    { id: 'Pro/moonshotai/Kimi-K2.5', object: 'model', created: 1773863703, owned_by: '' },
    { id: 'Pro/zai-org/GLM-4.7', object: 'model', created: 1773863703, owned_by: '' },
    { id: 'deepseek-ai/DeepSeek-V3.2', object: 'model', created: 1773863703, owned_by: '' },
    { id: 'Pro/deepseek-ai/DeepSeek-V3.2', object: 'model', created: 1773863703, owned_by: '' }
  ]
}

// From https://api.groq.com/openai/v1/models
const REAL_GROQ = {
  object: 'list',
  data: [
    { id: 'qwen/qwen3-32b', object: 'model', created: 1773863703, owned_by: 'Alibaba Cloud' },
    { id: 'groq/compound-mini', object: 'model', created: 1773863703, owned_by: 'Groq' }
  ]
}

// From https://api.ppio.ai/v1/models (chat endpoint)
const REAL_PPIO_CHAT = {
  object: 'list',
  data: [
    { id: 'minimax/minimax-m2.7', object: 'model', created: 1773863703, owned_by: 'unknown' },
    { id: 'minimax/minimax-m2.5-highspeed', object: 'model', created: 1773863703, owned_by: 'unknown' },
    { id: 'qwen/qwen3.5-27b', object: 'model', created: 1773863703, owned_by: 'unknown' },
    { id: 'qwen/qwen3.5-122b-a10b', object: 'model', created: 1773863703, owned_by: 'unknown' },
    { id: 'qwen/qwen3.5-35b-a3b', object: 'model', created: 1773863703, owned_by: 'unknown' }
  ]
}

// From https://ai-gateway.vercel.sh/v3/ai/config (Vercel AI Gateway model registry)
const REAL_VERCEL_GATEWAY = {
  models: [
    {
      id: 'alibaba/qwen3-max',
      name: 'Qwen3 Max',
      description: 'The Qwen 3 series Max model.',
      modelType: 'language',
      tags: ['tool-use', 'implicit-caching'],
      specification: {
        specificationVersion: 'v3',
        provider: 'alibaba',
        modelId: 'alibaba/qwen3-max',
        type: 'language'
      },
      pricing: { input: '0.0000012', output: '0.000006' }
    },
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      modelType: 'language',
      specification: {
        specificationVersion: 'v3',
        provider: 'openai',
        modelId: 'openai/gpt-4o'
      }
    },
    {
      id: 'openai/text-embedding-3-large',
      modelType: 'embedding',
      specification: {
        specificationVersion: 'v3',
        provider: 'openai',
        modelId: 'openai/text-embedding-3-large'
      }
    }
  ]
}

// From https://aihubmix.com/api/v1/models (custom schema with model_id/model_name)
const REAL_AIHUBMIX = {
  data: [
    {
      model_id: 'qwen3.6-plus',
      model_name: 'Qwen3.6 Plus',
      developer_id: 13,
      desc: 'Qwen 3.6, the native vision-language Plus series model.',
      pricing: { cache_read: 0.0282, cache_write: 0.3525, input: 0.282, output: 1.692 },
      types: 'llm',
      features: 'tools,function_calling,structured_outputs,web,long_context,thinking',
      input_modalities: 'text,image,video',
      endpoints: '',
      max_output: 64000,
      context_length: 991000
    },
    {
      model_id: 'claude-sonnet-4-6',
      model_name: 'Claude Sonnet 4.6',
      desc: 'Claude Sonnet 4.6 delivers frontier intelligence at scale.',
      types: 'llm',
      context_length: 200000
    },
    {
      model_id: 'gpt-5.4',
      model_name: 'GPT 5.4',
      desc: 'GPT-5.4 is our frontier model for complex professional work.',
      types: 'llm',
      context_length: 400000
    },
    {
      model_id: 'doubao-seedance-2-0-260128',
      model_name: 'Doubao Seedance 2.0 260128',
      desc: 'A new-generation professional-grade multimodal video-creation model.',
      types: 'video'
    }
  ]
}

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    type: 'openai',
    apiKey: 'sk-test',
    apiHost: 'https://api.test.com',
    models: [],
    isSystem: true,
    enabled: true,
    ...overrides
  } as Provider
}

function assertValidModels(models: { id: string; name: string; provider: string; group: string }[]) {
  expect(models.length).toBeGreaterThan(0)
  for (const m of models) {
    expect(m.id).toBeTruthy()
    expect(typeof m.id).toBe('string')
    expect(m.id).toBe(m.id.trim())
    expect(m.name).toBeTruthy()
    expect(typeof m.provider).toBe('string')
    expect(typeof m.group).toBe('string')
  }
}

// === Tests ===

beforeEach(() => {
  mockGetFromApi.mockReset()
  mockToastError.mockReset()
  mockStoreState = createMockStoreState()
  vi.stubGlobal('window', {
    ...globalThis.window,
    keyv: { get: vi.fn(), set: vi.fn() },
    toast: {
      error: mockToastError
    },
    api: {}
  })
})

describe('listModels', () => {
  describe('OpenAI-compatible (DeepSeek)', () => {
    it('should convert real DeepSeek response', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_DEEPSEEK })
      const models = await listModels(makeProvider({ id: 'deepseek' }))
      assertValidModels(models)
      expect(models).toMatchSnapshot()
    })

    it('should infer model groups from ids for custom UUID providers', async () => {
      const providerId = '9d08892b-3023-4b98-8c69-8032eec3dc98'
      mockGetFromApi.mockResolvedValue({
        value: {
          data: [
            { id: 'gemini-2.5-flash', object: 'model', owned_by: 'google' },
            { id: 'gpt-4.1-mini', object: 'model', owned_by: 'openai' }
          ]
        }
      })

      const models = await listModels(makeProvider({ id: providerId, isSystem: false }))

      expect(models).toHaveLength(2)
      expect(models.map((model) => model.group)).toEqual(['gemini-2.5', 'gpt-4.1'])
      expect(models.map((model) => model.group)).not.toContain(providerId)
    })
  })

  describe('OpenAI-compatible (SiliconFlow)', () => {
    it('should handle nested slash IDs for group extraction', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_SILICONFLOW })
      const models = await listModels(makeProvider({ id: 'silicon' }))
      assertValidModels(models)
      // "Pro/MiniMaxAI/MiniMax-M2.5" -> group "Pro"
      expect(models[0].group).toBe('Pro')
      // "deepseek-ai/DeepSeek-V3.2" -> group "deepseek-ai"
      expect(models[4].group).toBe('deepseek-ai')
      expect(models).toMatchSnapshot()
    })
  })

  describe('OpenAI-compatible (Groq)', () => {
    it('should convert real Groq response with owned_by', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_GROQ })
      const models = await listModels(makeProvider({ id: 'groq' }))
      assertValidModels(models)
      expect(models[0].owned_by).toBe('Alibaba Cloud')
      expect(models[1].owned_by).toBe('Groq')
      expect(models).toMatchSnapshot()
    })
  })

  describe('Gemini', () => {
    it('should strip models/ prefix and use displayName from real response', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_GEMINI })
      const models = await listModels(
        makeProvider({ id: 'gemini', type: 'gemini', apiHost: 'https://generativelanguage.googleapis.com/v1beta' })
      )
      assertValidModels(models)
      for (const m of models) {
        expect(m.id).not.toMatch(/^models\//)
      }
      // displayName should be used as name
      expect(models[0].name).toBe('Gemini 2.5 Flash')
      expect(models[0].id).toBe('gemini-2.5-flash')
      expect(models).toMatchSnapshot()
    })

    it('should encode special characters in API key query parameter', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_GEMINI })

      await listModels(
        makeProvider({
          id: 'gemini',
          type: 'gemini',
          apiHost: 'https://generativelanguage.googleapis.com/v1beta',
          apiKey: 'AIzaSyABC&DEF=xyz+123'
        })
      )

      const [request] = mockGetFromApi.mock.calls[0]
      expect(request.url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyABC%26DEF%3Dxyz%2B123'
      )
      expect(new URL(request.url).searchParams.get('key')).toBe('AIzaSyABC&DEF=xyz+123')
      expect(Array.from(new URL(request.url).searchParams.keys())).toEqual(['key'])
    })
  })

  describe('Anthropic', () => {
    it('should list Anthropic models from the native /v1/models endpoint', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_ANTHROPIC })

      const models = await listModels(
        makeProvider({ id: 'anthropic', type: 'anthropic' as any, apiHost: 'https://api.anthropic.com/v1' })
      )

      expect(mockGetFromApi).toHaveBeenCalledTimes(1)
      const [request] = mockGetFromApi.mock.calls[0]
      expect(request).toMatchObject({
        url: 'https://api.anthropic.com/v1/models?limit=1000',
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'sk-test'
        })
      })
      assertValidModels(models)
      expect(models.map((m) => m.id)).toEqual(['claude-opus-4-8-20260101', 'claude-sonnet-4-5-20250929'])
      expect(models[0]).toMatchObject({
        name: 'Claude Opus 4.8',
        provider: 'anthropic',
        group: 'anthropic',
        owned_by: 'anthropic'
      })
    })

    it('should paginate Anthropic model list results via after_id', async () => {
      mockGetFromApi
        .mockResolvedValueOnce({
          value: {
            data: [REAL_ANTHROPIC.data[0]],
            has_more: true,
            last_id: REAL_ANTHROPIC.data[0].id
          }
        })
        .mockResolvedValueOnce({
          value: {
            data: [REAL_ANTHROPIC.data[1]],
            has_more: false
          }
        })

      const models = await listModels(
        makeProvider({ id: 'anthropic', type: 'anthropic' as any, apiHost: 'https://api.anthropic.com/v1' })
      )

      expect(mockGetFromApi).toHaveBeenCalledTimes(2)
      expect(mockGetFromApi.mock.calls[1][0].url).toBe(
        'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-opus-4-8-20260101'
      )
      expect(models.map((m) => m.id)).toEqual(['claude-opus-4-8-20260101', 'claude-sonnet-4-5-20250929'])
    })
  })

  describe('Together', () => {
    it('should use display_name and organization from real response', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_TOGETHER })
      const models = await listModels(makeProvider({ id: 'together' }))
      assertValidModels(models)
      expect(models[0].name).toBe('Kokoro 82M')
      expect(models[0].owned_by).toBe('Hexgrad')
      expect(models[0].group).toBe('hexgrad')
      // FLUX model with org "Black Forest Labs"
      expect(models[2].name).toBe('FLUX.1 Krea [dev]')
      expect(models[2].owned_by).toBe('Black Forest Labs')
      expect(models).toMatchSnapshot()
    })
  })

  describe('OpenRouter', () => {
    it('should merge chat and embedding endpoints from real response', async () => {
      mockGetFromApi
        .mockResolvedValueOnce({ value: REAL_OPENROUTER })
        .mockResolvedValueOnce({ value: { data: [{ id: 'openai/text-embedding-3-large', object: 'model' }] } })
      const models = await listModels(makeProvider({ id: 'openrouter' }))
      assertValidModels(models)
      expect(models).toHaveLength(REAL_OPENROUTER.data.length + 1)
      // Slash IDs should produce correct group
      expect(models.find((m) => m.id === 'xiaomi/mimo-v2-omni')?.group).toBe('xiaomi')
      expect(models.find((m) => m.id === 'openai/gpt-5.4-nano')?.group).toBe('openai')
      expect(models.find((m) => m.id === 'x-ai/grok-4.20-multi-agent-beta')?.group).toBe('x-ai')
      expect(models).toMatchSnapshot()
    })

    it('should deduplicate across endpoints', async () => {
      mockGetFromApi
        .mockResolvedValueOnce({ value: { data: [REAL_OPENROUTER.data[0]] } })
        .mockResolvedValueOnce({ value: { data: [REAL_OPENROUTER.data[0]] } })
      const models = await listModels(makeProvider({ id: 'openrouter' }))
      expect(models).toHaveLength(1)
    })

    it('should handle embedding endpoint failure', async () => {
      mockGetFromApi.mockResolvedValueOnce({ value: REAL_OPENROUTER }).mockRejectedValueOnce(new Error('404 Not Found'))
      const models = await listModels(makeProvider({ id: 'openrouter' }))
      expect(models).toHaveLength(REAL_OPENROUTER.data.length)
    })
  })

  describe('PPIO', () => {
    it('should merge all three endpoints from real response', async () => {
      mockGetFromApi
        .mockResolvedValueOnce({ value: REAL_PPIO_CHAT })
        .mockResolvedValueOnce({ value: { data: [{ id: 'BAAI/bge-m3', object: 'model', owned_by: 'BAAI' }] } })
        .mockResolvedValueOnce({
          value: { data: [{ id: 'BAAI/bge-reranker-v2-m3', object: 'model', owned_by: 'BAAI' }] }
        })
      const models = await listModels(makeProvider({ id: 'ppio' }))
      assertValidModels(models)
      expect(models).toHaveLength(7)
      expect(models.find((m) => m.id === 'BAAI/bge-m3')?.group).toBe('BAAI')
      expect(models).toMatchSnapshot()
    })

    it('should handle partial endpoint failures', async () => {
      mockGetFromApi
        .mockResolvedValueOnce({ value: REAL_PPIO_CHAT })
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
      const models = await listModels(makeProvider({ id: 'ppio' }))
      expect(models).toHaveLength(REAL_PPIO_CHAT.data.length)
    })
  })

  describe('AIHubMix', () => {
    it('should convert real AIHubMix response with model_id and model_name', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_AIHUBMIX })
      const models = await listModels(makeProvider({ id: 'aihubmix' }))
      assertValidModels(models)
      expect(models).toHaveLength(4)
      // model_name should be used as name
      expect(models[0].name).toBe('Qwen3.6 Plus')
      expect(models[0].id).toBe('qwen3.6-plus')
      expect(models[0].description).toBe('Qwen 3.6, the native vision-language Plus series model.')
      // No slash in ID -> group falls back to provider id
      expect(models[0].group).toBe('aihubmix')
      expect(models[1].name).toBe('Claude Sonnet 4.6')
      expect(models[2].name).toBe('GPT 5.4')
      expect(models[3].name).toBe('Doubao Seedance 2.0 260128')
      expect(models).toMatchSnapshot()
    })

    it('should deduplicate by model_id', async () => {
      const duped = {
        ...REAL_AIHUBMIX,
        data: [REAL_AIHUBMIX.data[0], REAL_AIHUBMIX.data[0], REAL_AIHUBMIX.data[1]]
      }
      mockGetFromApi.mockResolvedValue({ value: duped })
      const models = await listModels(makeProvider({ id: 'aihubmix' }))
      expect(models).toHaveLength(2)
    })

    it('should build the models URL from the configured base URL, stripping a trailing /v1', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_AIHUBMIX })
      await listModels(makeProvider({ id: 'aihubmix', apiHost: 'https://custom.example.com/v1' }))
      expect(mockGetFromApi).toHaveBeenCalledTimes(1)
      const [request] = mockGetFromApi.mock.calls[0]
      expect(request.url).toBe('https://custom.example.com/api/v1/models')
    })
  })

  describe('Ollama', () => {
    it('should accept null families in Ollama tags schema', () => {
      const parsed = OllamaTagsResponseSchema.parse({
        models: [
          {
            name: 'glm-5:cloud',
            model: 'glm-5:cloud',
            details: {
              parent_model: '',
              format: '',
              family: '',
              families: null,
              parameter_size: '',
              quantization_level: ''
            }
          }
        ]
      })

      expect(parsed.models[0].details?.families).toBeUndefined()
    })

    it('should accept null families in real Ollama tag responses', async () => {
      mockGetFromApi.mockResolvedValue({
        value: {
          models: [
            {
              name: 'glm-5:cloud',
              model: 'glm-5:cloud',
              details: {
                parent_model: '',
                format: '',
                family: '',
                families: null,
                parameter_size: '',
                quantization_level: ''
              }
            },
            {
              name: 'qwen3.5:9b',
              model: 'qwen3.5:9b',
              details: {
                family: 'qwen35',
                families: ['qwen35']
              }
            }
          ]
        }
      })

      const models = await listModels(makeProvider({ id: 'ollama', type: 'ollama', apiHost: 'http://localhost:11434' }))
      assertValidModels(models)
      expect(models.map((m) => m.id)).toEqual(['glm-5:cloud', 'qwen3.5:9b'])
    })
  })

  describe('Vercel AI Gateway', () => {
    it('should hit /v3/ai/config and normalize entries', async () => {
      mockGetFromApi.mockResolvedValue({ value: REAL_VERCEL_GATEWAY })
      const models = await listModels(
        makeProvider({
          id: 'gateway',
          type: 'gateway' as any,
          apiHost: 'https://ai-gateway.vercel.sh/v1/ai',
          apiKey: 'sk-gw'
        })
      )

      expect(mockGetFromApi).toHaveBeenCalledTimes(1)
      const [request] = mockGetFromApi.mock.calls[0]
      expect(request).toMatchObject({
        url: 'https://ai-gateway.vercel.sh/v3/ai/config',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-gw',
          'ai-gateway-protocol-version': '0.0.1'
        })
      })
      assertValidModels(models)
      expect(models).toHaveLength(3)
      expect(models[0]).toMatchObject({
        id: 'alibaba/qwen3-max',
        name: 'Qwen3 Max',
        provider: 'gateway',
        group: 'alibaba',
        owned_by: 'alibaba',
        description: 'The Qwen 3 series Max model.'
      })
      expect(models[2].name).toBe('openai/text-embedding-3-large')
    })

    it('should fall back to id when name is missing and deduplicate', async () => {
      mockGetFromApi.mockResolvedValue({
        value: {
          models: [
            { id: 'openai/gpt-4o', specification: { provider: 'openai' } },
            { id: 'openai/gpt-4o', specification: { provider: 'openai' } }
          ]
        }
      })
      const models = await listModels(
        makeProvider({ id: 'gateway', type: 'gateway' as any, apiHost: 'https://ai-gateway.vercel.sh/v1/ai' })
      )
      expect(models).toHaveLength(1)
      expect(models[0].name).toBe('openai/gpt-4o')
    })
  })

  describe('Unsupported providers', () => {
    it.each([['aws-bedrock', { id: 'aws-bedrock' }]])('should return empty for %s', async (_, overrides) => {
      const models = await listModels(makeProvider(overrides as any))
      expect(models).toEqual([])
      expect(mockGetFromApi).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('should return empty on network error', async () => {
      mockGetFromApi.mockRejectedValue(new Error('ECONNREFUSED'))
      const models = await listModels(makeProvider({ id: 'openai' }))
      expect(models).toEqual([])
    })
  })
})
