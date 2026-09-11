import { loggerService } from '@logger'
import type { VoiceInputConfig, VoiceInputState } from '@shared/config/types'
import { getMissingVoiceInputCredential } from '@shared/config/voiceInput'
import { IpcChannel } from '@shared/IpcChannel'

import { configManager } from '../ConfigManager'
import { windowService } from '../WindowService'
import { type ASRAdapterCallbacks, createASRAdapter } from './asr'
import type { ASRAdapter } from './asr/types'
import { createFocusGuard, type FocusGuard } from './focusGuard'
import { StreamingTypewriter } from './streamingTypewriter'
import { backspaceAtCursor, typeTextAtCursor } from './textInserter'

const logger = loggerService.withContext('VoiceInput')

type CreateAdapterFn = (config: VoiceInputConfig, callbacks: ASRAdapterCallbacks) => ASRAdapter
type FocusGuardFactory = (onUserInput: () => void) => FocusGuard

/**
 * 语音输入主进程编排：
 * 键盘钩子 start → 按所选服务商建识别会话；渲染推音频 → 转发；
 * 云端每返回一次「累计全量」识别文本 → 增量打字器按差量上屏（说话过程中光标持续出字）；
 * 渲染 finalize → 收到最终文本后只做尾部校正（不重复整段输入）。
 * 焦点漂移守卫在检测到用户真实键鼠输入时冻结退格修正。
 * 生命周期状态经 broadcast 通知渲染层（可选依赖，便于测试）。
 */
export class VoiceInputService {
  private adapter: ASRAdapter | null = null
  private guard: FocusGuard | null = null
  private readonly typewriter = new StreamingTypewriter({
    type: typeTextAtCursor,
    backspace: backspaceAtCursor
  })

  constructor(
    private readonly createAdapter: CreateAdapterFn = createASRAdapter,
    private readonly broadcast: (state: VoiceInputState) => void = () => {},
    private readonly guardFactory: FocusGuardFactory = createFocusGuard
  ) {}

  /** 键盘钩子「按下」：读取配置、校验密钥并按服务商建立识别会话；holdKeys 为按住的快捷键键码 */
  start(holdKeys: number[] = []): void {
    const cfg = configManager.getVoiceInputConfig()

    const missing = getMissingVoiceInputCredential(cfg)
    if (missing) {
      logger.warn(`voice input: ${missing}，请在设置中填写`)
      this.broadcast('error')
      return
    }

    this.closeCurrent()
    this.typewriter.reset()

    const callbacks: ASRAdapterCallbacks = {
      // 中间结果与最终结果都从这里进来：差量上屏由打字器负责
      onResult: (text) => this.typewriter.commit(text),
      onError: (message) => {
        logger.error(`voice input 识别错误：${message}`)
        this.broadcast('error')
      }
    }
    const adapter = this.createAdapter(cfg, callbacks)
    this.adapter = adapter
    this.getOrCreateGuard().start(holdKeys)
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

  /** 渲染进程通知结束：等最终识别文本，把光标处内容校正到最终结果 */
  async finalize(): Promise<string> {
    const adapter = this.adapter
    this.adapter = null
    if (!adapter) {
      this.endSession()
      return ''
    }

    this.broadcast('inserting')
    try {
      const text = await adapter.stopAndFinalize()
      adapter.close()
      logger.info(`voice input 识别结果：${text}`)
      // 流式阶段已上屏的内容由差量逻辑复用，这里只补齐/修正尾部
      this.typewriter.finish(text)
      this.broadcast('done')
      return text
    } catch (error) {
      logger.error(`voice input 结束失败：${(error as Error).message}`)
      adapter.close()
      this.broadcast('error')
      return ''
    } finally {
      this.endSession()
    }
  }

  /**
   * 收尾清理：停掉焦点守卫并复位打字器。
   * 守卫必须活到最终校正之后——等最终结果最长 5 秒，期间用户若点了别处，
   * 这次校正就可能退格删错地方。
   */
  private endSession(): void {
    this.guard?.stop()
    this.typewriter.reset()
  }

  private getOrCreateGuard(): FocusGuard {
    this.guard ??= this.guardFactory(() => this.typewriter.freeze())
    return this.guard
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
