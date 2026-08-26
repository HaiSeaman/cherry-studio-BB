/**
 * 阿里云百炼（DashScope）视频生成适配
 *
 * 百炼视频生成为异步任务协议（与 dashscopeImage 的异步生图同模式）：
 * 1. 提交：POST {base}/api/v1/services/aigc/video-generation/video-synthesis，header X-DashScope-Async: enable
 *    返回 output.task_id
 *    - 老协议（wan*-t2v/-i2v、wanx 系列）：input.img_url 传首帧图
 *    - 全能参考协议（wan3.x 等）：素材走 input.media 数组（首帧图为 { type: 'first_frame', url }），
 *      且服务端要求必须携带 media（纯文生请用 wan2.x-t2v 系列）
 *    - resolution 档位为大写 P（'1080P'/'720P'/'480P'），对话框小写值在此归一化
 * 2. 轮询：GET {base}/api/v1/tasks/{task_id} → output.task_status: PENDING/RUNNING/SUCCEEDED/FAILED/CANCELED/UNKNOWN
 *    SUCCEEDED 后从 output.video_url 取结果（URL 有效期约 24 小时，调用方需下载持久化）
 * 3. 停止轮询时尽力取消远端任务：POST {base}/api/v1/tasks/{task_id}/cancel（失败静默）
 *
 * 注意：具体参数名以官方文档为准；服务端不接受的可选参数按 dashscopeImage 的重试模式去掉后重试一次。
 */

import { loggerService } from '@logger'

import { getNativeBaseUrl, abortableDelay } from './dashscopeImage'
import {
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_TIMEOUT_MS,
  type VideoGenParams,
  type VideoStatusCallback,
  getFirstApiKey
} from './videoGenerationTypes'

const logger = loggerService.withContext('DashScopeVideo')

type PollOptions = { intervalMs?: number; timeoutMs?: number }

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

async function toDashScopeError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`
  try {
    const body = await response.json()
    const message = body?.message || body?.error?.message
    const code = body?.code || body?.error?.code
    if (message) {
      detail = code ? `${code}: ${message}` : String(message)
    }
  } catch {
    // 非 JSON 错误体，保留 HTTP 状态描述
  }
  return new Error(`阿里云百炼视频生成失败: ${detail}`)
}

/** 是否为可选参数不被接受的错误（去掉 resolution/duration 等重试即可） */
function isOptionalParamError(error: unknown): boolean {
  return error instanceof Error && /(size|resolution|duration|parameter|InvalidParameter)/i.test(error.message)
}

/**
 * 新版「全能参考」协议（wan3.x 等）素材走 input.media 数组；
 * 老协议（wan2.x-t2v/-i2v、wanx 系列）首帧走 input.img_url。
 * 这是协议路由（不同代际接口格式不同），不是模型白名单过滤。
 */
export function usesMediaProtocol(model: string): boolean {
  return !/^wan\d[\w.]*-(?:t2v|i2v)(?:-[\w-]+)?$/i.test(model) && !/^wanx/i.test(model)
}

/** 服务端要求 input.media 素材但请求未携带（wan3.x 等参考生视频模型在无图时的典型报错） */
function isMissingMediaError(error: unknown): boolean {
  return error instanceof Error && /input\.media|field required: media/i.test(error.message)
}

/**
 * 使用百炼原生协议生成视频，返回 videoUrl（短期有效，调用方负责持久化）
 */
export async function generateDashScopeVideo(
  params: VideoGenParams,
  onStatus?: VideoStatusCallback,
  options?: PollOptions
): Promise<string> {
  const { provider, model, prompt, inputImage, duration, resolution, aspectRatio, signal } = params

  const apiKey = getFirstApiKey(provider)
  if (!apiKey) {
    throw new Error('阿里云百炼 API Key 未配置')
  }
  const baseUrl = getNativeBaseUrl(provider.apiHost)
  const submitUrl = `${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`
  // 百炼 resolution 档位为大写 P（'1080P'/'720P'/'480P'），对话框传小写时归一化
  const normalizedResolution = resolution?.trim().toUpperCase()
  const useMedia = usesMediaProtocol(model)

  const buildBody = (withOptionalParams: boolean) => ({
    model,
    input: useMedia
      ? {
          // 全能参考协议：素材为 media 数组（首帧图用 first_frame 类型）
          ...(prompt ? { prompt } : {}),
          ...(inputImage ? { media: [{ type: 'first_frame', url: inputImage }] } : {})
        }
      : {
          prompt: prompt || '',
          ...(inputImage ? { img_url: inputImage } : {})
        },
    parameters: {
      ...(withOptionalParams && normalizedResolution ? { resolution: normalizedResolution } : {}),
      ...(withOptionalParams && duration ? { duration: Number(duration) } : {}),
      ...(withOptionalParams && aspectRatio ? { ratio: aspectRatio } : {})
    }
  })

  // 提交任务；可选参数被服务端拒绝时去掉后重试一次
  const submit = async (withOptionalParams: boolean): Promise<string> => {
    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: { ...authHeaders(apiKey), 'X-DashScope-Async': 'enable' },
      body: JSON.stringify(buildBody(withOptionalParams)),
      ...(signal ? { signal } : {})
    })
    if (!response.ok) {
      throw await toDashScopeError(response)
    }
    const json = await response.json()
    const taskId = json?.output?.task_id
    if (!taskId) {
      throw new Error(`阿里云百炼未返回任务 ID: ${JSON.stringify(json).slice(0, 300)}`)
    }
    return taskId as string
  }

  logger.debug('提交百炼视频任务:', { model, hasImage: Boolean(inputImage), duration, resolution, useMedia })
  let taskId: string
  try {
    taskId = await submit(true)
  } catch (error) {
    if (isMissingMediaError(error)) {
      throw new Error(
        `阿里云百炼视频生成失败: ${error instanceof Error ? error.message : String(error)}。` +
          '该模型为「参考生视频」模型，必须在输入框上传首帧/参考图后再生成；' +
          '若要纯文字生视频，请改用 wan2.x 文生系列模型（如 wan2.2-t2v-plus）'
      )
    }
    if (isOptionalParamError(error)) {
      logger.warn('可选参数不被接受，去掉 resolution/duration/ratio 重试:', { model, error: error as Error })
      taskId = await submit(false)
    } else {
      throw error
    }
  }

  try {
    return await pollTask({ baseUrl, apiKey, taskId, signal, onStatus, options })
  } catch (error) {
    // 停止轮询（用户中止或出错）时尽力取消远端任务，避免继续扣费
    void fetch(`${baseUrl}/api/v1/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: '{}'
    }).catch(() => {}) // fire-and-forget
    throw error
  }
}

async function pollTask(args: {
  baseUrl: string
  apiKey: string
  taskId: string
  signal?: AbortSignal
  onStatus?: VideoStatusCallback
  options?: PollOptions
}): Promise<string> {
  const { baseUrl, apiKey, taskId, signal, onStatus, options } = args
  const intervalMs = Math.max(0, options?.intervalMs ?? VIDEO_POLL_INTERVAL_MS)
  const timeoutAt = Date.now() + (options?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS)

  while (Date.now() < timeoutAt) {
    await abortableDelay(intervalMs, signal)
    onStatus?.({ state: 'queued', elapsedMs: Date.now() - (timeoutAt - (options?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS)) })

    const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, {
      headers: authHeaders(apiKey),
      ...(signal ? { signal } : {})
    })
    if (!response.ok) {
      throw await toDashScopeError(response)
    }
    const json = await response.json()
    const status = json?.output?.task_status

    if (status === 'SUCCEEDED') {
      const videoUrl = json?.output?.video_url ?? json?.output?.results?.[0]?.url
      if (!videoUrl) {
        throw new Error(`阿里云百炼视频任务成功但未返回视频地址: ${JSON.stringify(json).slice(0, 300)}`)
      }
      return videoUrl
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      const { code, message } = json?.output ?? {}
      throw new Error(`阿里云百炼视频生成任务失败: ${code ? `${code}: ` : ''}${message || status}`)
    }
    if (status === 'RUNNING') {
      onStatus?.({
        state: 'running',
        elapsedMs: Date.now() - (timeoutAt - (options?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS))
      })
    }
    // PENDING 继续等待
  }
  throw new Error('阿里云百炼视频生成任务超时（10 分钟），请稍后在历史中查看或重试')
}
