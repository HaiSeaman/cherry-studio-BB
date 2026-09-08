import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import Store from 'electron-store'
import { describe, expect, it, vi } from 'vitest'

import { ConfigKeys, ConfigManager } from '../ConfigManager'

describe('ConfigManager voice input config', () => {
  it('getVoiceInputConfig 未配置时返回默认配置', () => {
    const cm = new ConfigManager()
    expect(cm.getVoiceInputConfig()).toEqual(DEFAULT_VOICE_INPUT_CONFIG)
  })

  it('getVoiceInputConfig 返回 provider 默认 qwen 且模型名给官方默认值', () => {
    const cm = new ConfigManager()
    const cfg = cm.getVoiceInputConfig()
    expect(cfg.provider).toBe('qwen')
    expect(cfg.qwen.model).toBe('qwen-audio-3.0-asr-flash-streaming')
    expect(cfg.tencent.engineModel).toBe('16k_zh')
    expect(cfg.doubao).toEqual({ apiKey: '', resourceId: 'volc.seedasr.sauc.duration' })
  })

  it('setVoiceInputConfig 把配置写入 electron-store', () => {
    const cm = new ConfigManager()
    const cfg = { ...DEFAULT_VOICE_INPUT_CONFIG, provider: 'tencent' as const }
    cm.setVoiceInputConfig(cfg)

    const storeInstance = vi.mocked(Store).mock.results.at(-1)?.value as {
      set: ReturnType<typeof vi.fn>
    }
    expect(storeInstance.set).toHaveBeenCalledWith(ConfigKeys.VoiceInput, cfg)
  })

  it('getVoiceInputConfig 对残缺的持久化数据做字段级合并（防 start() 访问 undefined 崩溃）', () => {
    const cm = new ConfigManager()
    // 模拟旧版本只写入 provider 的情况
    const storeInstance = vi.mocked(Store).mock.results.at(-1)?.value as {
      get: ReturnType<typeof vi.fn>
    }
    storeInstance.get.mockImplementation((key: string, defaultValue?: unknown) =>
      key === ConfigKeys.VoiceInput ? { provider: 'doubao' } : defaultValue
    )

    const cfg = cm.getVoiceInputConfig()
    expect(cfg.provider).toBe('doubao')
    expect(cfg.qwen).toEqual(DEFAULT_VOICE_INPUT_CONFIG.qwen)
    expect(cfg.doubao).toEqual(DEFAULT_VOICE_INPUT_CONFIG.doubao)
    expect(cfg.tencent).toEqual(DEFAULT_VOICE_INPUT_CONFIG.tencent)

    // 已保存字段优先于默认值
    storeInstance.get.mockImplementation((key: string, defaultValue?: unknown) =>
      key === ConfigKeys.VoiceInput ? { provider: 'qwen', qwen: { apiKey: 'sk-x' } } : defaultValue
    )
    expect(cm.getVoiceInputConfig().qwen.apiKey).toBe('sk-x')
  })
})