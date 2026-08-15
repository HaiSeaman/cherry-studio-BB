/**
 * ModelListService - Unified model listing service
 * Uses Strategy Registry pattern for provider-specific model fetching
 */

import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi as aiSdkGetFromApi,
  zodSchema
} from '@ai-sdk/provider-utils'
import { loggerService } from '@logger'
import type { EndpointType, Model, Provider } from '@renderer/types'
import { SystemProviderIds } from '@renderer/types'
import { formatApiHost, getDefaultGroupName, withoutTrailingSlash } from '@renderer/utils'
import { isGeminiProvider, isOllamaProvider } from '@renderer/utils/provider'
import { defaultAppHeaders } from '@shared/utils'
import * as z from 'zod'

import {
  AIHubMixModelsResponseSchema,
  AnthropicModelsResponseSchema,
  GeminiModelsResponseSchema,
  GitHubModelsResponseSchema,
  NewApiModelsResponseSchema,
  OllamaTagsResponseSchema,
  OpenAIModelsResponseSchema,
  TogetherModelsResponseSchema,
  VercelGatewayModelsResponseSchema
} from './schemas'

const logger = loggerService.withContext('ModelListService')

// === Types ===

type ModelFetcher = {
  match: (provider: Provider) => boolean
  fetch: (provider: Provider, signal?: AbortSignal) => Promise<Model[]>
}

// === API Layer ===

const ApiErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional()
    })
    .optional(),
  message: z.string().optional()
})

type ApiError = z.infer<typeof ApiErrorSchema>

async function getFromApi<T>({
  url,
  headers,
  responseSchema,
  abortSignal
}: {
  url: string
  headers?: Record<string, string>
  responseSchema: z.ZodType<T>
  abortSignal?: AbortSignal
}): Promise<T> {
  const { value } = await aiSdkGetFromApi({
    url,
    headers,
    successfulResponseHandler: createJsonResponseHandler(zodSchema(responseSchema)),
    failedResponseHandler: createJsonErrorResponseHandler({
      errorSchema: zodSchema(ApiErrorSchema),
      errorToMessage: (error: ApiError) => error.error?.message || error.message || 'Unknown error'
    }),
    abortSignal
  })

  return value
}

// === Helpers ===

function getApiKey(provider: Provider): string {
  const keys = provider.apiKey.split(',').map((key) => key.trim())
  const keyName = `provider:${provider.id}:last_used_key`

  if (keys.length === 1) {
    return keys[0]
  }

  const lastUsedKey = window.keyv.get(keyName)
  if (!lastUsedKey) {
    window.keyv.set(keyName, keys[0])
    return keys[0]
  }

  const currentIndex = keys.indexOf(lastUsedKey)
  const nextIndex = (currentIndex + 1) % keys.length
  const nextKey = keys[nextIndex]
  window.keyv.set(keyName, nextKey)

  return nextKey
}

function defaultHeaders(provider: Provider): Record<string, string> {
  const apiKey = getApiKey(provider)
  return {
    ...defaultAppHeaders(),
    ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'X-Api-Key': apiKey } : {}),
    ...provider.extra_headers
  }
}

function defaultGroup(modelId: string, provider: Provider): string {
  if (provider.isSystem === false) {
    return getDefaultGroupName(modelId, provider.id)
  }

  const parts = modelId.split('/')
  return parts.length > 1 ? parts[0] : provider.id
}

function toModel(id: string, provider: Provider, extra?: Partial<Model>): Model {
  return {
    id,
    name: extra?.name || id,
    provider: provider.id,
    group: extra?.group || defaultGroup(id, provider),
    ...extra
  }
}

function dedup<T>(items: T[], getId: (item: T) => string | undefined): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const id = getId(item)?.trim()
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function pickPreferredString(values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }
  return undefined
}

// === Fetchers ===

const ollamaFetcher: ModelFetcher = {
  match: (p) => isOllamaProvider(p),
  fetch: async (provider, signal) => {
    const baseUrl = withoutTrailingSlash(provider.apiHost)
      .replace(/\/v1$/, '')
      .replace(/\/api$/, '')
    const response = await getFromApi({
      url: `${baseUrl}/api/tags`,
      headers: defaultHeaders(provider),
      responseSchema: OllamaTagsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.models, (m) => m.name).map((m) => toModel(m.name, provider, { owned_by: 'ollama' }))
  }
}

const geminiFetcher: ModelFetcher = {
  match: (p) => isGeminiProvider(p),
  fetch: async (provider, signal) => {
    let baseUrl = withoutTrailingSlash(provider.apiHost)
    baseUrl = baseUrl.replace(/\/v1(beta)?$/, '')
    const searchParams = new URLSearchParams({ key: getApiKey(provider) })
    const response = await getFromApi({
      url: `${baseUrl}/v1beta/models?${searchParams.toString()}`,
      headers: { ...defaultAppHeaders(), ...provider.extra_headers },
      responseSchema: GeminiModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.models, (m) => m.name).map((m) => {
      const id = m.name.startsWith('models/') ? m.name.slice(7) : m.name
      return toModel(id, provider, { name: m.displayName || id, description: m.description })
    })
  }
}

const anthropicFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.anthropic,
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(provider.apiHost)
    const apiKey = getApiKey(provider)
    const headers = {
      ...defaultAppHeaders(),
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'anthropic-version': '2023-06-01',
      ...provider.extra_headers
    }
    const models: z.infer<typeof AnthropicModelsResponseSchema>['data'] = []
    let afterId: string | undefined
    const seenCursors = new Set<string>()

    do {
      const searchParams = new URLSearchParams({ limit: '1000' })
      if (afterId) searchParams.set('after_id', afterId)
      const response = await getFromApi({
        url: `${baseUrl}/models?${searchParams.toString()}`,
        headers,
        responseSchema: AnthropicModelsResponseSchema,
        abortSignal: signal
      })
      models.push(...response.data)
      const nextAfterId = response.has_more && response.last_id ? response.last_id : undefined
      if (nextAfterId && seenCursors.has(nextAfterId)) {
        logger.warn('Stopping Anthropic model pagination due to repeated cursor', {
          providerId: provider.id,
          cursor: nextAfterId
        })
        break
      }
      if (nextAfterId) seenCursors.add(nextAfterId)
      afterId = nextAfterId
    } while (afterId)

    return dedup(models, (m) => m.id).map((m) =>
      toModel(m.id, provider, {
        name: m.display_name || m.id,
        owned_by: 'anthropic'
      })
    )
  }
}

const githubFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.github,
  fetch: async (provider, signal) => {
    const [catalogResponse, v1Response] = await Promise.all([
      getFromApi({
        url: 'https://models.github.ai/catalog/models',
        headers: defaultHeaders(provider),
        responseSchema: GitHubModelsResponseSchema,
        abortSignal: signal
      }),
      getFromApi({
        url: 'https://models.github.ai/v1/models',
        headers: defaultHeaders(provider),
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }).catch(() => ({ data: [] as { id: string; owned_by?: string }[] }))
    ])
    const catalogModels = catalogResponse.map((m) =>
      toModel(m.id, provider, {
        name: m.name || m.id,
        description: pickPreferredString([m.summary, m.description]),
        owned_by: m.publisher
      })
    )
    const v1Models = v1Response.data.map((m) => toModel(m.id, provider, { owned_by: m.owned_by }))
    return dedup([...catalogModels, ...v1Models], (m) => m.id)
  }
}

const togetherFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.together,
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(provider.apiHost)
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: defaultHeaders(provider),
      responseSchema: TogetherModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response, (m) => m.id).map((m) =>
      toModel(m.id, provider, {
        name: m.display_name || m.id,
        description: m.description,
        owned_by: m.organization
      })
    )
  }
}

const newApiFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds['new-api'] || p.type === 'new-api',
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(provider.apiHost)
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: defaultHeaders(provider),
      responseSchema: NewApiModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.data, (m) => m.id).map((m) =>
      toModel(m.id, provider, {
        owned_by: m.owned_by,
        supported_endpoint_types: m.supported_endpoint_types as EndpointType[] | undefined
      })
    )
  }
}

const openRouterFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.openrouter,
  fetch: async (provider, signal) => {
    const [modelsResponse, embedModelsResponse] = await Promise.all([
      getFromApi({
        url: 'https://openrouter.ai/api/v1/models',
        headers: defaultHeaders(provider),
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }),
      getFromApi({
        url: 'https://openrouter.ai/api/v1/embeddings/models',
        headers: defaultHeaders(provider),
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }).catch(() => ({ data: [] }))
    ])
    const all = [...modelsResponse.data, ...embedModelsResponse.data]
    return dedup(all, (m) => m.id).map((m) => toModel(m.id, provider, { owned_by: m.owned_by }))
  }
}

const ppioFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.ppio,
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(provider.apiHost)
    const [chat, embed, reranker] = await Promise.all([
      getFromApi({
        url: `${baseUrl}/models`,
        headers: defaultHeaders(provider),
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }),
      getFromApi({
        url: `${baseUrl}/models?model_type=embedding`,
        headers: defaultHeaders(provider),
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }).catch(() => ({ data: [] })),
      getFromApi({
        url: `${baseUrl}/models?model_type=reranker`,
        headers: defaultHeaders(provider),
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal
      }).catch(() => ({ data: [] }))
    ])
    const all = [...chat.data, ...embed.data, ...reranker.data]
    return dedup(all, (m) => m.id).map((m) => toModel(m.id, provider, { owned_by: m.owned_by }))
  }
}

const aiHubMixFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.aihubmix,
  fetch: async (provider, signal) => {
    const response = await getFromApi({
      url: `${withoutTrailingSlash(provider.apiHost).replace(/\/v1$/, '')}/api/v1/models`,
      headers: defaultHeaders(provider),
      responseSchema: AIHubMixModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.data, (m) => m.model_id).map((m) =>
      toModel(m.model_id, provider, {
        name: m.model_name || m.model_id,
        description: m.desc
      })
    )
  }
}

const gatewayFetcher: ModelFetcher = {
  match: (p) => p.id === SystemProviderIds.gateway,
  fetch: async (provider, signal) => {
    const response = await getFromApi({
      url: `https://ai-gateway.vercel.sh/v3/ai/config`,
      headers: {
        ...defaultHeaders(provider),
        'ai-gateway-protocol-version': '0.0.1'
      },
      responseSchema: VercelGatewayModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.models, (m) => m.id).map((m) =>
      toModel(m.id, provider, {
        name: m.name || m.id,
        description: m.description,
        owned_by: m.specification?.provider
      })
    )
  }
}

/** Default fallback: OpenAI-compatible /models endpoint */
const openAICompatibleFetcher: ModelFetcher = {
  match: () => true,
  fetch: async (provider, signal) => {
    const baseUrl = formatApiHost(provider.apiHost)
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: defaultHeaders(provider),
      responseSchema: OpenAIModelsResponseSchema,
      abortSignal: signal
    })
    return dedup(response.data, (m) => m.id).map((m) => toModel(m.id, provider, { owned_by: m.owned_by }))
  }
}

// === Registry (order matters: first match wins) ===

const fetchers: ModelFetcher[] = [
  aiHubMixFetcher,
  ollamaFetcher,
  geminiFetcher,
  anthropicFetcher,
  githubFetcher,
  togetherFetcher,
  newApiFetcher,
  openRouterFetcher,
  ppioFetcher,
  gatewayFetcher,
  openAICompatibleFetcher // always-match fallback, must be last
]

// === Unsupported providers (skip before registry lookup) ===

const UNSUPPORTED_PROVIDERS = new Set<string>([SystemProviderIds['aws-bedrock']])

function isUnsupported(provider: Provider): boolean {
  return UNSUPPORTED_PROVIDERS.has(provider.id) || provider.type === 'vertex-anthropic'
}

// === Public API ===

export async function listModels(provider: Provider, abortSignal?: AbortSignal): Promise<Model[]> {
  try {
    if (isUnsupported(provider)) {
      logger.warn('Provider does not support model listing via listModels', { providerId: provider.id })
      return []
    }

    const fetcher = fetchers.find((f) => f.match(provider))!
    return await fetcher.fetch(provider, abortSignal)
  } catch (error) {
    logger.error('Error listing models:', error as Error, { providerId: provider.id })
    return []
  }
}
