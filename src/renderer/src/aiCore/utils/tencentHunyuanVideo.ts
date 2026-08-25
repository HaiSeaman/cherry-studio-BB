/**
 * 腾讯云混元视频生成适配
 *
 * 混元视频走腾讯云 API（非 OpenAI 风格），异步任务协议 + TC3 签名（见 tc3Signature.ts）：
 * 1. 提交：POST https://hunyuan.tencentcloudapi.com，X-TC-Action=SubmitHunyuanVideoJob
 *    body: { Prompt, ImageBase64?, Resolution? }（图生视频传 base64；分辨率 '480p'/'720p'/'1080p' 原样传递）
 *    返回 Response.TaskId
 * 2. 轮询：X-TC-Action=QueryHunyuanVideoJob，body { TaskId }
 *    Response.Status: Done → VideoUrl；Fail → ErrorMessage；Processing/Waiting 继续等待
 * 3. 无远端取消接口：停止轮询仅本地生效（远端任务自然结束）
 *
 * ⚠️ Action 名与字段以腾讯云官方文档为准；首次接通真实 Key 时需逐项核对。
 */

import { loggerService } from '@logger'

import { abortableDelay } from './dashscopeImage'
import { parseTencentCredentials, signTc3 } from './tc3Signature'
import {
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_TIMEOUT_MS,
  type VideoGenParams,
  type VideoStatusCallback
} from './videoGenerationTypes'

const logger = loggerService.withContext('TencentHunyuanVideo')

type PollOptions = { intervalMs?: number; timeoutMs?: number }

const HUNYUAN_HOST = 'hunyuan.tencentcloudapi.com'
const HUNYUAN_SERVICE = 'hunyuan'
const HUNYUAN_VERSION = '2023-09-01'

/** data URL → 纯 base64（ImageBase64）；http(s) URL 原样返回（ImageUrl） */
function splitImageData(inputImage: string): { ImageBase64?: string; ImageUrl?: string } {
  if (inputImage.startsWith('data:')) {
    const commaIndex = inputImage.indexOf(',')
    return { ImageBase64: commaIndex >= 0 ? inputImage.slice(commaIndex + 1) : inputImage }
  }
  return { ImageUrl: inputImage }
}

/** 签名并发起一次腾讯云 API 调用，返回 Response 体 */
async function callTencentApi(
  action: string,
  body: Record<string, unknown>,
  secretId: string,
  secretKey: string,
  signal?: AbortSignal
): Promise<any> {
  const payload = JSON.stringify(body)
  const headers = await signTc3({
    secretId,
    secretKey,
    service: HUNYUAN_SERVICE,
    host: HUNYUAN_HOST,
    action,
    version: HUNYUAN_VERSION,
    payload,
    timestamp: Math.floor(Date.now() / 1000)
  })
  const response = await fetch(`https://${HUNYUAN_HOST}`, {
    method: 'POST',
    headers,
    body: payload,
    ...(signal ? { signal } : {})
  })
  if (!response.ok) {
    throw new Error(`腾讯混元视频生成失败: ${response.status} ${response.statusText}`)
  }
  const json = await response.json()
  const resp = json?.Response
  if (!resp) {
    throw new Error(`腾讯混元视频生成响应异常: ${JSON.stringify(json).slice(0, 300)}`)
  }
  // 腾讯云通用错误（如签名/权限问题）在 Response.Error 里
  if (resp.Error) {
    throw new Error(
      `腾讯混元视频生成失败: ${resp.Error.Code ? `${resp.Error.Code}: ` : ''}${resp.Error.Message || '未知错误'}`
    )
  }
  return resp
}

/**
 * 使用腾讯云混元协议生成视频，返回 videoUrl（短期有效，调用方负责持久化）
 */
export async function generateHunyuanVideo(
  params: VideoGenParams,
  onStatus?: VideoStatusCallback,
  options?: PollOptions
): Promise<string> {
  const { provider, prompt, inputImage, resolution, signal } = params

  const { secretId, secretKey } = parseTencentCredentials(provider.apiKey)

  const imageData = inputImage ? splitImageData(inputImage) : {}
  logger.debug('提交混元视频任务:', { hasImage: Boolean(inputImage), resolution })

  const submitResp = await callTencentApi(
    'SubmitHunyuanVideoJob',
    {
      Prompt: prompt || '',
      ...imageData,
      ...(resolution ? { Resolution: resolution } : {})
    },
    secretId,
    secretKey,
    signal
  )
  const taskId = submitResp?.TaskId
  if (!taskId) {
    throw new Error('腾讯混元未返回任务 ID')
  }

  const intervalMs = Math.max(0, options?.intervalMs ?? VIDEO_POLL_INTERVAL_MS)
  const startedAt = Date.now()
  const timeoutAt = startedAt + (options?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS)

  while (Date.now() < timeoutAt) {
    await abortableDelay(intervalMs, signal)
    onStatus?.({ state: 'queued', elapsedMs: Date.now() - startedAt })

    const resp = await callTencentApi('QueryHunyuanVideoJob', { TaskId: taskId }, secretId, secretKey, signal)
    const status = resp?.Status

    if (status === 'Done') {
      const videoUrl = resp?.VideoUrl
      if (!videoUrl) {
        throw new Error(`腾讯混元视频任务成功但未返回视频地址: ${JSON.stringify(resp).slice(0, 300)}`)
      }
      return videoUrl
    }
    if (status === 'Fail') {
      throw new Error(`腾讯混元视频生成任务失败: ${resp?.ErrorMessage || resp?.Message || status}`)
    }
    if (status === 'Processing') {
      onStatus?.({ state: 'running', elapsedMs: Date.now() - startedAt })
    }
    // Waiting 继续等待
  }
  throw new Error('腾讯混元视频生成任务超时（10 分钟），请稍后在历史中查看或重试')
}
