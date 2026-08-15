import { isClaude45ReasoningModel } from '@renderer/config/models'
import { getProviderByModel } from '@renderer/services/AssistantService'
import type { Assistant, Model } from '@renderer/types'
import { isToolUseModeFunction } from '@renderer/utils/assistant'
import { isAwsBedrockProvider } from '@renderer/utils/provider'

// https://docs.claude.com/en/docs/build-with-claude/extended-thinking#interleaved-thinking
const INTERLEAVED_THINKING_HEADER = 'interleaved-thinking-2025-05-14'

export function addAnthropicHeaders(assistant: Assistant, model: Model): string[] {
  const anthropicHeaders: string[] = []
  const provider = getProviderByModel(model)
  if (isClaude45ReasoningModel(model) && isToolUseModeFunction(assistant) && !isAwsBedrockProvider(provider)) {
    anthropicHeaders.push(INTERLEAVED_THINKING_HEADER)
  }
  return anthropicHeaders
}
