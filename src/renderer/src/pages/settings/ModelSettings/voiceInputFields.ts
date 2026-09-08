import type { VoiceInputConfig, VoiceInputProvider } from '@shared/config/types'

export interface VoiceInputFieldDef {
  /** 配置字段点路径，如 qwen.apiKey */
  key: string
  label: string
  /** 密码框（密钥类字段） */
  secret?: boolean
  /** 为空时占位/默认值 */
  defaultValue?: string
}

/** 设置页下拉框的服务商选项 */
export const VOICE_INPUT_PROVIDER_OPTIONS: { value: VoiceInputProvider; label: string }[] = [
  { value: 'qwen', label: '千问' },
  { value: 'doubao', label: '豆包' },
  { value: 'tencent', label: '腾讯' }
]

/** 各服务商的设置字段（含秘密字段），弹窗据此渲染表单 */
export function getVoiceInputFieldDefs(provider: VoiceInputProvider): VoiceInputFieldDef[] {
  switch (provider) {
    case 'qwen':
      return [
        { key: 'qwen.apiKey', label: 'API Key', secret: true },
        { key: 'qwen.model', label: '模型名称', defaultValue: 'qwen-audio-3.0-asr-flash-streaming' }
      ]
    case 'doubao':
      return [
        { key: 'doubao.apiKey', label: 'API Key（新版控制台 APP Key）', secret: true },
        { key: 'doubao.resourceId', label: '资源 ID（模型名称）', defaultValue: 'volc.seedasr.sauc.duration' }
      ]
    case 'tencent':
      return [
        { key: 'tencent.appid', label: 'AppID', secret: true },
        { key: 'tencent.secretId', label: 'SecretId', secret: true },
        { key: 'tencent.secretKey', label: 'SecretKey', secret: true },
        { key: 'tencent.engineModel', label: '引擎型号（模型名称）', defaultValue: '16k_zh' }
      ]
  }
}

/** 按点路径读取配置字段（如 qwen.apiKey） */
export function getFieldValue(config: VoiceInputConfig, key: string): string {
  const parts = key.split('.')
  let value: unknown = config
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part]
    } else {
      return ''
    }
  }
  return typeof value === 'string' ? value : ''
}

/** 按点路径写入配置字段（如 qwen.apiKey） */
export function setFieldValue(config: VoiceInputConfig, key: string, value: string): void {
  const parts = key.split('.')
  const target = parts.slice(0, -1).reduce<Record<string, unknown>>((obj, part) => obj[part] as never, config as never)
  target[parts.at(-1) as string] = value
}
