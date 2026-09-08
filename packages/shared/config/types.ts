import type { ProcessingStatus } from '@types'

// =============================================================================
// Shared IPC Types
// =============================================================================

export type OperationResult = { success: true } | { success: false; message: string }

export type LoaderReturn = {
  entriesAdded: number
  uniqueId: string
  uniqueIds: string[]
  loaderType: string
  status?: ProcessingStatus
  message?: string
  messageSource?: 'preprocess' | 'embedding' | 'validation'
}

export type FileChangeEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'refresh'

export type FileChangeEvent = {
  eventType: FileChangeEventType
  filePath: string
  watchPath: string
}

export type MCPProgressEvent = {
  callId: string
  progress: number // 0-1 range
}

export type MCPServerLogEntry = {
  timestamp: number
  level: 'debug' | 'info' | 'warn' | 'error' | 'stderr' | 'stdout'
  message: string
  data?: any
  source?: string
}

// Channel log & status types
export type ChannelLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type ChannelLogEntry = {
  timestamp: number
  level: ChannelLogLevel
  message: string
  channelId: string
}

export type ChannelStatusEvent = {
  channelId: string
  connected: boolean
  error?: string
}

export type WebviewKeyEvent = {
  webviewId: number
  key: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

export interface WebSocketStatusResponse {
  isRunning: boolean
  port?: number
  ip?: string
  clientConnected: boolean
}

export interface WebSocketCandidatesResponse {
  host: string
  interface: string
  priority: number
}

export type VoiceInputProvider = 'qwen' | 'doubao' | 'tencent'

export interface VoiceInputQwenConfig {
  apiKey: string
  /** 千问识别模型名，默认 paraformer-realtime-v2 */
  model: string
}

export interface VoiceInputDoubaoConfig {
  /** 新版控制台 APP Key（X-Api-Key 请求头） */
  apiKey: string
  /** 大模型资源 ID（X-Api-Resource-Id），即豆包语音模型标识，默认 volc.seedasr.sauc.duration（模型 2.0） */
  resourceId: string
}

export interface VoiceInputTencentConfig {
  appid: string
  secretId: string
  secretKey: string
  /** 腾讯引擎型号 engine_model_type，默认 16k_zh */
  engineModel: string
}

export interface VoiceInputConfig {
  /** 当前选中的服务商 */
  provider: VoiceInputProvider
  qwen: VoiceInputQwenConfig
  doubao: VoiceInputDoubaoConfig
  tencent: VoiceInputTencentConfig
}

/** 语音输入主进程状态（经 IPC 广播给渲染层） */
export type VoiceInputState = 'listening' | 'inserting' | 'done' | 'error'
