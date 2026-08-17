/**
 * Mock Provider Instances
 * Provides mock implementations for all supported AI providers
 */

import type { ImageModelV3, LanguageModelV3 } from '@ai-sdk/provider'
import { vi } from 'vitest'

/**
 * Creates a mock language model with customizable behavior
 */
export function createMockLanguageModel(overrides?: Partial<LanguageModelV3>): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'mock-provider',
    modelId: 'mock-model',
    supportedUrls: {},

    doGenerate: vi.fn().mockResolvedValue({
      text: 'Mock response text',
      finishReason: 'stop',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        inputTokenDetails: {},
        outputTokenDetails: {}
      },
      rawCall: { rawPrompt: null, rawSettings: {} },
      rawResponse: { headers: {} },
      warnings: []
    }),

    doStream: vi.fn().mockReturnValue({
      stream: (async function* () {
        yield {
          type: 'text-delta',
          textDelta: 'Mock '
        }
        yield {
          type: 'text-delta',
          textDelta: 'streaming '
        }
        yield {
          type: 'text-delta',
          textDelta: 'response'
        }
        yield {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            inputTokens: 10,
            outputTokens: 15,
            totalTokens: 25,
            inputTokenDetails: {},
            outputTokenDetails: {}
          }
        }
      })(),
      rawCall: { rawPrompt: null, rawSettings: {} },
      rawResponse: { headers: {} },
      warnings: []
    }),

    ...overrides
  } as LanguageModelV3
}

/**
 * Creates a mock image model with customizable behavior
 * Compliant with AI SDK v3 specification
 */
export function createMockImageModel(overrides?: Partial<ImageModelV3>): ImageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'mock-provider',
    modelId: 'mock-image-model',
    maxImagesPerCall: undefined,

    doGenerate: vi.fn().mockResolvedValue({
      images: [
        {
          base64: 'mock-base64-image-data',
          uint8Array: new Uint8Array([1, 2, 3, 4, 5]),
          mimeType: 'image/png'
        }
      ],
      warnings: []
    }),

    ...overrides
  } as ImageModelV3
}

/**
 * Mock provider configurations for testing
 */
export const mockProviderConfigs = {
  openai: {
    apiKey: 'sk-test-openai-key-123456789',
    baseURL: 'https://api.openai.com/v1',
    organization: 'test-org'
  },

  anthropic: {
    apiKey: 'sk-ant-test-key-123456789',
    baseURL: 'https://api.anthropic.com'
  },

  google: {
    apiKey: 'test-google-api-key-123456789',
    baseURL: 'https://generativelanguage.googleapis.com/v1'
  },

  xai: {
    apiKey: 'xai-test-key-123456789',
    baseURL: 'https://api.x.ai/v1'
  },

  azure: {
    apiKey: 'test-azure-key-123456789',
    resourceName: 'test-resource',
    deployment: 'test-deployment'
  },

  deepseek: {
    apiKey: 'sk-test-deepseek-key-123456789',
    baseURL: 'https://api.deepseek.com/v1'
  },

  openrouter: {
    apiKey: 'sk-or-test-key-123456789',
    baseURL: 'https://openrouter.ai/api/v1'
  },

  huggingface: {
    apiKey: 'hf_test_key_123456789',
    baseURL: 'https://api-inference.huggingface.co'
  },

  'openai-compatible': {
    apiKey: 'test-compatible-key-123456789',
    baseURL: 'https://api.example.com/v1',
    name: 'test-provider'
  },

  'openai-chat': {
    apiKey: 'sk-test-chat-key-123456789',
    baseURL: 'https://api.openai.com/v1'
  }
} as const

export type ProviderId = keyof typeof mockProviderConfigs
