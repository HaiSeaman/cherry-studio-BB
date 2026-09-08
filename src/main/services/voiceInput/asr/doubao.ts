// 豆包（火山引擎）大模型流式语音识别适配器 —— 协议纯函数
// 官方文档：https://docs.volcengine.com/docs/6561/1354869（大模型流式语音识别 API）
// 地址：wss://openspeech.bytedance.com/api/v3/sauc/bigmodel（双向流式模式）
// 帧格式：4 字节头 + [可选 4 字节 sequence：flags&0x01] + 4 字节大端长度 + payload；整数一律大端

import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import type { ASRAdapter } from './types'

export type DoubaoMessageType = 'request' | 'audio' | 'audio-last'

/**
 * 构造 4 字节帧头（各字段占半字节，大端）：
 * Byte0: Protocol version(4)=0b0001 | Header size(4)=0b0001（值×4=4 字节）→ 0x11
 * Byte1: Message type(4) | flags(4)；type: 0b0001=request, 0b0010=audio, 0b1001=response；flags: 0b0010=末包
 * Byte2: Serialization(4)=0b0001(JSON) | Compression(4)=0b0000
 * Byte3: Reserved
 */
export function buildDoubaoHeader(messageType: DoubaoMessageType): Uint8Array {
  switch (messageType) {
    case 'request':
      return new Uint8Array([0x11, 0x10, 0x10, 0x00])
    case 'audio':
      return new Uint8Array([0x11, 0x20, 0x00, 0x00])
    case 'audio-last':
      return new Uint8Array([0x11, 0x22, 0x00, 0x00])
  }
}

export interface DoubaoClientRequestParams {
  uid: string
}

/** 构造大模型流式接口的 full client request JSON payload（鉴权在 HTTP Header，payload 只有 user/audio/request） */
export function buildClientRequestPayload(params: DoubaoClientRequestParams): string {
  return JSON.stringify({
    user: { uid: params.uid },
    audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
    request: { model_name: 'bigmodel' }
  })
}

/** 组装一帧：header + 4 字节大端 payload 长度 + payload */
export function buildDoubaoFrame(header: Uint8Array, payload: Uint8Array): Uint8Array {
  const lengthBytes = new Uint8Array(4)
  new DataView(lengthBytes.buffer).setUint32(0, payload.length)
  const frame = new Uint8Array(4 + 4 + payload.length)
  frame.set(header, 0)
  frame.set(lengthBytes, 4)
  frame.set(payload, 8)
  return frame
}

/** 从响应 JSON 中取识别文本（实际响应结构为 result.text，兼容顶层 text） */

export interface DoubaoFrame {
  payload: Uint8Array
  /** flags 为 0b0011（负 sequence 末包响应）时标记为末包 */
  isLast: boolean
}

export interface DoubaoFrameParseResult {
  frames: DoubaoFrame[]
  rest: Uint8Array
}

/**
 * 从累积字节流中解析出完整帧（支持粘包/半包）。
 * 帧结构：4 字节头 + [可选 4 字节 sequence：flags&0x01 时存在] + 4 字节大端长度 + payload。
 * 服务端响应帧通常带 sequence（flags=0x01），末包响应 flags=0x03。
 */
export function extractDoubaoFrames(buffer: Uint8Array): DoubaoFrameParseResult {
  const frames: DoubaoFrame[] = []
  let offset = 0
  while (buffer.length - offset >= 8) {
    const flags = buffer[offset + 1] & 0x0f
    let dataOffset = offset + 4
    if (flags & 0x01) {
      // sequence 扩展头（4 字节），跳过
      if (buffer.length - dataOffset < 4) break
      dataOffset += 4
    }
    if (buffer.length - dataOffset < 4) break
    const payloadLength = new DataView(buffer.buffer, buffer.byteOffset + dataOffset, 4).getUint32(0)
    const frameLength = dataOffset + 4 - offset + payloadLength
    if (buffer.length - offset < frameLength) break
    frames.push({
      payload: buffer.slice(dataOffset + 4, dataOffset + 4 + payloadLength),
      isLast: (flags & 0x0f) === 0x03
    })
    offset += frameLength
  }
  return { frames, rest: buffer.slice(offset) }
}

/** 生成 uid（官方建议 IMEI/MAC，用 uuid 代替可接受） */
export function newDoubaoUid(): string {
  return randomUUID()
}

export const DOUBAO_WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'

/** finalize 后等待末包响应的超时（毫秒），防止连接异常导致悬挂 */
const FINALIZE_TIMEOUT_MS = 5000

export interface DoubaoAdapterOptions {
  /** 新版控制台 APP Key（X-Api-Key 请求头） */
  apiKey: string
  /** 大模型资源 ID（X-Api-Resource-Id），如 volc.seedasr.sauc.duration（模型 2.0） */
  resourceId: string
  /** 覆盖连接地址（默认官方固定域名，便于测试） */
  url?: string
  onResult?: (text: string) => void
  onError?: (message: string) => void
}

/** ws RawData → Buffer（兼容字符串/数组/ArrayBuffer/Buffer） */
const toBuffer = (data: WebSocket.RawData): Buffer => {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (Buffer.isBuffer(data)) return data
  if (typeof data === 'string') return Buffer.from(data)
  return Buffer.from(data)
}

/**
 * 豆包（火山引擎）大模型流式语音识别适配器：
 * Header 鉴权（X-Api-Key + X-Api-Resource-Id）→ 首帧（model_name=bigmodel）→ 二进制音频帧 → 末包帧 → 收尾响应
 */
export class DoubaoASRAdapter implements ASRAdapter {
  private ws: WebSocket | null = null
  private pendingBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  private resultText = ''
  private finalizeResolver: ((text: string) => void) | null = null
  private finalizeTimer: ReturnType<typeof setTimeout> | null = null
  /** startSession 完成前的音频缓存（连接建立异步，渲染端可能先推音频） */
  private pendingAudio: Uint8Array[] = []
  private sessionSent = false

  constructor(private readonly options: DoubaoAdapterOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 大模型流式接口：鉴权走 HTTP 请求头（X-Api-Key + X-Api-Resource-Id；X-Api-Sequence 固定 -1）
      const ws = new WebSocket(this.options.url ?? DOUBAO_WS_URL, {
        headers: {
          'X-Api-Key': this.options.apiKey,
          'X-Api-Resource-Id': this.options.resourceId,
          'X-Api-Request-Id': randomUUID(),
          'X-Api-Connect-Id': randomUUID(),
          'X-Api-Sequence': '-1'
        }
      })
      this.ws = ws
      ws.on('open', () => resolve())
      ws.on('error', (error: Error) => reject(error))
      ws.on('message', (data: WebSocket.RawData) => this.handleMessage(toBuffer(data)))
      ws.on('close', () => {
        // 服务端在末包后主动关闭（code=1000，"finish last sequence"）；兜底 resolve 当前文本
        if (this.finalizeResolver) {
          const resolve = this.finalizeResolver
          this.finalizeResolver = null
          if (this.finalizeTimer) clearTimeout(this.finalizeTimer)
          resolve(this.resultText)
        }
      })
    })
  }

  startSession(): void {
    const payload = buildClientRequestPayload({ uid: newDoubaoUid() })
    const frame = buildDoubaoFrame(buildDoubaoHeader('request'), new TextEncoder().encode(payload))
    this.ws?.send(Buffer.from(frame))
    // 首帧发出后，补发此前缓存的音频
    for (const chunk of this.pendingAudio) {
      this.ws?.send(Buffer.from(buildDoubaoFrame(buildDoubaoHeader('audio'), chunk)))
    }
    this.pendingAudio = []
    this.sessionSent = true
  }

  sendAudio(chunk: Uint8Array): void {
    if (!this.sessionSent) {
      this.pendingAudio.push(chunk)
      return
    }
    const frame = buildDoubaoFrame(buildDoubaoHeader('audio'), chunk)
    this.ws?.send(Buffer.from(frame))
  }

  stopAndFinalize(): Promise<string> {
    if (this.finalizeResolver) return Promise.resolve(this.resultText)
    return new Promise((resolve) => {
      this.finalizeResolver = resolve
      try {
        // 末包帧（空 payload）通知服务端没有更多音频
        const frame = buildDoubaoFrame(buildDoubaoHeader('audio-last'), new Uint8Array(0))
        this.ws?.send(Buffer.from(frame))
      } catch {
        // 连接未就绪/已断开：直接返回当前文本，避免悬挂
        this.finalizeResolver = null
        resolve(this.resultText)
        return
      }
      // 保险：超时未收到末包响应则直接返回当前文本
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

  private handleMessage(data: Buffer): void {
    const merged = new Uint8Array(this.pendingBytes.length + data.length)
    merged.set(this.pendingBytes, 0)
    merged.set(data, this.pendingBytes.length)
    const { frames, rest } = extractDoubaoFrames(merged)
    this.pendingBytes = rest
    for (const frame of frames) {
      this.handleFrame(new TextDecoder().decode(frame.payload), frame.isLast)
    }
  }

  private handleFrame(json: string, isLast: boolean): void {
    let message: { code?: number; message?: string; text?: string; result?: { text?: string } }
    try {
      message = JSON.parse(json)
    } catch {
      return
    }
    if (message.code !== undefined && message.code !== 1000) {
      if (this.finalizeTimer) {
        clearTimeout(this.finalizeTimer)
        this.finalizeTimer = null
      }
      this.finalizeResolver?.(this.resultText)
      this.finalizeResolver = null
      this.options.onError?.(message.message ?? `错误码 ${message.code}`)
      return
    }
    // 大模型接口（result_type 默认 full）每次返回累计全量文本：直接替换，
    // 天然兼容服务端对前文的修正改写，不会像前缀拼接那样产生重复文本
    const text = message.result?.text ?? message.text ?? ''
    if (text) {
      this.resultText = text
      this.options.onResult?.(this.resultText)
    }
    // flags=0b0011（末包响应）→ 收尾
    if (isLast && this.finalizeResolver) {
      const resolve = this.finalizeResolver
      this.finalizeResolver = null
      if (this.finalizeTimer) clearTimeout(this.finalizeTimer)
      resolve(this.resultText)
    }
  }
}
