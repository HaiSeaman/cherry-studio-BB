import type { Provider } from '@renderer/types'

/** 视频生成统一参数（三家适配器共用，字段差异由各适配器内部转换） */
export type VideoGenParams = {
  provider: Provider
  /** 模型 ID 字符串 */
  model: string
  /** 提示词 */
  prompt: string
  /** 图生视频首帧参考图（base64 data URL 或 http(s) URL） */
  inputImage?: string
  /** 时长（秒），如 '5' | '10' */
  duration?: string
  /** 分辨率档位：'480p' | '720p' | '1080p' */
  resolution?: string
  /** 宽高比，如 '16:9' | '9:16' | '1:1'（部分服务商不支持时忽略或降级） */
  aspectRatio?: string
  /** 中止信号（停止轮询/请求） */
  signal?: AbortSignal
}

/** 任务进行中状态回调：state + 已用时（不做百分比进度，接口不提供） */
export type VideoStatusCallback = (status: { state: 'queued' | 'running'; elapsedMs: number }) => void

/** 轮询配置：间隔与超时上限（设计文档 §4.2：3s / 10min；测试可注入更短值） */
export const VIDEO_POLL_INTERVAL_MS = 3000
export const VIDEO_POLL_TIMEOUT_MS = 10 * 60 * 1000

/** 从 provider.apiKey 取第一个 Key（支持逗号分隔多 Key 轮换，视频适配器共用） */
export function getFirstApiKey(provider: Provider): string {
  return (provider.apiKey || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)[0]
}
