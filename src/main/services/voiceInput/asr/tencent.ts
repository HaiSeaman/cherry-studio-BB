// 腾讯云实时语音识别适配器 —— 协议纯函数
// 官方文档：https://cloud.tencent.com/document/product/1093/48982
// 地址：wss://asr.cloud.tencent.com/asr/v2/<appid>?<签名参数>
// 鉴权：HMAC-SHA1 签名（除 signature 外参数按字典序排序拼接 URL 原文 → base64 → urlencode）

import { createHmac, randomInt, randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import type { ASRAdapter } from './types'

export interface TencentSignParams {
  appid: string
  secretid: string
  secretkey: string
  timestamp: number
  expired: number
  nonce: number
  engine_model_type: string
  voice_id: string
  voice_format: number
}

/** 参与签名的参数（除 signature 外全部） */
const SIGN_PARAM_KEYS = [
  'appid',
  'engine_model_type',
  'expired',
  'nonce',
  'secretid',
  'timestamp',
  'voice_format',
  'voice_id'
] as const

/**
 * HMAC-SHA1 签名：对除 signature 外所有参数按字典序排序，
 * 拼接 `asr.cloud.tencent.com/asr/v2/<appid>?k1=v1&k2=v2...` 作为签名原文，
 * 用 SecretKey 做 HMAC-SHA1 后 base64 输出（调用方再 urlencode）。
 */
export function signTencentQuery(params: TencentSignParams): string {
  const sorted = [...SIGN_PARAM_KEYS]
    .sort()
    .map((key) => `${key}=${params[key as keyof TencentSignParams]}`)
    .join('&')
  const source = `asr.cloud.tencent.com/asr/v2/${params.appid}?${sorted}`
  return createHmac('sha1', params.secretkey).update(source).digest('base64')
}

export interface TencentWsUrlParams {
  appid: string
  secretId: string
  secretKey: string
  engineModel: string
  voiceId: string
  timestamp?: number
  expired?: number
  nonce?: number
}

/** 构造带签名参数的 WebSocket 连接地址（签名需 urlencode 后才能拼进 URL） */
export function buildTencentWsUrl(params: TencentWsUrlParams): string {
  const now = Math.floor(Date.now() / 1000)
  const timestamp = params.timestamp ?? now
  const expired = params.expired ?? now + 10 * 24 * 60 * 60 // 10 天内（官方要求 <90 天）
  const nonce = params.nonce ?? randomInt(1, 1000000000)

  const query: Record<string, string> = {
    appid: params.appid,
    secretid: params.secretId,
    timestamp: String(timestamp),
    expired: String(expired),
    nonce: String(nonce),
    engine_model_type: params.engineModel,
    voice_id: params.voiceId,
    voice_format: '1' // 1 = pcm
  }

  const signature = signTencentQuery({
    appid: params.appid,
    secretid: params.secretId,
    secretkey: params.secretKey,
    timestamp,
    expired,
    nonce,
    engine_model_type: params.engineModel,
    voice_id: params.voiceId,
    voice_format: 1
  })

  const sortedQuery = Object.keys(query)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(query[key])}`)
    .join('&')
  return `wss://asr.cloud.tencent.com/asr/v2/${params.appid}?${sortedQuery}&signature=${encodeURIComponent(signature)}`
}

export interface TencentParsedMessage {
  code: number
  text: string
  final: boolean
  /** 识别结果类型：0 开始 / 1 中间 / 2 稳态结束 */
  sliceType?: number
  errorMessage?: string
}

/** 解析服务端 JSON 文本消息（code=0 正常；text 取 result.voice_text_str；final=1 表示全部识别结束） */
export function parseTencentMessage(json: string): TencentParsedMessage {
  try {
    const message = JSON.parse(json) as {
      code?: number
      message?: string
      final?: number
      result?: { voice_text_str?: string; slice_type?: number }
    }
    const code = message.code ?? -1
    return {
      code,
      text: message.result?.voice_text_str ?? '',
      final: message.final === 1,
      sliceType: message.result?.slice_type,
      errorMessage: code === 0 ? undefined : (message.message ?? `错误码 ${code}`)
    }
  } catch {
    return { code: -1, text: '', final: false, errorMessage: '无法解析服务端消息' }
  }
}

/** 结束消息：通知服务端音频流上传完成 */
export function buildTencentEndMessage(): string {
  return '{"end":true}'
}

/** finalize 后等待 final=1 响应的超时（毫秒），防止连接异常导致悬挂 */
const FINALIZE_TIMEOUT_MS = 5000

export interface TencentAdapterOptions {
  appid: string
  secretId: string
  secretKey: string
  engineModel: string
  /** 覆盖连接地址（默认官方固定域名，便于测试） */
  url?: string
  onResult?: (text: string) => void
  onError?: (message: string) => void
}

/**
 * 腾讯云实时语音识别适配器：
 * 握手 URL 带 HMAC 签名 → 直接发二进制 PCM → 收文本消息（slice_type=2 稳态追加）→ 发 {"end":true} → final=1 收尾
 */
export class TencentASRAdapter implements ASRAdapter {
  private ws: WebSocket | null = null
  private resultText = ''
  private finalizeResolver: ((text: string) => void) | null = null
  private finalizeTimer: ReturnType<typeof setTimeout> | null = null
  /** startSession 完成前的音频缓存（连接建立异步，渲染端可能先推音频） */
  private pendingAudio: Uint8Array[] = []
  private sessionSent = false

  constructor(private readonly options: TencentAdapterOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url =
        this.options.url ??
        buildTencentWsUrl({
          appid: this.options.appid,
          secretId: this.options.secretId,
          secretKey: this.options.secretKey,
          engineModel: this.options.engineModel,
          voiceId: randomUUID()
        })
      const ws = new WebSocket(url)
      this.ws = ws
      ws.on('open', () => resolve())
      ws.on('error', (error: Error) => reject(error))
      ws.on('message', (data: WebSocket.RawData) => this.handleMessage(data.toString()))
      ws.on('close', () => {
        // 连接中断：立即返回当前文本，避免 finalize 等满超时
        if (this.finalizeResolver) {
          const resolve = this.finalizeResolver
          this.finalizeResolver = null
          if (this.finalizeTimer) clearTimeout(this.finalizeTimer)
          resolve(this.resultText)
        }
      })
    })
  }

  /** 腾讯协议无显式开始消息，连接后直接发音频即可；这里的职责是放行缓存音频 */
  startSession(): void {
    for (const chunk of this.pendingAudio) {
      this.ws?.send(Buffer.from(chunk))
    }
    this.pendingAudio = []
    this.sessionSent = true
  }

  sendAudio(chunk: Uint8Array): void {
    if (!this.sessionSent) {
      this.pendingAudio.push(chunk)
      return
    }
    this.ws?.send(Buffer.from(chunk))
  }

  stopAndFinalize(): Promise<string> {
    if (this.finalizeResolver) return Promise.resolve(this.resultText)
    return new Promise((resolve) => {
      this.finalizeResolver = resolve
      try {
        this.ws?.send(buildTencentEndMessage())
      } catch {
        // 连接未就绪/已断开：直接返回当前文本，避免悬挂
        this.finalizeResolver = null
        resolve(this.resultText)
        return
      }
      this.finalizeTimer = setTimeout(() => {
        this.finalizeTimer = null
        this.finalizeResolver?.(this.resultText)
        this.finalizeResolver = null
      }, FINALIZE_TIMEOUT_MS)
    })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
    if (this.finalizeTimer) {
      clearTimeout(this.finalizeTimer)
      this.finalizeTimer = null
    }
  }

  private handleMessage(json: string): void {
    const message = parseTencentMessage(json)
    if (message.code !== 0) {
      if (this.finalizeTimer) {
        clearTimeout(this.finalizeTimer)
        this.finalizeTimer = null
      }
      this.finalizeResolver?.(this.resultText)
      this.finalizeResolver = null
      this.options.onError?.(message.errorMessage ?? `错误码 ${message.code}`)
      return
    }
    if (message.text) {
      if (message.sliceType === 2) {
        // 稳态结果：本句已确定，落盘并回调（流式打字以这个位置为准向后追加）
        this.resultText += message.text
        this.options.onResult?.(this.resultText)
      } else if (message.sliceType === 0 || message.sliceType === 1) {
        // 中间结果：本句尚未定稿，只作为实时上屏预览（已确定文本 + 当前分句），不落盘
        this.options.onResult?.(this.resultText + message.text)
      }
    }
    if (message.final && this.finalizeResolver) {
      const resolve = this.finalizeResolver
      this.finalizeResolver = null
      if (this.finalizeTimer) clearTimeout(this.finalizeTimer)
      resolve(this.resultText)
    }
  }
}
