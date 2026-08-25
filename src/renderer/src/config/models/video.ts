/**
 * 视频生成模型识别规则（供「动感视频助手」的模型选择器过滤使用）
 * 识别范围：阿里百炼通义万相视频、火山豆包 Seedance、腾讯混元视频
 */

import type { Model } from '@renderer/types'

// 阿里百炼：wan2.x-t2v/-i2v 系列（t2i 是生图，勿命中）
const DASHSCOPE_VIDEO_MODELS = [String.raw`wan\d[\w.]*-(?:t2v|i2v)(?:-[\w-]+)?`, String.raw`wanx(?:-[\w-]+)*-(?:t2v|i2v)`]

// 火山豆包 Seedance 系列（doubao-seedance-* 与裸 seedance-*）
const ARK_VIDEO_MODELS = [String.raw`(?:doubao-)?seedance(?:-[\w-]+)?`]

// 腾讯混元视频系列（hunyuan-turbos 等对话模型勿命中）
const HUNYUAN_VIDEO_MODELS = [String.raw`hunyuan-video(?:-[\w-]+)?`]

const DEDICATED_VIDEO_MODEL_REGEX = new RegExp([...DASHSCOPE_VIDEO_MODELS, ...ARK_VIDEO_MODELS, ...HUNYUAN_VIDEO_MODELS].join('|'), 'i')

/** 判断是否为视频生成模型 */
export function isVideoModel(model: Model | undefined): boolean {
  if (!model) {
    return false
  }
  return DEDICATED_VIDEO_MODEL_REGEX.test(model.id)
}
