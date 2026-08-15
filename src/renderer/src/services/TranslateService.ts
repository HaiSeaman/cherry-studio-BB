import type {
  AssistantSettings,
  FetchChatCompletionRequestOptions,
  ReasoningEffortOption,
  TranslateLanguage
} from '@renderer/types'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'
import { readyToAbort } from '@renderer/utils/abortController'
import { isAbortError } from '@renderer/utils/error'
import { NoOutputGeneratedError } from 'ai'

import { fetchChatCompletion } from './ApiService'
import { getDefaultTranslateAssistant } from './AssistantService'

type TranslateOptions = {
  reasoningEffort: ReasoningEffortOption
}

/**
 * 翻译文本到目标语言
 * @param text - 需要翻译的文本内容
 * @param targetLanguage - 目标语言
 * @param onResponse - 流式输出的回调函数，用于实时获取翻译结果
 * @param abortKey - 用于控制 abort 的键
 * @returns 返回翻译后的文本
 * @throws {Error} 翻译中止或失败时抛出异常
 */
export const translateText = async (
  text: string,
  targetLanguage: TranslateLanguage,
  onResponse?: (text: string, isComplete: boolean) => void,
  abortKey?: string,
  options?: TranslateOptions
) => {
  let error
  const assistantSettings: Partial<AssistantSettings> | undefined = options
    ? { reasoning_effort: options?.reasoningEffort }
    : undefined
  const assistant = getDefaultTranslateAssistant(targetLanguage, text, assistantSettings)

  const signal = abortKey ? readyToAbort(abortKey) : undefined

  let translatedText = ''
  let completed = false
  const onChunk = (chunk: Chunk) => {
    if (chunk.type === ChunkType.TEXT_DELTA) {
      translatedText = chunk.text
    } else if (chunk.type === ChunkType.TEXT_COMPLETE) {
      completed = true
    } else if (chunk.type === ChunkType.ERROR) {
      error = chunk.error
      if (isAbortError(chunk.error)) {
        completed = true
      }
    }
    onResponse?.(translatedText, completed)
  }

  const requestOptions = {
    signal
  } satisfies FetchChatCompletionRequestOptions

  try {
    await fetchChatCompletion({
      prompt: assistant.content,
      assistant,
      requestOptions,
      onChunkReceived: onChunk
    })
  } catch (e) {
    // dismiss no output generated error. it will be thrown when aborted.
    if (!NoOutputGeneratedError.isInstance(e)) {
      throw e
    }
  }

  if (error !== undefined && !isAbortError(error)) {
    throw error
  }

  const trimmedText = translatedText.trim()

  if (!trimmedText) {
    return Promise.reject(new Error('翻译结果为空内容'))
  }

  return trimmedText
}
