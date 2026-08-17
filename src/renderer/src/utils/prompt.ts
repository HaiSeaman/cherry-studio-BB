import { DEFAULT_SYSTEM_PROMPT } from '@cherrystudio/ai-core/built-in/plugins'
import { loggerService } from '@logger'
import store from '@renderer/store'

const logger = loggerService.withContext('Utils:Prompt')

export { DEFAULT_SYSTEM_PROMPT as SYSTEM_PROMPT }

const supportedVariables = [
  '{{username}}',
  '{{date}}',
  '{{time}}',
  '{{datetime}}',
  '{{system}}',
  '{{language}}',
  '{{arch}}',
  '{{model_name}}'
]

export const containsSupportedVariables = (userSystemPrompt: string): boolean => {
  return supportedVariables.some((variable) => userSystemPrompt.includes(variable))
}

export const replacePromptVariables = async (userSystemPrompt: string, modelName?: string): Promise<string> => {
  if (typeof userSystemPrompt !== 'string') {
    logger.warn('User system prompt is not a string:', userSystemPrompt)
    return userSystemPrompt
  }

  const now = new Date()
  if (userSystemPrompt.includes('{{date}}')) {
    const date = now.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    })
    userSystemPrompt = userSystemPrompt.replace(/{{date}}/g, date)
  }

  if (userSystemPrompt.includes('{{time}}')) {
    const time = now.toLocaleTimeString()
    userSystemPrompt = userSystemPrompt.replace(/{{time}}/g, time)
  }

  if (userSystemPrompt.includes('{{datetime}}')) {
    const datetime = now.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
    userSystemPrompt = userSystemPrompt.replace(/{{datetime}}/g, datetime)
  }

  if (userSystemPrompt.includes('{{username}}')) {
    try {
      const userName = store.getState().settings.userName || 'Unknown Username'
      userSystemPrompt = userSystemPrompt.replace(/{{username}}/g, userName)
    } catch (error) {
      logger.error('Failed to get username:', error as Error)
      userSystemPrompt = userSystemPrompt.replace(/{{username}}/g, 'Unknown Username')
    }
  }

  if (userSystemPrompt.includes('{{system}}')) {
    try {
      const systemType = await window.api.system.getDeviceType()
      userSystemPrompt = userSystemPrompt.replace(/{{system}}/g, systemType)
    } catch (error) {
      logger.error('Failed to get system type:', error as Error)
      userSystemPrompt = userSystemPrompt.replace(/{{system}}/g, 'Unknown System')
    }
  }

  if (userSystemPrompt.includes('{{language}}')) {
    try {
      const language = store.getState().settings.language
      userSystemPrompt = userSystemPrompt.replace(/{{language}}/g, language)
    } catch (error) {
      logger.error('Failed to get language:', error as Error)
      userSystemPrompt = userSystemPrompt.replace(/{{language}}/g, 'Unknown System Language')
    }
  }

  if (userSystemPrompt.includes('{{arch}}')) {
    try {
      const appInfo = await window.api.getAppInfo()
      userSystemPrompt = userSystemPrompt.replace(/{{arch}}/g, appInfo.arch)
    } catch (error) {
      logger.error('Failed to get architecture:', error as Error)
      userSystemPrompt = userSystemPrompt.replace(/{{arch}}/g, 'Unknown Architecture')
    }
  }

  if (userSystemPrompt.includes('{{model_name}}')) {
    try {
      const name = modelName || store.getState().llm.defaultModel?.name
      userSystemPrompt = userSystemPrompt.replace(/{{model_name}}/g, name)
    } catch (error) {
      logger.error('Failed to get model name:', error as Error)
      userSystemPrompt = userSystemPrompt.replace(/{{model_name}}/g, 'Unknown Model')
    }
  }

  return userSystemPrompt
}
