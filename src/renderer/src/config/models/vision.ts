import { getProviderByModel } from '@renderer/services/AssistantService'
import type { Model } from '@renderer/types'
import { getLowerBaseModelName, isUserSelectedModelType } from '@renderer/utils'

import { isEmbeddingModel, isRerankModel } from './embedding'
import { isFunctionCallingModel } from './tooluse'

// Vision models, used as regex
const visionAllowedModels = [
  'llava',
  'moondream',
  'minicpm',
  'gemini-1\\.5',
  'gemini-2\\.0',
  'gemini-2\\.5',
  'gemini-3(?:\\.\\d)?-(?:flash|pro)(?:-preview)?',
  'gemini-(flash|pro|flash-lite)-latest',
  'gemini-exp',
  'claude-3',
  'claude-haiku-4',
  'claude-sonnet-4',
  'claude-opus-4',
  'claude-fable',
  'vision',
  'glm-4(?:\\.\\d+)?v(?:-[\\w-]+)?',
  'qwen-vl',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen3-vl',
  'qwen3\\.[5-9](?!-max)(?:-[\\w-]+)?',
  'qwen2.5-omni',
  'qwen3-omni(?:-[\\w-]+)?',
  'qvq',
  'internvl2',
  'grok-vision-beta',
  'grok-4(?:-[\\w-]+)?',
  'grok-build(?:-[\\w-]+)?',
  'pixtral',
  'gpt-4(?:-[\\w-]+)',
  'gpt-4.1(?:-[\\w-]+)?',
  'gpt-4o(?:-[\\w-]+)?',
  'gpt-4.5(?:-[\\w-]+)',
  'gpt-5(?:-[\\w-]+)?',
  'chatgpt-4o(?:-[\\w-]+)?',
  'o1(?:-[\\w-]+)?',
  'o3(?:-[\\w-]+)?',
  'o4(?:-[\\w-]+)?',
  'deepseek-vl(?:[\\w-]+)?',
  'kimi-k2\\.[5-9]\\d*(?:-[\\w-]+)?',
  'kimi-latest',
  'gemma-?[3-4](?:[-.\\w]+)?',
  'doubao-seed-1[.-][68](?:-[\\w-]+)?',
  'doubao-seed-2[.-]0(?:-[\\w-]+)?',
  'doubao-seed-2[.-]1(?:-[\\w-]+)?',
  'doubao-seed-evolving(?:-[\\w-]+)?',
  'doubao-seed-code(?:-[\\w-]+)?',
  'minimax-m3(?:-[\\w-]+)?',
  'kimi-thinking-preview',
  `gemma3(?:[-:\\w]+)?`,
  'kimi-vl-a3b-thinking(?:-[\\w-]+)?',
  'llama-guard-4(?:-[\\w-]+)?',
  'llama-4(?:-[\\w-]+)?',
  'step-1o(?:.*vision)?',
  'step-1v(?:-[\\w-]+)?',
  'qwen-omni(?:-[\\w-]+)?',
  'mistral-large-(2512|latest)',
  'mistral-medium-(2508|latest)',
  'mistral-small',
  'mimo-v2\\.5$',
  'mimo-v2-omni(?:-[\\w-]+)?',
  'glm-5v-turbo'
]

const visionExcludedModels = [
  'gpt-4-\\d+-preview',
  'gpt-4-turbo-preview',
  'gpt-4-32k',
  'gpt-4-\\d+',
  'o1-mini',
  'o3-mini',
  'o1-preview',
  'AIDC-AI/Marco-o1'
]
const VISION_REGEX = new RegExp(
  `\\b(?!(?:${visionExcludedModels.join('|')})\\b)(${visionAllowedModels.join('|')})\\b`,
  'i'
)

const STEPFUN_VISION_MODELS = new Set(['step-3.7-flash'])

// All dedicated image generation models (only generate images, no text chat capability)
// These models need:
// 1. Route to dedicated image generation API
// 2. Exclude from reasoning/websearch/tooluse selection
const DEDICATED_IMAGE_MODELS = [
  // OpenAI series
  'dall-e(?:-[\\w-]+)?',
  'gpt-image(?:-[\\w-]+)?',
  // xAI
  'grok-2-image(?:-[\\w-]+)?',
  // Google
  'imagen(?:-[\\w-]+)?',
  // Stable Diffusion series
  'flux(?:-[\\w-]+)?',
  'stable-?diffusion(?:-[\\w-]+)?',
  'stabilityai(?:-[\\w-]+)?',
  'sd-[\\w-]+',
  'sdxl(?:-[\\w-]+)?',
  // zhipu
  'cogview(?:-[\\w-]+)?',
  // Alibaba
  'qwen-image(?:-[\\w-]+)?',
  // Others
  'janus(?:-[\\w-]+)?',
  'midjourney(?:-[\\w-]+)?',
  'mj-[\\w-]+',
  'z-image(?:-[\\w-]+)?',
  'longcat-image(?:-[\\w-]+)?',
  'hunyuanimage(?:-[\\w-]+)?',
  'seedream(?:-[\\w-]+)?',
  'kandinsky(?:-[\\w-]+)?'
]

const IMAGE_ENHANCEMENT_MODELS = [
  'grok-2-image(?:-[\\w-]+)?',
  'qwen-image-edit',
  'gpt-image-1',
  'gpt-image-2',
  'gemini-2.5-flash-image(?:-[\\w-]+)?',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3(?:\\.\\d+)?-(?:flash|pro)-image(?:-[\\w-]+)?'
]

const IMAGE_ENHANCEMENT_MODELS_REGEX = new RegExp(IMAGE_ENHANCEMENT_MODELS.join('|'), 'i')

const DEDICATED_IMAGE_MODEL_REGEX = new RegExp(DEDICATED_IMAGE_MODELS.join('|'), 'i')

// Models that should auto-enable image generation button when selected
const AUTO_ENABLE_IMAGE_MODELS = [
  'gemini-2.5-flash-image(?:-[\\w-]+)?',
  'gemini-3(?:\\.\\d+)?-(?:flash|pro)-image(?:-[\\w-]+)?',
  ...DEDICATED_IMAGE_MODELS
]

const AUTO_ENABLE_IMAGE_MODELS_REGEX = new RegExp(AUTO_ENABLE_IMAGE_MODELS.join('|'), 'i')

const OPENAI_TOOL_USE_IMAGE_GENERATION_MODELS = [
  'o3',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5'
]

const OPENAI_IMAGE_GENERATION_MODELS = [...OPENAI_TOOL_USE_IMAGE_GENERATION_MODELS, 'gpt-image-1']

const MODERN_IMAGE_MODELS = ['gemini-3(?:\\.\\d+)?-(?:flash|pro)-image(?:-[\\w-]+)?']

const GENERATE_IMAGE_MODELS = [
  'gemini-2.0-flash-exp(?:-[\\w-]+)?',
  'gemini-2.5-flash-image(?:-[\\w-]+)?',
  'gemini-2.0-flash-preview-image-generation',
  ...MODERN_IMAGE_MODELS,
  ...DEDICATED_IMAGE_MODELS
]

const OPENAI_IMAGE_GENERATION_MODELS_REGEX = new RegExp(OPENAI_IMAGE_GENERATION_MODELS.join('|'), 'i')

const GENERATE_IMAGE_MODELS_REGEX = new RegExp(GENERATE_IMAGE_MODELS.join('|'), 'i')

const MODERN_GENERATE_IMAGE_MODELS_REGEX = new RegExp(MODERN_IMAGE_MODELS.join('|'), 'i')

/**
 * Check if the model is a dedicated image generation model
 * Dedicated image generation models can only generate images, no text chat capability
 *
 * These models need:
 * 1. Route to dedicated image generation API
 * 2. Exclude from reasoning/websearch/tooluse selection
 */
export function isDedicatedImageModel(model: Model): boolean {
  if (!model) return false
  const modelId = getLowerBaseModelName(model.id)
  return DEDICATED_IMAGE_MODEL_REGEX.test(modelId)
}

// Backward compatible aliases
export const isDedicatedImageGenerationModel = isDedicatedImageModel

export const isAutoEnableImageGenerationModel = (model: Model): boolean => {
  if (!model) return false

  const modelId = getLowerBaseModelName(model.id)
  return AUTO_ENABLE_IMAGE_MODELS_REGEX.test(modelId)
}

/**
 * 判断模型是否支持对话式的图片生成
 * @param model
 * @returns
 */
export function isGenerateImageModel(model: Model): boolean {
  if (!model || isEmbeddingModel(model) || isRerankModel(model)) {
    return false
  }

  const provider = getProviderByModel(model)

  if (!provider) {
    return false
  }

  const modelId = getLowerBaseModelName(model.id, '/')

  if (provider.type === 'openai-response') {
    return OPENAI_IMAGE_GENERATION_MODELS_REGEX.test(modelId) || GENERATE_IMAGE_MODELS_REGEX.test(modelId)
  }

  return GENERATE_IMAGE_MODELS_REGEX.test(modelId)
}

// TODO: refine the regex
/**
 * 判断模型是否支持纯图片生成（不支持通过工具调用）
 * @param model
 * @returns
 */
export function isPureGenerateImageModel(model: Model): boolean {
  if (!isGenerateImageModel(model) && !isTextToImageModel(model)) {
    return false
  }

  if (isFunctionCallingModel(model)) {
    return false
  }

  const modelId = getLowerBaseModelName(model.id)
  if (GENERATE_IMAGE_MODELS_REGEX.test(modelId) && !MODERN_GENERATE_IMAGE_MODELS_REGEX.test(modelId)) {
    return true
  }

  return !OPENAI_TOOL_USE_IMAGE_GENERATION_MODELS.some((m) => modelId.includes(m))
}

// Backward compatible alias - now uses unified dedicated image model detection
export const isTextToImageModel = isDedicatedImageModel

/**
 * 判断模型是否支持图片增强（包括编辑、增强、修复等）
 * @param model
 */
export function isImageEnhancementModel(model: Model): boolean {
  const modelId = getLowerBaseModelName(model.id)
  return IMAGE_ENHANCEMENT_MODELS_REGEX.test(modelId)
}

// Gemini 图像生成模型（Nano Banana 系列）：gemini-2.5-flash-image / gemini-3.x-flash-image / nano-banana
const GEMINI_IMAGE_MODELS_REGEX = /gemini-(?:[\w.-]*)?image(?:-[\w-]+)?|nano-banana/i

/**
 * 判断模型 ID 是否为 Gemini 图像生成模型
 * Gemini 模型使用 aspectRatio + imageSize(1K/2K/4K) 官方参数，且不支持 n>1 与像素 size
 */
export function isGeminiImageModelId(modelId: string): boolean {
  if (!modelId) return false
  return GEMINI_IMAGE_MODELS_REGEX.test(getLowerBaseModelName(modelId))
}

/**
 * 判断是否为「Google 官方接口」的 Gemini 图像生成模型
 * 只有 Google 官方接口（provider id 为 gemini）才支持 aspectRatio/imageSize 官方参数；
 * 通过 OpenAI 兼容接口（如硅基流动）使用的 gemini 模型需走像素 size 分支
 */
export function isGeminiImageModel(model: Model): boolean {
  if (!model) return false
  if (!isGeminiImageModelId(model.id)) return false
  return model.provider === 'gemini'
}

/**
 * 判断是否为「Gemini 官方接口」的图像生成模型（统一 UI 层与参数层的判定标准）：
 * 模型 ID 匹配 Gemini 图像系列，且 Provider 类型为 gemini。
 * 以 provider.type 判定（而非 provider id），与 AiProvider 内部判定保持一致，
 * 避免用户自建 Gemini 类型服务商时两处判定分叉导致参数静默失效
 */
export function isGeminiOfficialImageModel(model: Model, providerType?: string): boolean {
  if (!model || !isGeminiImageModelId(model.id)) {
    return false
  }
  return providerType === 'gemini'
}

export function isVisionModel(model: Model): boolean {
  if (!model || isEmbeddingModel(model) || isRerankModel(model)) {
    return false
  }
  // 新添字段 copilot-vision-request 后可使用 vision
  // if (model.provider === 'copilot') {
  //   return false
  // }
  if (isUserSelectedModelType(model, 'vision') !== undefined) {
    return isUserSelectedModelType(model, 'vision')!
  }

  const modelId = getLowerBaseModelName(model.id)
  if (model.provider === 'stepfun' && STEPFUN_VISION_MODELS.has(modelId)) {
    return true
  }

  if (model.provider === 'doubao' || modelId.includes('doubao')) {
    return VISION_REGEX.test(model.name) || VISION_REGEX.test(modelId) || false
  }

  return VISION_REGEX.test(modelId) || IMAGE_ENHANCEMENT_MODELS_REGEX.test(modelId) || false
}
