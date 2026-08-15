import type { PersonGeneration } from '@google/genai'
import { loggerService } from '@logger'
import { AiProvider } from '@renderer/aiCore'
import { isGeminiImageModel } from '@renderer/config/models'
import { getRotatedApiKey } from '@renderer/services/ApiService'
import { getProviderByModel } from '@renderer/services/AssistantService'
import type { Model } from '@renderer/types'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'

const logger = loggerService.withContext('PaintGeneration')

export type PaintGenerationParams = {
  /** 绘画模型 */
  model: Model
  /** 提示词 */
  prompt: string
  /** 上传的参考图（图生图；为空则文生图） */
  inputImages?: string[]
  /** 输出尺寸：OpenAI 系为像素（如 1024x1024）；Gemini 系为分辨率（如 1K/2K/4K） */
  imageSize: string
  /** Gemini 官方宽高比（如 16:9、3:2），仅 Gemini 图像模型使用 */
  aspectRatio?: string
  /** Gemini 人物生成模式（ALLOW_ALL/ALLOW_ADULT/ALLOW_NONE），仅 Gemini 使用 */
  personGeneration?: string
  /** 单次生成数量 1-4（Gemini 不支持多张，强制 1） */
  batchSize: number
  /** 中止信号（点击「停止生成」时触发） */
  signal?: AbortSignal
  /** 流式回调 */
  onChunkReceived: (chunk: Chunk) => void
}

/**
 * 图片生成 TAB 的独立图像生成函数（fetchImageGeneration 的参数化版本）
 *
 * 与聊天场景 fetchImageGeneration 的区别：
 * - 尺寸/数量可配置（原函数硬编码 1024x1024 / 1 张）
 * - 不依赖 Message/Assistant 结构，prompt 与参考图直接传入
 * - 错误统一上抛，由调用方处理（不发 ERROR chunk）
 * - Gemini 模型自动使用官方 aspectRatio + 分辨率参数
 */
export async function fetchPaintGeneration({
  model,
  prompt,
  inputImages = [],
  imageSize,
  aspectRatio,
  personGeneration,
  batchSize,
  signal,
  onChunkReceived
}: PaintGenerationParams): Promise<string[]> {
  const baseProvider = getProviderByModel(model)
  const providerWithRotatedKey = {
    ...baseProvider,
    apiKey: getRotatedApiKey(baseProvider)
  }
  const aiProvider = new AiProvider(model, providerWithRotatedKey)
  const isGemini = isGeminiImageModel(model)

  onChunkReceived({ type: ChunkType.LLM_RESPONSE_CREATED })
  onChunkReceived({ type: ChunkType.IMAGE_CREATED })

  let images: string[]
  if (inputImages.length > 0) {
    logger.debug('图生图:', { model: model.id, imageSize, aspectRatio, inputImages: inputImages.length })
    images = await aiProvider.editImage({
      model: model.id,
      prompt: prompt || '',
      inputImages,
      imageSize,
      ...(isGemini && aspectRatio ? { aspectRatio } : {}),
      ...(signal ? { signal } : {})
    })
  } else {
    logger.debug('文生图:', { model: model.id, imageSize, aspectRatio, batchSize })
    images = await aiProvider.generateImage({
      model: model.id,
      prompt: prompt || '',
      imageSize,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(personGeneration ? { personGeneration: personGeneration as PersonGeneration } : {}),
      batchSize: isGemini ? 1 : batchSize,
      ...(signal ? { signal } : {})
    })
  }

  const imageType = images[0]?.startsWith('data:') ? 'base64' : 'url'
  onChunkReceived({
    type: ChunkType.IMAGE_COMPLETE,
    image: { type: imageType, images }
  })

  // BLOCK_COMPLETE + LLM_RESPONSE_COMPLETE 保证消息状态流转正确
  const imageResponse = {
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    metrics: {
      completion_tokens: 0,
      time_first_token_millsec: 0,
      time_completion_millsec: 0
    }
  }
  onChunkReceived({ type: ChunkType.BLOCK_COMPLETE, response: imageResponse })
  onChunkReceived({ type: ChunkType.LLM_RESPONSE_COMPLETE, response: imageResponse })

  return images
  // 错误统一上抛（不在此发 ERROR chunk），调用方负责错误展示与状态更新
}
