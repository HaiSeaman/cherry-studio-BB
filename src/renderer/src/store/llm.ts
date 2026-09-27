import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import { SYSTEM_MODELS } from '@renderer/config/models'
import { INITIAL_STATE_EXCLUDED_PROVIDER_IDS, SYSTEM_PROVIDERS_CONFIG } from '@renderer/config/providers'
import type { AwsBedrockAuthType, Model, Provider } from '@renderer/types'
import { omit, uniqBy } from 'lodash'

type LlmSettings = {
  ollama: {
    keepAliveTime: number
  }
  lmstudio: {
    keepAliveTime: number
  }
  gpustack: {
    keepAliveTime: number
  }
  awsBedrock: {
    authType: AwsBedrockAuthType
    accessKeyId: string
    secretAccessKey: string
    apiKey: string
    region: string
  }
}

export interface LlmState {
  providers: Provider[]
  defaultModel: Model
  /** @deprecated */
  topicNamingModel: Model
  quickModel: Model
  translateModel: Model
  quickAssistantId: string
  settings: LlmSettings
}

export const initialState: LlmState = {
  defaultModel: SYSTEM_MODELS.defaultModel![0],
  topicNamingModel: SYSTEM_MODELS.defaultModel![1],
  quickModel: SYSTEM_MODELS.defaultModel![1],
  translateModel: SYSTEM_MODELS.defaultModel![2],
  quickAssistantId: '',
  providers: Object.values(omit(SYSTEM_PROVIDERS_CONFIG, INITIAL_STATE_EXCLUDED_PROVIDER_IDS)),
  settings: {
    ollama: {
      keepAliveTime: 0
    },
    lmstudio: {
      keepAliveTime: 0
    },
    gpustack: {
      keepAliveTime: 0
    },
    awsBedrock: {
      authType: 'iam',
      accessKeyId: '',
      secretAccessKey: '',
      apiKey: '',
      region: ''
    }
  }
}

const llmSlice = createSlice({
  name: 'llm',
  initialState,
  reducers: {
    updateProvider: (state, action: PayloadAction<Partial<Provider> & { id: string }>) => {
      const index = state.providers.findIndex((p) => p.id === action.payload.id)
      if (index !== -1) {
        Object.assign(state.providers[index], action.payload)
      }
    },
    updateProviders: (state, action: PayloadAction<Provider[]>) => {
      state.providers = action.payload
    },
    addProvider: (state, action: PayloadAction<Provider>) => {
      state.providers.unshift(action.payload)
    },
    removeProvider: (state, action: PayloadAction<Provider>) => {
      const providerIndex = state.providers.findIndex((p) => p.id === action.payload.id)
      if (providerIndex !== -1) {
        state.providers.splice(providerIndex, 1)
      }
    },
    addModel: (state, action: PayloadAction<{ providerId: string; model: Model }>) => {
      state.providers = state.providers.map((p) =>
        p.id === action.payload.providerId
          ? {
              ...p,
              models: uniqBy(p.models.concat(action.payload.model), 'id'),
              enabled: true
            }
          : p
      )
    },
    removeModel: (state, action: PayloadAction<{ providerId: string; model: Model }>) => {
      state.providers = state.providers.map((p) =>
        p.id === action.payload.providerId
          ? {
              ...p,
              models: p.models.filter((m) => m.id !== action.payload.model.id)
            }
          : p
      )
    },
    setDefaultModel: (state, action: PayloadAction<{ model: Model }>) => {
      state.defaultModel = action.payload.model
    },
    setQuickModel: (state, action: PayloadAction<{ model: Model }>) => {
      state.quickModel = action.payload.model
    },
    setTranslateModel: (state, action: PayloadAction<{ model: Model }>) => {
      state.translateModel = action.payload.model
    },

    setQuickAssistantId: (state, action: PayloadAction<string>) => {
      state.quickAssistantId = action.payload
    },
    setOllamaKeepAliveTime: (state, action: PayloadAction<number>) => {
      state.settings.ollama.keepAliveTime = action.payload
    },
    setLMStudioKeepAliveTime: (state, action: PayloadAction<number>) => {
      state.settings.lmstudio.keepAliveTime = action.payload
    },
    setGPUStackKeepAliveTime: (state, action: PayloadAction<number>) => {
      state.settings.gpustack.keepAliveTime = action.payload
    },
    setAwsBedrockAuthType: (state, action: PayloadAction<AwsBedrockAuthType>) => {
      state.settings.awsBedrock.authType = action.payload
    },
    setAwsBedrockAccessKeyId: (state, action: PayloadAction<string>) => {
      state.settings.awsBedrock.accessKeyId = action.payload
    },
    setAwsBedrockSecretAccessKey: (state, action: PayloadAction<string>) => {
      state.settings.awsBedrock.secretAccessKey = action.payload
    },
    setAwsBedrockApiKey: (state, action: PayloadAction<string>) => {
      state.settings.awsBedrock.apiKey = action.payload
    },
    setAwsBedrockRegion: (state, action: PayloadAction<string>) => {
      state.settings.awsBedrock.region = action.payload
    },
    updateModel: (
      state,
      action: PayloadAction<{
        providerId: string
        model: Model
      }>
    ) => {
      const provider = state.providers.find((p) => p.id === action.payload.providerId)
      if (provider) {
        const modelIndex = provider.models.findIndex((m) => m.id === action.payload.model.id)
        if (modelIndex !== -1) {
          provider.models[modelIndex] = action.payload.model
        }
      }
    }
  }
})

export const {
  updateProvider,
  updateProviders,
  addProvider,
  removeProvider,
  addModel,
  removeModel,
  setDefaultModel,
  setQuickModel,
  setTranslateModel,
  setQuickAssistantId,
  setOllamaKeepAliveTime,
  setLMStudioKeepAliveTime,
  setGPUStackKeepAliveTime,
  setAwsBedrockAuthType,
  setAwsBedrockAccessKeyId,
  setAwsBedrockSecretAccessKey,
  setAwsBedrockApiKey,
  setAwsBedrockRegion,
  updateModel
} = llmSlice.actions

export default llmSlice.reducer
