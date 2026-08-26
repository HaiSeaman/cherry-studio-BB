/**
 * 腾讯云混元生视频适配
 *
 * 混元生视频走腾讯云 vclm 产品（非 OpenAI 风格），异步任务协议 + TC3 签名（见 tc3Signature.ts）。
 * 已按官方现行文档核对（https://cloud.tencent.com/document/api/1616/126160）：
 * 1. 提交：POST https://vclm.tencentcloudapi.com，X-TC-Action=SubmitHunyuanToVideoJob，Version=2024-05-23
 *    body: { Prompt, Image?: { Url | Base64 }, Resolution? }（图生视频传 base64/url；分辨率仅 '720p'）
 *    返回 Response.JobId
 * 2. 轮询：X-TC-Action=DescribeHunyuanToVideoJob，body { JobId }
 *    Response.Status: DONE → ResultVideoUrl；FAIL → ErrorMessage；RUN/WAIT 继续等待
 * 3. Region 为必选公共参数（默认 ap-guangzhou）；无远端取消接口：停止轮询仅本地生效
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

const HUNYUAN_HOST = 'vclm.tencentcloudapi.com'
const HUNYUAN_SERVICE = 'vclm'
const HUNYUAN_VERSION = '2024-05-23'
/** vclm 混元生视频的必选公共参数；默认广州地域 */
const HUNYUAN_REGION = 'ap-guangzhou'

/** data URL → 纯 base64；http(s) URL 原样返回。官方 Image 结构为 { Base64 } 或 { Url } */
function splitImageData(inputImage: string): { Image?: { Base64?: string; Url?: string } } {
  if (inputImage.startsWith('data:')) {
    const commaIndex = inputImage.indexOf(',')
    return { Image: { Base64: commaIndex >= 0 ? inputImage.slice(commaIndex + 1) : inputImage } }
  }
  return { Image: { Url: inputImage } }
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
    timestamp: Math.floor(Date.now() / 1000),
    region: HUNYUAN_REGION
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
    'SubmitHunyuanToVideoJob',
    {
      Prompt: prompt || '',
      ...imageData,
      ...(resolution ? { Resolution: resolution } : {})
    },
    secretId,
    secretKey,
    signal
  )
  const taskId = submitResp?.JobId
  if (!taskId) {
    throw new Error('腾讯混元未返回任务 ID')
  }

  const intervalMs = Math.max(0, options?.intervalMs ?? VIDEO_POLL_INTERVAL_MS)
  const startedAt = Date.now()
  const timeoutAt = startedAt + (options?.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS)

  while (Date.now() < timeoutAt) {
    await abortableDelay(intervalMs, signal)
    onStatus?.({ state: 'queued', elapsedMs: Date.now() - startedAt })

    const resp = await callTencentApi('DescribeHunyuanToVideoJob', { JobId: taskId }, secretId, secretKey, signal)
    const status = resp?.Status

    if (status === 'DONE') {
      const videoUrl = resp?.ResultVideoUrl
      if (!videoUrl) {
        throw new Error(`腾讯混元视频任务成功但未返回视频地址: ${JSON.stringify(resp).slice(0, 300)}`)
      }
      return videoUrl
    }
    if (status === 'FAIL') {
      throw new Error(`腾讯混元视频生成任务失败: ${resp?.ErrorMessage || resp?.Message || status}`)
    }
    if (status === 'RUN') {
      onStatus?.({ state: 'running', elapsedMs: Date.now() - startedAt })
    }
    // WAIT 继续等待
  }
  throw new Error('腾讯混元视频生成任务超时（10 分钟），请稍后在历史中查看或重试')
}
