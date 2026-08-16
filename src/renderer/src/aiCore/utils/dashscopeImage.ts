/**
 * 阿里云百炼（DashScope）原生图像生成适配
 *
 * 背景：百炼的 OpenAI 兼容接口（compatible-mode）只提供 chat/completions 等端点，
 * 不存在 /v1/images/generations 与 /v1/images/edits，因此 OpenAI 兼容通道的生图必然 404。
 * 生图必须走百炼原生协议，分两类：
 *
 * 1. 同步接口（推荐）：POST {base}/api/v1/services/aigc/multimodal-generation/generation
 *    类 chat 结构（input.messages），支持文生图与图生图；
 *    适用模型：qwen-image-2.0/3.0 系列、qwen-image-edit 系列、wan2.5+-image 系列、wan2.6-t2i、z-image 系列
 *
 * 2. 异步任务接口：POST {base}/api/v1/services/aigc/text2image/image-synthesis（X-DashScope-Async: enable）
 *    返回 task_id 后轮询 GET {base}/api/v1/tasks/{task_id}，仅支持文生图；
 *    适用模型：wanx 系列、wan2.0~2.5 t2i 系列、qwen-image/-max/-plus（1.0 系列）
 *
 * 注意：size 参数百炼用 `*` 分隔（1024*1024），OpenAI 风格为 `x`，需转换。
 */

import { loggerService } from '@logger'
import type { Provider } from '@renderer/types'
import { getLowerBaseModelName } from '@renderer/utils'

const logger = loggerService.withContext('DashScopeImage')

/** 百炼 OpenAI 兼容域名（含国际站/美西站） */
const DASHSCOPE_HOSTS = ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com']

function extractHostname(url: string): string {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return (url || '').toLowerCase()
  }
}

/** 判断 Provider 是否为阿里云百炼（按 id 或 API 域名识别，兼容自定义业务空间域名） */
export function isDashScopeProvider(provider: Provider): boolean {
  if (!provider) {
    return false
  }
  if (provider.id === 'dashscope') {
    return true
  }
  const host = extractHostname(provider.apiHost || '')
  return DASHSCOPE_HOSTS.includes(host) || host.endsWith('.maas.aliyuncs.com')
}

/** 同步接口模型：wan2.5+ image 系列、wan2.6-t2i、qwen-image 2.0/3.0 与 edit 系列、z-image 系列 */
const SYNC_MODEL_REGEX = /^wan2\.[5-9]-image|^wan2\.6-t2i|^qwen-image-(?:edit|[23]\.0)|^z-image/i

/** 异步任务模型：wanx 系列、wan2.x t2i 系列、qwen-image 1.0 系列（qwen-image/-max/-plus 及带日期后缀） */
const ASYNC_MODEL_REGEX = /^wanx|^wan\d[\w.]*-?t2i|^qwen-image(?:-(?:max|plus|20\d{2}-\d{2}-\d{2}))*$/i

function isSyncImageModel(modelId: string): boolean {
  const id = getLowerBaseModelName(modelId)
  if (SYNC_MODEL_REGEX.test(id)) {
    return true
  }
  if (ASYNC_MODEL_REGEX.test(id)) {
    return false
  }
  // 未知新型号默认走同步接口（新模型基本都支持同步调用）
  return true
}

/**
 * 从配置的 apiHost 推导原生 API 根地址：
 * 'https://dashscope.aliyuncs.com/compatible-mode/v1/' → 'https://dashscope.aliyuncs.com'
 */
export function getNativeBaseUrl(apiHost: string): string {
  let url = (apiHost || 'https://dashscope.aliyuncs.com').trim()
  const compatibleIdx = url.indexOf('/compatible-mode')
  if (compatibleIdx > 0) {
    url = url.slice(0, compatibleIdx)
  }
  // 去掉误填的 /v1、/api/v1 等版本段与结尾斜杠
  url = url.replace(/\/(?:api\/)?v\d+\/?$/i, '')
  return url.replace(/\/+$/, '')
}

/** '1024x1024' → '1024*1024'；'2K' 等缩写原样保留 */
export function toDashScopeSize(imageSize?: string): string | undefined {
  if (!imageSize) {
    return undefined
  }
  const size = imageSize.trim()
  if (/^\d+k$/i.test(size)) {
    return size.toUpperCase()
  }
  if (/^\d+x\d+$/i.test(size)) {
    return size.replace(/x/i, '*')
  }
  return size
}

export type DashScopeImageParams = {
  provider: Provider
  /** 模型 ID */
  model: string
  /** 提示词 */
  prompt: string
  /** 参考图（图生图；仅同步接口模型支持），支持 http(s) URL 与 data URL */
  inputImages?: (Buffer | Uint8Array | string)[]
  /** 输出尺寸（OpenAI 风格 '1024x1024' 或百炼缩写 '2K'） */
  imageSize?: string
  /** 生成数量（1-4） */
  batchSize?: number
  /** 中止信号 */
  signal?: AbortSignal
}

/**
 * 使用百炼原生协议生成图像，返回图片 URL 列表（URL 有效期 24 小时）
 */
export async function generateDashScopeImage(params: DashScopeImageParams): Promise<string[]> {
  const { provider, model, prompt, inputImages = [], imageSize, batchSize = 1, signal } = params

  // 异步任务接口（text2image/image-synthesis）仅支持文生图，参考图会被静默丢弃，
  // 必须提前报错引导用户换用支持编辑的同步接口模型
  if (!isSyncImageModel(model) && inputImages.length > 0) {
    throw new Error(
      `模型 ${model} 不支持图生图（百炼异步生图模型仅支持文生图），请换用 qwen-image-2.0/3.0、qwen-image-edit 或 wan2.5+ image 系列，或移除参考图`
    )
  }

  const apiKey = (provider.apiKey || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)[0]
  if (!apiKey) {
    throw new Error('阿里云百炼 API Key 未配置')
  }

  const baseUrl = getNativeBaseUrl(provider.apiHost)
  const size = toDashScopeSize(imageSize)
  const n = Math.min(Math.max(1, batchSize), 4)

  const images = isSyncImageModel(model)
    ? await syncGenerate({ baseUrl, apiKey, model, prompt, inputImages, size, n, signal })
    : await asyncGenerate({ baseUrl, apiKey, model, prompt, size, n, signal })

  if (images.length === 0) {
    throw new Error('阿里云百炼未返回图像结果')
  }
  return images
}

type RequestParams = {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  size?: string
  n: number
  signal?: AbortSignal
}

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
  return new Error(`阿里云百炼图像生成失败: ${detail}`)
}

/** 是否为尺寸参数错误（qwen-image 1.0 系列仅支持固定预设尺寸，去掉 size 重试即可） */
function isSizeError(error: unknown): boolean {
  return error instanceof Error && /size|分辨率/i.test(error.message)
}

/** 同步接口：文生图 / 图生图 */
async function syncGenerate(params: RequestParams & { inputImages: (Buffer | Uint8Array | string)[] }) {
  const { baseUrl, apiKey, model, prompt, inputImages, size, n, signal } = params
  const url = `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`

  const buildBody = (withSize: boolean) => ({
    model,
    input: {
      messages: [
        {
          role: 'user',
          content: [...inputImages.map((image) => ({ image: normalizeImage(image) })), { text: prompt || '' }]
        }
      ]
    },
    parameters: {
      n,
      ...(withSize && size ? { size } : {})
    }
  })

  const request = async (withSize: boolean) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(buildBody(withSize)),
      signal
    })
    if (!response.ok) {
      throw await toDashScopeError(response)
    }
    const json = await response.json()

    const images: string[] = []
    for (const choice of json?.output?.choices ?? []) {
      for (const part of choice?.message?.content ?? []) {
        if (typeof part?.image === 'string' && part.image) {
          images.push(part.image)
        }
      }
    }
    if (images.length === 0) {
      const message = json?.message || json?.code || JSON.stringify(json).slice(0, 300)
      throw new Error(`阿里云百炼图像生成失败: ${message}`)
    }
    return images
  }

  try {
    return await request(true)
  } catch (error) {
    if (isSizeError(error) && size) {
      logger.warn('size 参数不被接受，去掉 size 后重试:', { model, size })
      return await request(false)
    }
    throw error
  }
}

/** 异步任务接口：提交任务 + 轮询结果（仅文生图） */
async function asyncGenerate(params: RequestParams) {
  const { baseUrl, apiKey, model, prompt, size, n, signal } = params
  const submitUrl = `${baseUrl}/api/v1/services/aigc/text2image/image-synthesis`

  const buildBody = (withSize: boolean) => ({
    model,
    input: { prompt: prompt || '' },
    parameters: {
      n,
      ...(withSize && size ? { size } : {})
    }
  })

  const submit = async (withSize: boolean) => {
    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: { ...authHeaders(apiKey), 'X-DashScope-Async': 'enable' },
      body: JSON.stringify(buildBody(withSize)),
      signal
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

  let taskId: string
  try {
    taskId = await submit(true)
  } catch (error) {
    if (isSizeError(error) && size) {
      logger.warn('size 参数不被接受，去掉 size 后重试:', { model, size })
      taskId = await submit(false)
    } else {
      throw error
    }
  }

  // 轮询任务状态（间隔 2s，最长 5 分钟）
  const timeoutAt = Date.now() + 5 * 60 * 1000
  while (Date.now() < timeoutAt) {
    await abortableDelay(2000, signal)

    const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, {
      headers: authHeaders(apiKey),
      signal
    })
    if (!response.ok) {
      throw await toDashScopeError(response)
    }
    const json = await response.json()
    const status = json?.output?.task_status

    if (status === 'SUCCEEDED') {
      const urls = (json?.output?.results ?? [])
        .map((result: { url?: string }) => result?.url)
        .filter((url: string | undefined): url is string => Boolean(url))
      if (urls.length === 0) {
        throw new Error(`阿里云百炼任务成功但未返回图片: ${JSON.stringify(json).slice(0, 300)}`)
      }
      return urls
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      const { code, message } = json?.output ?? {}
      throw new Error(`阿里云百炼图像生成任务失败: ${code ? `${code}: ` : ''}${message || status}`)
    }
    // PENDING / RUNNING 继续轮询
  }
  throw new Error('阿里云百炼图像生成任务超时（5 分钟）')
}

/** 参考图统一为字符串：二进制转 data URL，字符串原样返回 */
function normalizeImage(image: Buffer | Uint8Array | string): string {
  if (typeof image === 'string') {
    return image
  }
  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image)
  return `data:image/png;base64,${bytesToBase64(bytes)}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** 可被 AbortSignal 提前中断的延时 */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
