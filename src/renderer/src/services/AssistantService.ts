import { loggerService } from '@logger'
import {
  DEFAULT_CONTEXTCOUNT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  MAX_CONTEXT_COUNT,
  UNLIMITED_CONTEXT_COUNT
} from '@renderer/config/constant'
import { getModelSupportedReasoningEffortOptions } from '@renderer/config/models'
import { isQwenMTModel } from '@renderer/config/models/qwen'
import { CHERRYAI_PROVIDER } from '@renderer/config/providers'
import { UNKNOWN } from '@renderer/config/translate'
import store from '@renderer/store'
import type {
  Assistant,
  AssistantSettings,
  Model,
  Provider,
  TranslateAssistant,
  TranslateLanguage
} from '@renderer/types'

import { DEFAULT_ASSISTANT_SETTINGS, getDefaultAssistant } from './defaultAssistant'

// Re-exported for backward compatibility
export { DEFAULT_ASSISTANT_SETTINGS, getDefaultAssistant, getDefaultTopic } from './defaultAssistant'

const logger = loggerService.withContext('AssistantService')

// Local replacement for hooks/useStore.getStoreProviders to avoid a circular
// import (store -> assistants -> AssistantService -> useStore -> store).
function getStoreProviders(): Provider[] {
  return store.getState().llm.providers.concat([CHERRYAI_PROVIDER])
}

/**
 * Creates a default translate assistant.
 *
 * @param targetLanguage - Target language for translation
 * @param text - Text to be translated
 * @param _settings - Optional settings to override default assistant settings
 * @returns Configured translate assistant
 */
export function getDefaultTranslateAssistant(
  targetLanguage: TranslateLanguage,
  text: string,
  _settings?: Partial<AssistantSettings>
): TranslateAssistant {
  const model = getTranslateModel()
  const assistant: Assistant = getDefaultAssistant()

  if (!model) {
    logger.error('No translate model')
    throw new Error('翻译模型未配置')
  }

  if (targetLanguage.langCode === UNKNOWN.langCode) {
    logger.error('Unknown target language', targetLanguage)
    throw new Error('Unknown target language')
  }

  const supportedOptions = getModelSupportedReasoningEffortOptions(model)
  // disable reasoning if it could be disabled, otherwise no configuration
  const reasoningEffort = supportedOptions?.includes('none') ? 'none' : 'default'
  const settings = {
    reasoning_effort: reasoningEffort,
    ..._settings
  } satisfies Partial<AssistantSettings>

  const getTranslateContent = (model: Model, text: string, targetLanguage: TranslateLanguage): string => {
    if (isQwenMTModel(model)) {
      return text // QwenMT models handle raw text directly
    }

    return store
      .getState()
      .settings.translateModelPrompt.replaceAll('{{target_language}}', targetLanguage.value)
      .replaceAll('{{text}}', text)
  }

  const content = getTranslateContent(model, text, targetLanguage)
  const translateAssistant = {
    ...assistant,
    model,
    settings,
    prompt: '',
    targetLanguage,
    content
  } satisfies TranslateAssistant
  return translateAssistant
}

/**
 * Gets the CURRENT SETTINGS of the default assistant.
 *
 * **Important**: This returns the actual current settings of the default assistant (user-configured),
 * NOT the DEFAULT_ASSISTANT_SETTINGS template. The settings may have been modified by the user
 * from their initial default values.
 *
 * To get the template of default values, use DEFAULT_ASSISTANT_SETTINGS directly.
 *
 * @returns Current settings of the default assistant from store state
 */
export function getDefaultAssistantSettings() {
  return store.getState().assistants.defaultAssistant.settings
}

export function getDefaultProvider() {
  return getProviderByModel(getDefaultModel())
}

export function getDefaultModel() {
  return store.getState().llm.defaultModel
}

export function getQuickModel() {
  return store.getState().llm.quickModel
}

export function getTranslateModel() {
  return store.getState().llm.translateModel
}

export function getAssistantProvider(assistant: Assistant): Provider {
  const providers = getStoreProviders()
  const provider = providers.find((p) => p.id === assistant.model?.provider)
  return provider || getDefaultProvider()
}

// FIXME: This function fails in silence.
// TODO: Refactor it to make it return exactly valid value or null, and update all usage.
export function getProviderByModel(model?: Model): Provider {
  const providers = getStoreProviders()
  const provider = providers.find((p) => p.id === model?.provider)

  if (!provider) {
    const defaultProvider = providers.find((p) => p.id === getDefaultModel()?.provider)
    return defaultProvider || providers[0]
  }

  return provider
}

// FIXME: This function may return undefined but as Provider
export function getProviderByModelId(modelId?: string) {
  const providers = getStoreProviders()
  const _modelId = modelId || getDefaultModel().id
  return providers.find((p) => p.models.find((m) => m.id === _modelId)) as Provider
}

/**
 * Retrieves and normalizes assistant settings with special transformation handling.
 *
 * **Special Transformations:**
 * 1. **Context Count**: Converts `MAX_CONTEXT_COUNT` to `UNLIMITED_CONTEXT_COUNT` for internal processing
 * 2. **Max Tokens**: Only returns a value when `enableMaxTokens` is true, otherwise returns `undefined`
 * 3. **Max Tokens Validation**: Ensures maxTokens > 0, falls back to `DEFAULT_MAX_TOKENS` if invalid
 * 4. **Fallback Defaults**: Applies system defaults for all undefined/missing settings
 *
 * @param assistant - The assistant instance to extract settings from
 * @returns Normalized assistant settings with all transformations applied
 */
export const getAssistantSettings = (assistant: Assistant): AssistantSettings => {
  const contextCount = assistant?.settings?.contextCount ?? DEFAULT_CONTEXTCOUNT
  const getAssistantMaxTokens = () => {
    if (assistant.settings?.enableMaxTokens) {
      const maxTokens = assistant.settings.maxTokens
      if (typeof maxTokens === 'number') {
        return maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS
      }
      return DEFAULT_MAX_TOKENS
    }
    return undefined
  }

  return {
    contextCount: contextCount === MAX_CONTEXT_COUNT ? UNLIMITED_CONTEXT_COUNT : contextCount,
    temperature: assistant?.settings?.temperature ?? DEFAULT_TEMPERATURE,
    enableTemperature: assistant?.settings?.enableTemperature ?? DEFAULT_ASSISTANT_SETTINGS.enableTemperature,
    topP: assistant?.settings?.topP ?? DEFAULT_ASSISTANT_SETTINGS.topP,
    enableTopP: assistant?.settings?.enableTopP ?? DEFAULT_ASSISTANT_SETTINGS.enableTopP,
    enableMaxTokens: assistant?.settings?.enableMaxTokens ?? DEFAULT_ASSISTANT_SETTINGS.enableMaxTokens,
    maxTokens: getAssistantMaxTokens(),
    streamOutput: assistant?.settings?.streamOutput ?? DEFAULT_ASSISTANT_SETTINGS.streamOutput,
    toolUseMode: assistant?.settings?.toolUseMode ?? DEFAULT_ASSISTANT_SETTINGS.toolUseMode,
    maxToolCalls: assistant?.settings?.maxToolCalls ?? DEFAULT_ASSISTANT_SETTINGS.maxToolCalls,
    enableMaxToolCalls: assistant?.settings?.enableMaxToolCalls ?? DEFAULT_ASSISTANT_SETTINGS.enableMaxToolCalls,
    defaultModel: assistant?.defaultModel ?? DEFAULT_ASSISTANT_SETTINGS.defaultModel,
    reasoning_effort: assistant?.settings?.reasoning_effort ?? DEFAULT_ASSISTANT_SETTINGS.reasoning_effort,
    customParameters: assistant?.settings?.customParameters ?? DEFAULT_ASSISTANT_SETTINGS.customParameters
  }
}

export function getAssistantById(id: string) {
  const assistants = store.getState().assistants.assistants
  return assistants.find((a) => a.id === id)
}
