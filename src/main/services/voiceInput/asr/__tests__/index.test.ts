import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig } from '@shared/config/types'
import { describe, expect, it } from 'vitest'

import { DoubaoASRAdapter } from '../doubao'
import { createASRAdapter } from '../index'
import { QwenASRAdapter } from '../qwen'
import { TencentASRAdapter } from '../tencent'

const base = structuredClone(DEFAULT_VOICE_INPUT_CONFIG)

const withSecrets = (patch: Partial<VoiceInputConfig>): VoiceInputConfig => ({ ...base, ...patch })

describe('createASRAdapter 工厂', () => {
  it('千问配置 → QwenASRAdapter', () => {
    const adapter = createASRAdapter(withSecrets({ qwen: { apiKey: 'k', model: 'm' } }), {})
    expect(adapter).toBeInstanceOf(QwenASRAdapter)
  })

  it('豆包配置 → DoubaoASRAdapter', () => {
    const adapter = createASRAdapter(
      withSecrets({ provider: 'doubao', doubao: { apiKey: 'a', resourceId: 'volc.seedasr.sauc.duration' } }),
      {}
    )
    expect(adapter).toBeInstanceOf(DoubaoASRAdapter)
  })

  it('腾讯配置 → TencentASRAdapter', () => {
    const adapter = createASRAdapter(
      withSecrets({
        provider: 'tencent',
        tencent: { appid: 'a', secretId: 'si', secretKey: 'sk', engineModel: '16k_zh' }
      }),
      {}
    )
    expect(adapter).toBeInstanceOf(TencentASRAdapter)
  })
})