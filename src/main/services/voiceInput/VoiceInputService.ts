import { loggerService } from '@logger'
import type { VoiceInputConfig, VoiceInputState } from '@shared/config/types'
import { getMissingVoiceInputCredential } from '@shared/config/voiceInput'
import { IpcChannel } from '@shared/IpcChannel'

import { configManager } from '../ConfigManager'
import { windowService } from '../WindowService'
import { type ASRAdapterCallbacks, createASRAdapter } from './asr'
import type { ASRAdapter } from './asr/types'
import { insertTextAtCursor } from './textInserter'

const logger = loggerService.withContext('VoiceInput')

type CreateAdapterFn = (config: VoiceInputConfig, callbacks: ASRAdapterCallbacks) => ASRAdapter

/**
 * 语音输入主进程编排：
 * 键盘钩子 start → 按所选服务商建识别会话；渲染推音频 → 转发；
 * 渲染 finalize → 收最终文本 → 全局打字（剪贴板 + 模拟 Ctrl+V）。
 * 生命周期状态经 broadcast 通知渲染层（可选依赖，便于测试）。
 */
export class VoiceInputService {
  private adapter: ASRAdapter | null = null

  constructor(
    private readonly createAdapter: CreateAdapterFn = createASRAdapter,
    private readonly broadcast: (state: VoiceInputState) => void = () => {}
  ) {}

  /** 键盘钩子「按下」：读取配置、校验密钥并按服务商建立识别会话 */
  start(): void {
    const cfg = configManager.getVoiceInputConfig()

    const missing = getMissingVoiceInputCredential(cfg)
    if (missing) {
      logger.warn(`voice input: ${missing}，请在设置中填写`)
      this.broadcast('error')
      return
    }

    this.closeCurrent()

    const callbacks: ASRAdapterCallbacks = {
      onResult: (text) => logger.debug(`voice input 识别中：${text}`),
      onError: (message) => {
        logger.error(`voice input 识别错误：${message}`)
        this.broadcast('error')
      }
    }
    const adapter = this.createAdapter(cfg, callbacks)
    this.adapter = adapter
    this.broadcast('listening')

    void adapter
      .connect()
      .then(() => adapter.startSession())
      .catch((error: Error) => {
        logger.error(`voice input 连接失败：${error.message}`)
        adapter.close()
        // 仅当仍是当前会话时才清理与报错（防止误杀用户快速重按后建立的新会话）
        if (this.adapter === adapter) {
          this.adapter = null
          this.broadcast('error')
        }
      })
  }

  /** 渲染进程推送的音频块转发给识别会话 */
  handleAudio(chunk: Uint8Array): void {
    this.adapter?.sendAudio(chunk)
  }

  /** 渲染进程通知结束：返回最终识别文本，并全局打字到光标处 */
  async finalize(): Promise<string> {
    const adapter = this.adapter
    this.adapter = null
    if (!adapter) return ''

    this.broadcast('inserting')
    try {
      const text = await adapter.stopAndFinalize()
      adapter.close()
      logger.info(`voice input 识别结果：${text}`)
      if (text.trim()) {
        insertTextAtCursor(text)
      }
      this.broadcast('done')
      return text
    } catch (error) {
      logger.error(`voice input 结束失败：${(error as Error).message}`)
      adapter.close()
      this.broadcast('error')
      return ''
    }
  }

  private closeCurrent(): void {
    if (this.adapter) {
      this.adapter.close()
      this.adapter = null
    }
  }
}

export const voiceInputService = new VoiceInputService(createASRAdapter, broadcastState)

/** 把语音输入状态广播给主窗口渲染层（用于错误等提示） */
function broadcastState(state: VoiceInputState): void {
  windowService.getMainWindow()?.webContents.send(IpcChannel.VoiceInput_State, state)
}