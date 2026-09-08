import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig } from '@shared/config/types'
import { getMissingVoiceInputCredential } from '@shared/config/voiceInput'
import { describe, expect, it } from 'vitest'

import { getVoiceInputFieldDefs, setFieldValue, VOICE_INPUT_PROVIDER_OPTIONS } from '../voiceInputFields'

describe('voiceInputFields', () => {
  it('服务商选项包含千问/豆包/腾讯三家', () => {
    expect(VOICE_INPUT_PROVIDER_OPTIONS.map((o) => o.value)).toEqual(['qwen', 'doubao', 'tencent'])
  })

  it('千问：2 个字段（API Key 密码框 + 模型名称带默认值）', () => {
    const fields = getVoiceInputFieldDefs('qwen')
    expect(fields).toHaveLength(2)
    expect(fields[0]).toMatchObject({ key: 'qwen.apiKey', secret: true })
    expect(fields[1]).toMatchObject({ key: 'qwen.model', defaultValue: 'qwen-audio-3.0-asr-flash-streaming' })
  })

  it('豆包：2 个字段（API Key 密码框 + 资源 ID 带默认值）', () => {
    const fields = getVoiceInputFieldDefs('doubao')
    expect(fields.map((f) => f.key)).toEqual(['doubao.apiKey', 'doubao.resourceId'])
    expect(fields[0].secret).toBe(true)
    expect(fields[1]).toMatchObject({ key: 'doubao.resourceId', defaultValue: 'volc.seedasr.sauc.duration' })
  })

  it('腾讯：4 个字段（AppID / SecretId / SecretKey / 引擎型号带默认值）', () => {
    const fields = getVoiceInputFieldDefs('tencent')
    expect(fields.map((f) => f.key)).toEqual([
      'tencent.appid',
      'tencent.secretId',
      'tencent.secretKey',
      'tencent.engineModel'
    ])
    expect(fields[3]).toMatchObject({ key: 'tencent.engineModel', defaultValue: '16k_zh' })
  })

  it('密钥缺失时校验报错，提示对应字段名；填齐后通过', () => {
    const config: VoiceInputConfig = { ...structuredClone(DEFAULT_VOICE_INPUT_CONFIG) }
    expect(getMissingVoiceInputCredential(config)).toContain('API Key')

    config.qwen.apiKey = 'sk-xxx'
    expect(getMissingVoiceInputCredential(config)).toBeNull()
  })

  it('校验只检查当前选中的服务商', () => {
    const config: VoiceInputConfig = { ...structuredClone(DEFAULT_VOICE_INPUT_CONFIG), provider: 'tencent' }
    config.tencent.appid = '125xxx'
    // 千问没填没关系，腾讯漏了 SecretId 才报错
    expect(getMissingVoiceInputCredential(config)).toContain('SecretId')
    config.tencent.secretId = 'sid'
    config.tencent.secretKey = 'sk'
    config.tencent.appid = '125xxx'
    expect(getMissingVoiceInputCredential(config)).toBeNull()
  })

  it('setFieldValue 按点路径写入配置字段', () => {
    const config: VoiceInputConfig = { ...structuredClone(DEFAULT_VOICE_INPUT_CONFIG) }
    setFieldValue(config, 'qwen.apiKey', 'sk-abc')
    setFieldValue(config, 'tencent.engineModel', '16k_zh_en_2.0')
    expect(config.qwen.apiKey).toBe('sk-abc')
    expect(config.tencent.engineModel).toBe('16k_zh_en_2.0')
  })
})