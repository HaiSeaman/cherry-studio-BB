import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig } from '@shared/config/types'
import { getMissingVoiceInputCredential } from '@shared/config/voiceInput'
import { describe, expect, it } from 'vitest'

const base = structuredClone(DEFAULT_VOICE_INPUT_CONFIG)

const withSecrets = (patch: Partial<VoiceInputConfig>): VoiceInputConfig => ({ ...base, ...patch })

describe('getMissingVoiceInputCredential（共享密钥校验）', () => {
  it('千问：缺 API Key 提示，补齐后通过', () => {
    expect(getMissingVoiceInputCredential(base)).toContain('API Key')
    expect(getMissingVoiceInputCredential(withSecrets({ qwen: { apiKey: 'k', model: 'm' } }))).toBeNull()
  })

  it('豆包：缺 API Key 提示，补齐后通过（资源 ID 有推荐默认值不强制）', () => {
    const doubao = { apiKey: '', resourceId: 'volc.seedasr.sauc.duration' }
    expect(getMissingVoiceInputCredential(withSecrets({ provider: 'doubao', doubao }))).toContain('API Key')
    expect(
      getMissingVoiceInputCredential(withSecrets({ provider: 'doubao', doubao: { ...doubao, apiKey: 'k' } }))
    ).toBeNull()
  })

  it('腾讯：SecretId/SecretKey/AppID 任一缺失都有提示', () => {
    const tencent = { appid: '', secretId: '', secretKey: '', engineModel: '16k_zh' }
    expect(getMissingVoiceInputCredential(withSecrets({ provider: 'tencent', tencent }))).toContain('AppID')
    expect(
      getMissingVoiceInputCredential(withSecrets({ provider: 'tencent', tencent: { ...tencent, appid: 'a' } }))
    ).toContain('SecretId')
    expect(
      getMissingVoiceInputCredential(
        withSecrets({ provider: 'tencent', tencent: { ...tencent, appid: 'a', secretId: 's' } })
      )
    ).toContain('SecretKey')
  })
})