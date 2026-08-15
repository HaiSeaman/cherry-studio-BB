import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/services/LoggerService', () => ({
  loggerService: {
    withContext: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}))

vi.mock('@renderer/services/AssistantService', () => ({
  getProviderByModel: vi.fn(),
  getAssistantSettings: vi.fn(),
  getDefaultAssistant: vi.fn().mockReturnValue({
    id: 'default',
    name: 'Default Assistant',
    prompt: '',
    settings: {}
  })
}))

vi.mock('@renderer/services/ProviderService', () => ({
  getProviderById: vi.fn()
}))

vi.mock('@renderer/store', () => {
  const mockGetState = vi.fn()
  return {
    default: { getState: mockGetState },
    __mockGetState: mockGetState
  }
})

import type { OpenAICompatibleProviderSettings } from '@ai-sdk/openai-compatible'
import type { ProviderConfig } from '@renderer/aiCore/types'
import { getProviderByModel } from '@renderer/services/AssistantService'
import type { Model, Provider } from '@renderer/types'

import type { AihubmixProviderSettings } from '../custom/aihubmix-provider'
import type { NewApiProviderSettings } from '../custom/newapi-provider'
import { adaptProvider, formatProviderApiHost, getActualProvider, providerToAiSdkConfig } from '../providerConfig'

const { __mockGetState: mockGetState } = vi.mocked(await import('@renderer/store')) as unknown as {
  __mockGetState: ReturnType<typeof vi.fn>
}

// ==================== Helpers ====================

const createWindowKeyv = () => {
  const store = new Map<string, string>()
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: string) => {
      store.set(key, value)
    }
  }
}

interface WindowMockApi {
  cherryai?: { generateSignature: ReturnType<typeof vi.fn> }
}

const setupWindowMock = (options?: { withCherryAI?: boolean }) => {
  const api: WindowMockApi = {}
  if (options?.withCherryAI) {
    api.cherryai = {
      generateSignature: vi.fn().mockResolvedValue({ 'X-Signature': 'mock-sig' })
    }
  }

  Object.defineProperty(globalThis, 'window', {
    value: { ...globalThis.window, keyv: createWindowKeyv(), api },
    writable: true,
    configurable: true
  })
}

interface StoreMockOverrides {
  includeUsage?: boolean
}

const setupStoreMock = (overrides?: StoreMockOverrides) => {
  mockGetState.mockReturnValue({
    settings: {
      openAI: {
        streamOptions: {
          includeUsage: overrides?.includeUsage
        }
      }
    },
    llm: {
      settings: {}
    }
  })
}

// ==================== Provider Factories ====================

const makeProvider = (overrides: Partial<Provider> & { id: string; type: string }): Provider =>
  ({
    name: overrides.id,
    apiKey: 'test-key',
    apiHost: 'https://api.example.com',
    models: [],
    isSystem: true,
    ...overrides
  }) as Provider

const makeModel = (id: string, provider: string, overrides?: Partial<Model>): Model => ({
  id,
  name: id,
  provider,
  group: provider,
  ...overrides
})

// ==================== formatProviderApiHost ====================

describe('formatProviderApiHost', () => {
  describe('Anthropic provider (special dual-field sync)', () => {
    it('syncs apiHost from anthropicApiHost when both are set', () => {
      const provider = makeProvider({
        id: 'anthropic',
        type: 'anthropic',
        apiHost: 'https://api.anthropic.com',
        anthropicApiHost: 'https://custom-anthropic.example.com'
      })

      const result = formatProviderApiHost(provider)

      // Both fields should be formatted, apiHost derived from anthropicApiHost
      expect(result.anthropicApiHost).toBe('https://custom-anthropic.example.com/v1')
      expect(result.apiHost).toBe('https://custom-anthropic.example.com/v1')
    })

    it('copies apiHost to anthropicApiHost when anthropicApiHost is not set', () => {
      const provider = makeProvider({
        id: 'anthropic',
        type: 'anthropic',
        apiHost: 'https://api.anthropic.com'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://api.anthropic.com/v1')
      expect(result.anthropicApiHost).toBe('https://api.anthropic.com/v1')
    })

    it('skips version append when trailing sharp is present', () => {
      const provider = makeProvider({
        id: 'anthropic',
        type: 'anthropic',
        apiHost: 'https://api.anthropic.com/v1#'
      })

      const result = formatProviderApiHost(provider)

      // Trailing # disables version append
      expect(result.apiHost).not.toContain('/v1/v1')
    })
  })

  describe('GitHub provider', () => {
    it('formats GitHub provider without appending version', () => {
      const provider = makeProvider({
        id: 'github',
        type: 'openai',
        apiHost: 'https://models.inference.ai.azure.com'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://models.inference.ai.azure.com')
    })
  })

  describe('CherryAI provider', () => {
    it('formats apiHost without appending version', () => {
      const provider = makeProvider({
        id: 'cherryai',
        type: 'openai',
        apiHost: 'https://api.cherryai.com'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://api.cherryai.com')
    })

    it('handles empty apiHost gracefully', () => {
      const provider = makeProvider({
        id: 'cherryai',
        type: 'openai',
        apiHost: ''
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('')
    })
  })

  describe('Perplexity provider', () => {
    it('formats apiHost without appending version', () => {
      const provider = makeProvider({
        id: 'perplexity',
        type: 'openai',
        apiHost: 'https://api.perplexity.ai'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://api.perplexity.ai')
    })
  })

  describe('NewAPI provider', () => {
    // Regression: previously isNewApiProvider was matched in formatProviderApiHost and forced
    it('appends /v1 when matched by type "new-api"', () => {
      const provider = makeProvider({
        id: 'some-newapi-instance',
        type: 'new-api',
        apiHost: 'https://api.example.com'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://api.example.com/v1')
    })

    it('does not double-append /v1', () => {
      const provider = makeProvider({
        id: 'new-api',
        type: 'openai',
        apiHost: 'https://api.newapi.com/v1'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://api.newapi.com/v1')
    })

    it('skips version append when trailing sharp is present', () => {
      const provider = makeProvider({
        id: 'new-api',
        type: 'openai',
        apiHost: 'https://api.newapi.com/custom#'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://api.newapi.com/custom')
    })
  })

  describe('Ollama provider', () => {
    it('strips trailing /v1 and appends /api', () => {
      const provider = makeProvider({
        id: 'ollama',
        type: 'ollama',
        apiHost: 'http://localhost:11434/v1'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('http://localhost:11434/api')
    })

    it('strips trailing /api and re-appends cleanly', () => {
      const provider = makeProvider({
        id: 'ollama',
        type: 'ollama',
        apiHost: 'http://localhost:11434/api'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('http://localhost:11434/api')
    })

    it('handles plain host', () => {
      const provider = makeProvider({
        id: 'ollama',
        type: 'ollama',
        apiHost: 'http://localhost:11434'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('http://localhost:11434/api')
    })
  })

  describe('Gemini provider', () => {
    it('appends v1beta instead of v1', () => {
      const provider = makeProvider({
        id: 'gemini',
        type: 'gemini',
        apiHost: 'https://generativelanguage.googleapis.com'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://generativelanguage.googleapis.com/v1beta')
    })

    it('does not double-append when version already present', () => {
      const provider = makeProvider({
        id: 'gemini',
        type: 'gemini',
        apiHost: 'https://generativelanguage.googleapis.com/v1beta'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).not.toContain('v1beta/v1beta')
    })

    it('skips version when trailing sharp is present', () => {
      const provider = makeProvider({
        id: 'gemini',
        type: 'gemini',
        apiHost: 'https://custom-gemini.example.com/custom-path#'
      })

      const result = formatProviderApiHost(provider)

      // Trailing # means appendApiVersion = false
      expect(result.apiHost).not.toContain('v1beta')
    })
  })

  describe('Default fallback (unmatched provider)', () => {
    it('appends /v1 to apiHost', () => {
      const provider = makeProvider({
        id: 'some-custom-provider',
        type: 'openai',
        apiHost: 'https://custom-api.example.com'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://custom-api.example.com/v1')
    })

    it('does not double-append /v1', () => {
      const provider = makeProvider({
        id: 'some-custom-provider',
        type: 'openai',
        apiHost: 'https://custom-api.example.com/v1'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://custom-api.example.com/v1')
    })

    it('skips version with trailing sharp', () => {
      const provider = makeProvider({
        id: 'some-custom-provider',
        type: 'openai',
        apiHost: 'https://custom-api.example.com/custom#'
      })

      const result = formatProviderApiHost(provider)

      expect(result.apiHost).toBe('https://custom-api.example.com/custom')
    })
  })

  describe('does not mutate the original provider', () => {
    it('returns a new object', () => {
      const provider = makeProvider({
        id: 'some-custom-provider',
        type: 'openai',
        apiHost: 'https://api.example.com'
      })

      const result = formatProviderApiHost(provider)

      expect(result).not.toBe(provider)
      expect(provider.apiHost).toBe('https://api.example.com')
      expect(result.apiHost).toBe('https://api.example.com/v1')
    })
  })
})

// ==================== getActualProvider / adaptProvider ====================

describe('getActualProvider', () => {
  it('retrieves provider by model and formats its apiHost', () => {
    const provider = makeProvider({
      id: 'openai',
      type: 'openai',
      apiHost: 'https://api.openai.com'
    })
    vi.mocked(getProviderByModel).mockReturnValue(provider)

    const result = getActualProvider(makeModel('gpt-4', 'openai'))

    expect(result.apiHost).toBe('https://api.openai.com/v1')
    // Should not mutate original
    expect(provider.apiHost).toBe('https://api.openai.com')
  })
})

describe('adaptProvider', () => {
  it('deep clones and formats the provider', () => {
    const provider = makeProvider({
      id: 'perplexity',
      type: 'openai',
      apiHost: 'https://api.perplexity.ai'
    })

    const result = adaptProvider({ provider })

    expect(result.apiHost).toBe('https://api.perplexity.ai')
    expect(result).not.toBe(provider)
  })
})

// ==================== providerToAiSdkConfig ====================

describe('providerToAiSdkConfig', () => {
  beforeEach(() => {
    setupWindowMock({ withCherryAI: true })
    setupStoreMock()
    vi.clearAllMocks()
  })

  describe('CherryAI builder', () => {
    it('returns openai-compatible with custom fetch for signature', async () => {
      const provider = makeProvider({
        id: 'cherryai',
        type: 'openai',
        apiHost: 'https://api.cherryai.com'
      })

      const config = await providerToAiSdkConfig(provider, makeModel('gpt-4', 'cherryai'))

      expect(config.providerId).toBe('openai-compatible')
      const settings = config.providerSettings as OpenAICompatibleProviderSettings
      expect(settings.name).toBe('cherryai')
      expect(typeof settings.fetch).toBe('function')
    })
  })

  describe('Ollama builder', () => {
    it('includes Authorization header when apiKey is set', async () => {
      const provider = makeProvider({
        id: 'ollama',
        type: 'ollama',
        apiHost: 'http://localhost:11434/api',
        apiKey: 'my-ollama-key'
      })

      const config = (await providerToAiSdkConfig(provider, makeModel('llama3', 'ollama'))) as ProviderConfig<'ollama'>

      expect(config.providerId).toBe('ollama')
      expect(config.providerSettings.headers?.Authorization).toBe('Bearer my-ollama-key')
    })

    it('omits Authorization header when apiKey is empty', async () => {
      const provider = makeProvider({
        id: 'ollama',
        type: 'ollama',
        apiHost: 'http://localhost:11434/api',
        apiKey: ''
      })

      const config = (await providerToAiSdkConfig(provider, makeModel('llama3', 'ollama'))) as ProviderConfig<'ollama'>

      expect(config.providerId).toBe('ollama')
      expect(config.providerSettings.headers?.Authorization).toBeUndefined()
    })
  })

  describe('NewAPI builder', () => {
    it.each([
      ['https://api.newapi.com', 'https://api.newapi.com/v1beta'],
      ['https://api.newapi.com/v1', 'https://api.newapi.com/v1beta'],
      ['https://api.newapi.com/v1beta', 'https://api.newapi.com/v1beta']
    ])('uses /v1beta for Gemini endpoint with base URL %s', async (apiHost, expectedBaseURL) => {
      const provider = makeProvider({
        id: 'new-api',
        type: 'new-api',
        apiHost
      })

      const model = makeModel('gemini-2.5-flash', provider.id, { endpoint_type: 'gemini' })

      const config = await providerToAiSdkConfig(provider, model)

      const settings = config.providerSettings as NewApiProviderSettings
      expect(settings.baseURL).toBe(expectedBaseURL)
    })

    it('keeps /v1 for OpenAI endpoint type', async () => {
      const provider = makeProvider({
        id: 'new-api',
        type: 'new-api',
        apiHost: 'https://api.newapi.com'
      })

      const model = makeModel('gpt-4', provider.id, { endpoint_type: 'openai' })

      const config = await providerToAiSdkConfig(provider, model)

      const settings = config.providerSettings as NewApiProviderSettings
      expect(settings.baseURL).toBe('https://api.newapi.com/v1')
    })

    it('passes endpoint_type from model', async () => {
      const provider = makeProvider({
        id: 'new-api',
        type: 'openai',
        apiHost: 'https://api.newapi.com'
      })

      const model = makeModel('gpt-4', provider.id, { endpoint_type: 'openai-response' })

      const config = await providerToAiSdkConfig(provider, model)

      expect(config.providerId).toBe('newapi')
      const settings = config.providerSettings as NewApiProviderSettings
      expect(settings.endpointType).toBe('openai-response')
    })

    it('uses anthropicApiHost as baseURL for anthropic endpoint type', async () => {
      const provider = makeProvider({
        id: 'new-api',
        type: 'openai',
        apiHost: 'https://api.newapi.com/v1',
        anthropicApiHost: 'https://api.newapi.com/anthropic'
      })

      const model = makeModel('claude-3-sonnet', provider.id, { endpoint_type: 'anthropic' })

      const config = await providerToAiSdkConfig(provider, model)

      expect(config.providerId).toBe('newapi')
      const settings = config.providerSettings as NewApiProviderSettings
      expect(settings.endpointType).toBe('anthropic')
      expect(settings.baseURL).toBe('https://api.newapi.com/anthropic')
    })

    it('falls back to apiHost when anthropicApiHost is not set for anthropic endpoint', async () => {
      const provider = makeProvider({
        id: 'new-api',
        type: 'openai',
        apiHost: 'https://api.newapi.com/v1'
      })

      const model = makeModel('claude-3-sonnet', provider.id, { endpoint_type: 'anthropic' })

      const config = await providerToAiSdkConfig(provider, model)

      const settings = config.providerSettings as NewApiProviderSettings
      expect(settings.baseURL).toBe('https://api.newapi.com/v1')
    })
  })

  describe('AiHubMix builder', () => {
    it('returns aihubmix provider config', async () => {
      const provider = makeProvider({
        id: 'aihubmix',
        type: 'openai',
        apiHost: 'https://api.aihubmix.com'
      })

      const config = await providerToAiSdkConfig(provider, makeModel('gpt-4', provider.id))

      expect(config.providerId).toBe('aihubmix')
      const settings = config.providerSettings as AihubmixProviderSettings
      expect(settings.baseURL).toBeTruthy()
      expect(settings.apiKey).toBe('test-key')
    })
  })

  describe('OpenAI-compatible fallback', () => {
    it('includes includeUsage when provider supports stream options', async () => {
      setupStoreMock({ includeUsage: true })

      const provider = makeProvider({
        id: 'some-openai-compat',
        type: 'openai',
        apiHost: 'https://api.custom.com/v1'
      })

      const config = (await providerToAiSdkConfig(
        provider,
        makeModel('gpt-4', provider.id)
      )) as ProviderConfig<'openai-compatible'>

      expect(config.providerId).toBe('openai-compatible')
      expect(config.providerSettings.includeUsage).toBe(true)
    })

    it('excludes includeUsage when provider opts out of stream options', async () => {
      setupStoreMock({ includeUsage: true })

      const provider = makeProvider({
        id: 'some-openai-compat',
        type: 'openai',
        apiHost: 'https://api.custom.com/v1',
        apiOptions: { isNotSupportStreamOptions: true }
      })

      const config = (await providerToAiSdkConfig(
        provider,
        makeModel('gpt-4', provider.id)
      )) as ProviderConfig<'openai-compatible'>

      expect(config.providerSettings.includeUsage).toBeUndefined()
    })

    it('respects includeUsage=false from settings', async () => {
      setupStoreMock({ includeUsage: false })

      const provider = makeProvider({
        id: 'some-openai-compat',
        type: 'openai',
        apiHost: 'https://api.custom.com/v1'
      })

      const config = (await providerToAiSdkConfig(
        provider,
        makeModel('gpt-4', provider.id)
      )) as ProviderConfig<'openai-compatible'>

      expect(config.providerSettings.includeUsage).toBe(false)
    })

    it('includes default app headers', async () => {
      const provider = makeProvider({
        id: 'some-openai-compat',
        type: 'openai',
        apiHost: 'https://api.custom.com/v1'
      })

      const config = (await providerToAiSdkConfig(
        provider,
        makeModel('gpt-4', provider.id)
      )) as ProviderConfig<'openai-compatible'>

      const settings = config.providerSettings
      expect(settings.headers).toBeDefined()
      expect(settings.headers!['HTTP-Referer']).toBe('https://cherry-ai.com')
      expect(settings.headers!['X-Title']).toBe('Cherry Studio')
    })

    it('merges extra_headers from provider', async () => {
      const provider = makeProvider({
        id: 'some-openai-compat',
        type: 'openai',
        apiHost: 'https://api.custom.com/v1',
        extra_headers: { 'X-Custom': 'custom-value' }
      })

      const config = (await providerToAiSdkConfig(
        provider,
        makeModel('gpt-4', provider.id)
      )) as ProviderConfig<'openai-compatible'>

      const settings = config.providerSettings
      expect(settings.headers).toBeDefined()
      expect(settings.headers!['X-Custom']).toBe('custom-value')
    })

    it('keeps LongCat providerOptions namespace while using openai-compatible runtime', async () => {
      const provider = makeProvider({
        id: 'longcat',
        type: 'openai',
        apiHost: 'https://api.longcat.chat/openai'
      })

      const config = (await providerToAiSdkConfig(
        provider,
        makeModel('LongCat-2.0', provider.id)
      )) as ProviderConfig<'openai-compatible'>

      expect(config.providerId).toBe('openai-compatible')
      expect(config.providerSettings.name).toBe('longcat')
    })

    it('adds X-Api-Key header for openai provider type', async () => {
      const provider = makeProvider({
        id: 'openai',
        type: 'openai-response',
        apiHost: 'https://api.openai.com/v1',
        apiKey: 'sk-test'
      })

      const config = await providerToAiSdkConfig(provider, makeModel('gpt-4', provider.id))

      const settings = config.providerSettings as OpenAICompatibleProviderSettings
      expect(settings.headers).toBeDefined()
      expect(settings.headers!['X-Api-Key']).toBe('sk-test')
    })
  })

  describe('endpoint extraction', () => {
    it('extracts endpoint from trailing sharp URLs', async () => {
      const provider = makeProvider({
        id: 'some-openai-compat',
        type: 'openai',
        apiHost: 'https://api.custom.com/chat/completions#'
      })

      const config = await providerToAiSdkConfig(provider, makeModel('gpt-4', provider.id))

      expect(config.endpoint).toBe('chat/completions')
    })

    it('returns empty endpoint for normal URLs', async () => {
      const provider = makeProvider({
        id: 'some-openai-compat',
        type: 'openai',
        apiHost: 'https://api.custom.com/v1'
      })

      const config = await providerToAiSdkConfig(provider, makeModel('gpt-4', provider.id))

      expect(config.endpoint).toBe('')
    })
  })
})
