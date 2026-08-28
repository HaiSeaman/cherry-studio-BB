/**
 * 火山引擎 Ark（豆包 Seedance）视频生成适配
 *
 * Ark 视频生成为异步任务协议：
 * 1. 提交：POST {host}/api/v3/contents/generations/tasks，Bearer API Key
 *    body.content 为数组：text 项携带提示词与内嵌参数指令（--duration/--resolution/--ratio 等），
 *    图生视频时追加 { type: 'image_url', image_url: { url } }（支持 base64 data URL）
 *    返回任务 id（json.id）
 * 2. 轮询：GET 同路径/{id} → status: queued/running/succeeded/failed/cancelled/expired
 *    succeeded 后取 content.video_url（短期有效，调用方需持久化）
 * 3. 停止轮询时尽力删除远端任务：DELETE 同路径/{id}（失败静默）
 */

import { loggerService } from '@logger'

import { abortableDelay } from './dashscopeImage'
import {
  getFirstApiKey,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_TIMEOUT_MS,
  type VideoGenParams,
  type VideoStatusCallback
} from './videoGenerationTypes'

const logger = loggerService.withContext('ArkVideo')

type PollOptions = { intervalMs?: number; timeoutMs?: number }

/** 由 apiHost 推导 Ark 根地址：去尾斜杠；未含 /api/v3 时自动补全 */
export function getArkBaseUrl(apiHost: string): string {
  let url = (apiHost || 'https://ark.cn-beijing.volces.com/api/v3').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/.test(url)) {
    url = `${url}/api/v3`
  }
  return url
}

/** Seedance 参数以内嵌文本指令传递 */
function buildInstructionText(prompt: string, duration?: string, resolution?: string, aspectRatio?: string): string {
  return [
    prompt || '',
    resolution ? `--resolution ${resolution}` : '',
    duration ? `--duration ${Number(duration)}` : '',
    aspectRatio ? `--ratio ${aspectRatio}` : '',
    '--watermark false'
  ]
    .filter(Boolean)
    .join(' ')
}

async function toArkError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`
  try {
    const body = await response.json()
    const message = body?.error?.message || body?.message
    if (message) {
      detail = String(message)
    }
  } catch {
    // 非 JSON 错误体，保留 HTTP 状态描述
  }
  return new Error(`火山引擎视频生成失败: ${detail}`)
}

/**
 * 使用火山 Ark 协议生成视频，返回 videoUrl（短期有效，调用方负责持久化）
 */
export async function generateArkVideo(
  params: VideoGenParams,
  onStatus?: VideoStatusCallback,
  options?: PollOptions
): Promise<string> {
  const { provider, model, prompt, inputImage, duration, resolution, aspectRatio, signal } = params

  const apiKey = getFirstApiKey(provider)
  if (!apiKey) {
    throw new Error('火山引擎 API Key 未配置')
  }
  const baseUrl = getArkBaseUrl(provider.apiHost)
  const taskUrl = `${baseUrl}/contents/generations/tasks`

  logger.debug('提交 Ark 视频任务:', { model, hasImage: Boolean(inputImage), duration, resolution })
  const submitResponse = await fetch(taskUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      content: [
        { type: 'text', text: buildInstructionText(prompt, duration, resolution, aspectRatio) },
        ...(inputImage ? [{ type: 'image_url', image_url: { url: inputImage } }] : [])
      ]
    }),
    ...(signal ? { signal } : {})
  })
  if (!submitResponse.ok) {
    throw await toArkError(submitResponse)
  }
  const submitJson = await submitResponse.json()
  const taskId = submitJson?.id
  if (!taskId) {
    throw new Error(`火山引擎未返回任务 ID: ${JSON.stringify(submitJson).slice(0, 300)}`)
  }

  try {
    return await pollTask({ taskUrl, apiKey, taskId: String(taskId), signal, onStatus, options })
  } catch (error) {
    // 停止轮询时尽力删除远端任务，避免继续扣费
    void fetch(`${taskUrl}/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` }
    }).catch(() => {}) // fire-and-forget
    throw error
  }
}

async function pollTask(args: {
  taskUrl: string
  apiKey: string
  taskId: string
  signal?: AbortSignal
  onStatus?: VideoStatusCallback
  options?: PollOptions
}): Promise<string> {
  const { taskUrl, apiKey, taskId, signal, onStatus, options } = args
  const intervalMs = Math.max(0, options?.intervalMs ?? VIDEO_POLL_INTERVAL_MS)
  const startedAt = Date.now()
  const timeoutAt = startedAt + (options?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS)

  while (Date.now() < timeoutAt) {
    await abortableDelay(intervalMs, signal)
    onStatus?.({ state: 'queued', elapsedMs: Date.now() - startedAt })

    const response = await fetch(`${taskUrl}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      ...(signal ? { signal } : {})
    })
    if (!response.ok) {
      throw await toArkError(response)
    }
    const json = await response.json()
    const status = json?.status

    if (status === 'succeeded') {
      const videoUrl = json?.content?.video_url
      if (!videoUrl) {
        throw new Error(`火山引擎视频任务成功但未返回视频地址: ${JSON.stringify(json).slice(0, 300)}`)
      }
      return videoUrl
    }
    if (status === 'failed' || status === 'cancelled' || status === 'expired') {
      const message = json?.error?.message || status
      throw new Error(`火山引擎视频生成任务失败: ${message}`)
    }
    if (status === 'running') {
      onStatus?.({ state: 'running', elapsedMs: Date.now() - startedAt })
    }
    // queued 继续等待
  }
  throw new Error('火山引擎视频生成任务超时（10 分钟），请稍后在历史中查看或重试')
}
