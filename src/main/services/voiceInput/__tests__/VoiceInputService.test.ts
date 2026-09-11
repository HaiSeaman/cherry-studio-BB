import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig } from '@shared/config/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { typeMock, backspaceMock, mainSendMock } = vi.hoisted(() => ({
  typeMock: vi.fn(),
  backspaceMock: vi.fn(),
  mainSendMock: vi.fn()
}))
vi.mock('../textInserter', () => ({
  typeTextAtCursor: typeMock,
  backspaceAtCursor: backspaceMock,
  getLastInjectionAt: () => 0
}))
// WindowService 依赖 Electron 环境，测试中替换为可控 stub（getMainWindow 返回带 send spy 的窗口）
vi.mock('../../WindowService', () => ({
  windowService: { getMainWindow: () => ({ webContents: { send: mainSendMock } }) }
}))

import { configManager } from '../../ConfigManager'
import type { ASRAdapter } from '../asr/types'
import type { FocusGuard } from '../focusGuard'
import { VoiceInputService, voiceInputService } from '../VoiceInputService'

const makeMockAdapter = (overrides: Partial<Record<keyof ASRAdapter, ReturnType<typeof vi.fn>>> = {}) => ({
  connect: vi.fn().mockResolvedValue(undefined),
  startSession: vi.fn(),
  sendAudio: vi.fn(),
  stopAndFinalize: vi.fn().mockResolvedValue('识别文本'),
  close: vi.fn(),
  ...overrides
})

type MockAdapter = ReturnType<typeof makeMockAdapter>

// 千问 + 已填 API Key
const qwenConfig: VoiceInputConfig = {
  ...structuredClone(DEFAULT_VOICE_INPUT_CONFIG),
  qwen: { apiKey: 'sk-test', model: 'qwen-audio-3.0-asr-flash-streaming' }
}

// 豆包 + 已填 API Key（大模型流式接口）
const doubaoConfig: VoiceInputConfig = {
  ...structuredClone(DEFAULT_VOICE_INPUT_CONFIG),
  provider: 'doubao',
  doubao: { apiKey: 'db-key', resourceId: 'volc.seedasr.sauc.duration' }
}

describe('VoiceInputService', () => {
  let adapter: MockAdapter
  let createAdapter: ReturnType<typeof vi.fn>
  let broadcast: ReturnType<typeof vi.fn>
  let guard: FocusGuard & { onUserInput: (() => void) | null }

  beforeEach(() => {
    typeMock.mockClear()
    backspaceMock.mockClear()
    adapter = makeMockAdapter()
    createAdapter = vi.fn(() => adapter)
    broadcast = vi.fn()
    guard = { start: vi.fn(), stop: vi.fn(), onUserInput: null }
    vi.spyOn(configManager, 'getVoiceInputConfig').mockReturnValue(structuredClone(qwenConfig))
  })

  const buildService = () =>
    new VoiceInputService(createAdapter, broadcast, (onUserInput) => {
      guard.onUserInput = onUserInput
      return guard
    })

  /** 取出创建适配器时传入的回调，用于模拟云端返回识别结果 */
  const asrCallbacks = () => createAdapter.mock.calls[0][1] as { onResult?: (text: string) => void }

  it('start：读配置 → 按服务商创建适配器（收到配置与回调）→ connect → startSession，并广播 listening', async () => {
    const service = buildService()
    service.start()

    expect(createAdapter).toHaveBeenCalledTimes(1)
    const [cfg, callbacks] = createAdapter.mock.calls[0] as [VoiceInputConfig, object]
    expect(cfg).toEqual(qwenConfig)
    expect(callbacks).toMatchObject({ onResult: expect.any(Function), onError: expect.any(Function) })
    expect(broadcast).toHaveBeenCalledWith('listening')
    await Promise.resolve()
    expect(adapter.startSession).toHaveBeenCalled()
  })

  it('start：当前服务商密钥缺失时不创建适配器，并广播 error', () => {
    vi.spyOn(configManager, 'getVoiceInputConfig').mockReturnValue(structuredClone(DEFAULT_VOICE_INPUT_CONFIG))
    const service = buildService()
    service.start()
    expect(createAdapter).not.toHaveBeenCalled()
    expect(broadcast).toHaveBeenCalledWith('error')
  })

  it('start：豆包配置（密钥齐全）同样创建适配器', async () => {
    vi.spyOn(configManager, 'getVoiceInputConfig').mockReturnValue(structuredClone(doubaoConfig))
    const service = buildService()
    service.start()
    const [cfg] = createAdapter.mock.calls[0] as [VoiceInputConfig]
    expect(cfg.provider).toBe('doubao')
    await Promise.resolve()
    expect(adapter.startSession).toHaveBeenCalled()
  })

  it('start：豆包配置缺 API Key 时不创建适配器', () => {
    const cfg = structuredClone(doubaoConfig)
    cfg.doubao.apiKey = ''
    vi.spyOn(configManager, 'getVoiceInputConfig').mockReturnValue(cfg)
    const service = buildService()
    service.start()
    expect(createAdapter).not.toHaveBeenCalled()
  })

  it('start：连接失败时广播 error', async () => {
    adapter.connect.mockRejectedValue(new Error('连接超时'))
    const service = buildService()
    service.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(broadcast).toHaveBeenCalledWith('error')
  })

  it('handleAudio：把音频块推给适配器', () => {
    const service = buildService()
    service.start()
    const chunk = new Uint8Array([1, 2, 3])
    service.handleAudio(chunk)
    expect(adapter.sendAudio).toHaveBeenCalledWith(chunk)
  })

  it('start：把按住的快捷键键码交给焦点守卫（用于忽略长按自动重复）', () => {
    const service = buildService()
    service.start([3675, 42, 41])
    expect(guard.start).toHaveBeenCalledWith([3675, 42, 41])
  })

  it('流式：中间结果到达即上屏（说话过程中光标持续出字）', () => {
    const service = buildService()
    service.start()
    const { onResult } = asrCallbacks()

    onResult?.('你')
    onResult?.('你好')
    onResult?.('你好世界')
    expect(typeMock.mock.calls.map((c) => c[0])).toEqual(['你', '好', '世界'])
  })

  it('流式：服务端修正前文时退格删掉分叉尾巴再补新文本', () => {
    const service = buildService()
    service.start()
    const { onResult } = asrCallbacks()

    onResult?.('你说今天在主')
    backspaceMock.mockClear()
    onResult?.('你说今天在做些什么东西')
    expect(backspaceMock).toHaveBeenCalledWith(1)
    expect(typeMock).toHaveBeenLastCalledWith('做些什么东西')
  })

  it('流式：重复的中间结果不产生任何输入动作', () => {
    const service = buildService()
    service.start()
    const { onResult } = asrCallbacks()

    onResult?.('你好')
    typeMock.mockClear()
    onResult?.('你好')
    expect(typeMock).not.toHaveBeenCalled()
    expect(backspaceMock).not.toHaveBeenCalled()
  })

  it('焦点冻结：用户真实键鼠输入后只追加不退格，避免删错地方', () => {
    const service = buildService()
    service.start()
    const { onResult } = asrCallbacks()

    onResult?.('你说今天在主')
    guard.onUserInput?.()
    backspaceMock.mockClear()
    typeMock.mockClear()
    onResult?.('你说今天在做些什么东西')
    expect(backspaceMock).not.toHaveBeenCalled()
    expect(typeMock).not.toHaveBeenCalled()
  })

  it('finalize：返回文本、关闭连接、广播 inserting→done，并停止焦点守卫', async () => {
    const service = buildService()
    service.start()
    const text = await service.finalize()
    expect(text).toBe('识别文本')
    expect(adapter.stopAndFinalize).toHaveBeenCalled()
    expect(adapter.close).toHaveBeenCalled()
    expect(typeMock).toHaveBeenCalledWith('识别文本')
    expect(guard.stop).toHaveBeenCalled()
    expect(broadcast).toHaveBeenCalledWith('inserting')
    expect(broadcast).toHaveBeenCalledWith('done')
  })

  it('finalize：流式已上屏的内容不重复输入，只补最终结果的差量', async () => {
    const service = buildService()
    service.start()
    asrCallbacks().onResult?.('今天天气不错')
    adapter.stopAndFinalize.mockResolvedValue('今天天气不错。')

    typeMock.mockClear()
    await service.finalize()
    expect(typeMock).toHaveBeenCalledTimes(1)
    expect(typeMock).toHaveBeenCalledWith('。')
  })

  it('finalize：流式已上屏后被修正时，以最终文本为准做尾部校正', async () => {
    const service = buildService()
    service.start()
    asrCallbacks().onResult?.('今天天气在主')
    adapter.stopAndFinalize.mockResolvedValue('今天天气在做些什么')

    await service.finalize()
    expect(backspaceMock).toHaveBeenCalledWith(1)
    expect(typeMock).toHaveBeenLastCalledWith('做些什么')
  })

  it('finalize：当前无会话时返回空字符串且不打字，不报错', async () => {
    const service = buildService()
    await expect(service.finalize()).resolves.toBe('')
    expect(typeMock).not.toHaveBeenCalled()
  })

  it('finalize：识别结果为空文本时不打字，也不擦除已上屏内容', async () => {
    adapter.stopAndFinalize.mockResolvedValue('')
    const service = buildService()
    service.start()
    asrCallbacks().onResult?.('听到半句')
    typeMock.mockClear()

    const text = await service.finalize()
    expect(text).toBe('')
    expect(typeMock).not.toHaveBeenCalled()
    expect(backspaceMock).not.toHaveBeenCalled()
  })

  it('finalize：识别异常时广播 error 并返回空串，已上屏内容保持不动', async () => {
    adapter.stopAndFinalize.mockRejectedValue(new Error('网络断开'))
    const service = buildService()
    service.start()
    asrCallbacks().onResult?.('说了一半')
    typeMock.mockClear()

    const text = await service.finalize()
    expect(text).toBe('')
    expect(broadcast).toHaveBeenCalledWith('error')
    expect(typeMock).not.toHaveBeenCalled()
    expect(backspaceMock).not.toHaveBeenCalled()
  })

  it('start 重入：先关闭旧会话再开新会话，且新一轮从零累计', () => {
    const service = buildService()
    service.start()
    asrCallbacks().onResult?.('上一轮')
    service.start()
    expect(adapter.close).toHaveBeenCalled()
    expect(createAdapter).toHaveBeenCalledTimes(2)
    expect(typeMock).toHaveBeenLastCalledWith('上一轮')

    typeMock.mockClear()
    asrCallbacks().onResult?.('新的')
    expect(typeMock).toHaveBeenCalledWith('新的')
  })

  it('默认单例：状态广播已接到主窗口（渲染错误提示链路可用）', () => {
    vi.spyOn(configManager, 'getVoiceInputConfig').mockReturnValue(structuredClone(qwenConfig))
    voiceInputService.start()
    expect(mainSendMock).toHaveBeenCalledWith('voice-input:state', 'listening')
  })
})
