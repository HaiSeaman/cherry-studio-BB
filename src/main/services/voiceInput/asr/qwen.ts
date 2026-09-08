import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'

// 千问（阿里云百炼）实时语音识别适配器 —— 协议纯函数
// 官方接口：https://help.aliyun.com/zh/model-studio/fun-asr-realtime-websocket-api
// WebSocket 地址：wss://dashscope.aliyuncs.com/api-ws/v1/inference
// 鉴权：请求头 Authorization: Bearer <API Key>
// 交互：连上 → run-task → task-started → 二进制音频（100ms/包）→ result-generated → finish-task → task-finished → 关闭

/** 构造 run-task 报文（官方字段） */
export function buildRunTaskMessage(taskId: string, model: string, sampleRate: number, format: string): string {
  return JSON.stringify({
    header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model,
      parameters: { sample_rate: sampleRate, format },
      input: {}
    }
  })
}

/** 构造 finish-task 报文（官方字段） */
export function buildFinishTaskMessage(taskId: string): string {
  return JSON.stringify({
    header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
    payload: { input: {} }
  })
}

/** result-generated 的 sentence 字段（官方协议） */
export interface QwenSentence {
  /** 当前分句的识别文本（句内累计，服务端可能修正改写，并非只增长） */
  text: string
  /** 是否为该句首个中间结果（新句子开始） */
  sentenceBegin: boolean
  /** 是否为该句最终结果（true=句子已结束） */
  sentenceEnd: boolean
  /** 心跳包（true 时应跳过，sentence_id 固定为 0） */
  heartbeat: boolean
}

export type QwenServerEvent =
  | { event: 'task-started' }
  | { event: 'result-generated'; sentence: QwenSentence }
  | { event: 'task-finished' }
  | { event: 'task-failed'; errorMessage: string }
  | { event: 'unknown' }

/** 解析服务端 JSON 文本事件 */
export function parseServerEvent(json: string): QwenServerEvent {
  try {
    const message = JSON.parse(json) as {
      header?: { event?: string; error_message?: string }
      payload?: { output?: { sentence?: { text?: string; sentence_begin?: boolean; sentence_end?: boolean; heartbeat?: boolean } } }
    }
    switch (message?.header?.event) {
      case 'task-started':
        return { event: 'task-started' }
      case 'result-generated': {
        const s = message.payload?.output?.sentence ?? {}
        return {
          event: 'result-generated',
          sentence: {
            text: s.text ?? '',
            sentenceBegin: s.sentence_begin === true,
            sentenceEnd: s.sentence_end === true,
            heartbeat: s.heartbeat === true
          }
        }
      }
      case 'task-finished':
        return { event: 'task-finished' }
      case 'task-failed':
        return { event: 'task-failed', errorMessage: message.header?.error_message ?? '未知错误' }
      default:
        return { event: 'unknown' }
    }
  } catch {
    return { event: 'unknown' }
  }
}

/** 生成 32 位十六进制 task_id（官方示例要求） */
export function newTaskId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 32)
}

export const QWEN_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'

/** finalize 后等待 task-finished 的超时（毫秒），防止连接异常导致悬挂 */
const FINALIZE_TIMEOUT_MS = 5000

export interface QwenAdapterOptions {
  apiKey: string
  model: string
  /** 采样率，默认 16000 */
  sampleRate?: number
  /** 音频格式，默认 pcm */
  format?: string
  /** 覆盖连接地址（默认官方固定域名，便于测试） */
  url?: string
  onResult?: (text: string) => void
  onError?: (message: string) => void
}

/** 千问（百炼）实时语音识别适配器：ws 连接 → run-task → 音频流 → finish-task → 结果 */
export class QwenASRAdapter {
  private ws: WebSocket | null = null
  private readonly taskId = newTaskId()
  private started = false
  /** 已结束分句的累计文本 */
  private finalizedText = ''
  /** 当前分句的最新文本（服务端会增长也会修正改写） */
  private currentSentence = ''
  private resultText = ''
  private pendingChunks: Uint8Array[] = []
  private finalizeResolver: ((text: string) => void) | null = null
  /** finalize 超时保险定时器 */
  private finalizeTimer: ReturnType<typeof setTimeout> | null = null
  /** task-started 到达后才触发（提前 finalize 时挂起等待） */
  private pendingFinalize: (() => void) | null = null

  constructor(private readonly options: QwenAdapterOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Node 内置 WebSocket 不支持自定义请求头，使用 ws 库带 Authorization 鉴权
      const ws = new WebSocket(this.options.url ?? QWEN_WS_URL, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` }
      })
      this.ws = ws
      ws.on('open', () => resolve())
      ws.on('error', (error: Error) => reject(error))
      ws.on('message', (data: WebSocket.RawData) => this.handleMessage(data.toString()))
      ws.on('close', () => {
        // 连接中断（网络断开/服务端主动关闭）：立即返回当前文本并触发挂起的收尾，避免 finalize 悬挂
        this.settleFinalize(this.resultText)
        this.pendingFinalize?.()
        this.pendingFinalize = null
      })
    })
  }

  startSession(): void {
    const message = buildRunTaskMessage(
      this.taskId,
      this.options.model,
      this.options.sampleRate ?? 16000,
      this.options.format ?? 'pcm'
    )
    this.ws?.send(message)
  }

  sendAudio(chunk: Uint8Array): void {
    if (!this.started) {
      // task-started 尚未到达：缓存音频，事件到达后统一发送
      this.pendingChunks.push(chunk)
      return
    }
    this.ws?.send(Buffer.from(chunk))
  }

  stopAndFinalize(): Promise<string> {
    if (this.started) return this.doFinalize()
    // 极短按键：task-started 未到就收尾 → 等待事件（最长 3 秒）再发 finish-task，避免丢音频
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingFinalize = null
        void this.doFinalize().then(resolve)
      }, 3000)
      this.pendingFinalize = () => {
        clearTimeout(timer)
        void this.doFinalize().then(resolve)
      }
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

  private doFinalize(): Promise<string> {
    return new Promise((resolve) => {
      try {
        this.ws?.send(buildFinishTaskMessage(this.taskId))
      } catch {
        // 连接未就绪/已断开：直接返回当前文本，避免悬挂
        resolve(this.resultText)
        return
      }
      this.finalizeResolver = resolve
      // 保险：超时未收到 task-finished 则直接返回当前文本
      this.finalizeTimer = setTimeout(() => this.settleFinalize(this.resultText), FINALIZE_TIMEOUT_MS)
    })
  }

  /** 结束 finalize 等待：清理定时器并 resolve（幂等） */
  private settleFinalize(text: string): void {
    if (this.finalizeTimer) {
      clearTimeout(this.finalizeTimer)
      this.finalizeTimer = null
    }
    if (this.finalizeResolver) {
      const resolve = this.finalizeResolver
      this.finalizeResolver = null
      resolve(text)
    }
  }

  private handleMessage(json: string): void {
    const event = parseServerEvent(json)
    switch (event.event) {
      case 'task-started':
        this.started = true
        for (const chunk of this.pendingChunks) {
          this.ws?.send(Buffer.from(chunk))
        }
        this.pendingChunks = []
        this.pendingFinalize?.()
        this.pendingFinalize = null
        break
      case 'result-generated':
        this.applySentence(event.sentence)
        break
      case 'task-failed':
        this.options.onError?.(event.errorMessage)
        this.settleFinalize(this.resultText)
        this.pendingFinalize?.()
        this.pendingFinalize = null
        break
      case 'task-finished':
        this.settleFinalize(this.resultText)
        break
      default:
        break
    }
  }

  /**
   * 按官方 sentence 语义合并识别结果：
   * - 每个事件的 text 是「当前分句」的句内累计文本（会增长，也可能被修正改写）
   * - sentence_begin=true：新句子开始，先把未收尾的旧句落盘（防御异常序列）
   * - sentence_end=true：该句最终结果，落盘
   * - heartbeat=true：心跳包，跳过
   * 全量 = 已结束分句拼接 + 当前分句文本；直接替换当前分句，天然兼容修正改写，不会重复。
   */
  private applySentence(sentence: QwenSentence): void {
    if (sentence.heartbeat) return
    if (sentence.sentenceBegin) {
      this.finalizedText += this.currentSentence
      this.currentSentence = ''
    }
    this.currentSentence = sentence.text
    if (sentence.sentenceEnd) {
      this.finalizedText += this.currentSentence
      this.currentSentence = ''
    }
    const merged = this.finalizedText + this.currentSentence
    const changed = merged !== this.resultText
    this.resultText = merged
    if (changed && merged) {
      this.options.onResult?.(merged)
    }
  }
}