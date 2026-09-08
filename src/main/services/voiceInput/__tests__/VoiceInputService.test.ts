import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig } from '@shared/config/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insertMock, mainSendMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  mainSendMock: vi.fn()
}))
vi.mock('../textInserter', () => ({ insertTextAtCursor: insertMock }))
// WindowService 依赖 Electron 环境，测试中替换为可控 stub（getMainWindow 返回带 send spy 的窗口）
vi.mock('../../WindowService', () => ({
  windowService: { getMainWindow: () => ({ webContents: { send: mainSendMock } }) }
}))

import { configManager } from '../../ConfigManager'
import type { ASRAdapter } from '../asr/types'
import { VoiceInputService, voiceInputService } from '../VoiceInputService'

const makeMockAdapter = (overrides: Partial<Record<keyof ASRAdapter, ReturnType<typeof vi.fn>>> = {}) => ({
  connect: vi.fn().mockResolvedValue(undefined),
  startSession: vi.fn(),
  sendAudio: vi.fn(),
  stopAndFinalize: vi.fn().mockResolvedValue('识别文本'),
  close: vi.fn(),
  ...overrides
})

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
  let adapter: ReturnType<typeof makeMockAdapter>
  let createAdapter: ReturnType<typeof vi.fn>
  let broadcast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    insertMock.mockClear()
    adapter = makeMockAdapter()
    createAdapter = vi.fn(() => adapter)
    broadcast = vi.fn()
    vi.spyOn(configManager, 'getVoiceInputConfig').mockReturnValue(structuredClone(qwenConfig))
  })

  const buildService = () => new VoiceInputService(createAdapter, broadcast)

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

  it('finalize：返回文本、关闭连接、广播 inserting→done，并调用全局打字（阶段 C）', async () => {
    const service = buildService()
    service.start()
    const text = await service.finalize()
    expect(text).toBe('识别文本')
    expect(adapter.stopAndFinalize).toHaveBeenCalled()
    expect(adapter.close).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith('识别文本')
    expect(broadcast).toHaveBeenCalledWith('inserting')
    expect(broadcast).toHaveBeenCalledWith('done')
  })

  it('finalize：当前无会话时返回空字符串且不打字，不报错', async () => {
    const service = buildService()
    await expect(service.finalize()).resolves.toBe('')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('finalize：识别结果为空文本时不打字', async () => {
    adapter.stopAndFinalize.mockResolvedValue('')
    const service = buildService()
    service.start()
    const text = await service.finalize()
    expect(text).toBe('')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('finalize：识别异常时广播 error 并返回空串', async () => {
    adapter.stopAndFinalize.mockRejectedValue(new Error('网络断开'))
    const service = buildService()
    service.start()
    const text = await service.finalize()
    expect(text).toBe('')
    expect(broadcast).toHaveBeenCalledWith('error')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('start 重入：先关闭旧会话再开新会话', () => {
    const service = buildService()
    service.start()
    service.start()
    expect(adapter.close).toHaveBeenCalled()
    expect(createAdapter).toHaveBeenCalledTimes(2)
  })

  it('默认单例：状态广播已接到主窗口（渲染错误提示链路可用）', () => {
    vi.spyOn(configManager, 'getVoiceInputConfig').mockReturnValue(structuredClone(qwenConfig))
    voiceInputService.start()
    expect(mainSendMock).toHaveBeenCalledWith('voice-input:state', 'listening')
  })
})