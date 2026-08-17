import { configureStore } from '@reduxjs/toolkit'
import { type Assistant, type Model } from '@renderer/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { replacePromptVariables } from '../prompt'

// Mock window.api
const mockApi = {
  system: {
    getDeviceType: vi.fn()
  },
  getAppInfo: vi.fn()
}

vi.mock('@renderer/store', () => {
  const mockStore = configureStore({
    reducer: {
      settings: (
        state = {
          language: 'zh-CN',
          userName: 'MockUser'
        }
      ) => state,
      llm: (
        state = {
          defaultModel: {
            name: 'Default-Model-Name'
          }
        }
      ) => state
    }
  })
  return {
    default: mockStore
  }
})

describe('prompt', () => {
  const mockDate = new Date('2023-01-01T12:00:00Z')

  beforeEach(() => {
    vi.stubGlobal('window', { api: mockApi })
    vi.useFakeTimers()
    vi.setSystemTime(mockDate)
    mockApi.system.getDeviceType.mockResolvedValue('macOS')
    mockApi.getAppInfo.mockResolvedValue({ arch: 'darwin64' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const createMockAssistant = (name: string, modelName: string): Assistant => {
    const mockModel: Model = {
      id: `model-${name}`,
      name: modelName,
      provider: 'mock-provider',
      group: 'mock-group'
    }
    return {
      id: `assistant-${name}`,
      name: name,
      model: mockModel,
      prompt: '',
      type: 'assistant',
      topics: []
    }
  }

  describe('replacePromptVariables', () => {
    it('should replace all variables correctly with strict equality', async () => {
      const userPrompt = `
以下是一些辅助信息:
  - 日期和时间: {{datetime}};
  - 操作系统: {{system}};
  - 中央处理器架构: {{arch}};
  - 语言: {{language}};
  - 模型名称: {{model_name}};
  - 用户名称: {{username}};
`
      const assistant = createMockAssistant('MyAssistant', 'Super-Model-X')
      const result = await replacePromptVariables(userPrompt, assistant.model?.name)
      const expectedPrompt = `
以下是一些辅助信息:
  - 日期和时间: ${mockDate.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  })};
  - 操作系统: macOS;
  - 中央处理器架构: darwin64;
  - 语言: zh-CN;
  - 模型名称: Super-Model-X;
  - 用户名称: MockUser;
`
      expect(result).toEqual(expectedPrompt)
    })

    it('should handle API errors gracefully and use fallback values', async () => {
      mockApi.system.getDeviceType.mockRejectedValue(new Error('API Error'))
      mockApi.getAppInfo.mockRejectedValue(new Error('API Error'))

      const userPrompt = 'System: {{system}}, Architecture: {{arch}}'
      const result = await replacePromptVariables(userPrompt)
      const expectedPrompt = 'System: Unknown System, Architecture: Unknown Architecture'
      expect(result).toEqual(expectedPrompt)
    })

    it('should handle non-string input gracefully', async () => {
      const result = await replacePromptVariables(null as any)
      expect(result).toBe(null)
    })
  })
})
