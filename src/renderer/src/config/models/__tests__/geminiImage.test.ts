import { isGeminiImageModel, isGeminiImageModelId } from '@renderer/config/models/vision'
import type { Model } from '@renderer/types'
import { describe, expect, it } from 'vitest'

const createModel = (id: string, provider: string): Model =>
  ({
    id,
    name: id,
    provider,
    group: 'default'
  }) as unknown as Model

describe('isGeminiImageModelId', () => {
  it('识别 Gemini 图像模型 ID', () => {
    expect(isGeminiImageModelId('gemini-3.1-flash-image')).toBe(true)
    expect(isGeminiImageModelId('gemini-2.5-flash-image')).toBe(true)
    expect(isGeminiImageModelId('gemini-2.0-flash-preview-image-generation')).toBe(true)
    expect(isGeminiImageModelId('nano-banana')).toBe(true)
  })

  it('不误识别普通 Gemini 文本模型与其他模型', () => {
    expect(isGeminiImageModelId('gemini-2.5-flash')).toBe(false)
    expect(isGeminiImageModelId('gemini-2.5-pro')).toBe(false)
    expect(isGeminiImageModelId('gpt-4o')).toBe(false)
    expect(isGeminiImageModelId('dall-e-3')).toBe(false)
  })

  it('识别带 provider 前缀的模型 ID', () => {
    expect(isGeminiImageModelId('google/gemini-3.1-flash-image')).toBe(true)
    expect(isGeminiImageModelId('gemini-3.1-flash-image:free')).toBe(true)
  })
})

describe('isGeminiImageModel', () => {
  it('仅 Google 官方接口（provider id 为 gemini）的模型判定为 true', () => {
    expect(isGeminiImageModel(createModel('gemini-3.1-flash-image', 'gemini'))).toBe(true)
    expect(isGeminiImageModel(createModel('gemini-2.5-flash-image', 'gemini'))).toBe(true)
  })

  it('OpenAI 兼容接口（如硅基流动）使用的 gemini 模型判定为 false', () => {
    expect(isGeminiImageModel(createModel('gemini-3.1-flash-image', 'silicon-custom'))).toBe(false)
    expect(isGeminiImageModel(createModel('gemini-3.1-flash-image', 'custom-provider-123'))).toBe(false)
  })

  it('非 gemini 图像模型判定为 false', () => {
    expect(isGeminiImageModel(createModel('gpt-4o', 'openai'))).toBe(false)
    expect(isGeminiImageModel(createModel('dall-e-3', 'openai'))).toBe(false)
  })
})
