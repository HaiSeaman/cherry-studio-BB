import type { VoiceInputConfig } from './types'

/**
 * 校验当前服务商的密钥/必填字段是否齐全（主进程与渲染层共用，避免两处重复实现）。
 * 返回缺失提示文案，齐全返回 null。
 */
export function getMissingVoiceInputCredential(config: VoiceInputConfig): string | null {
  switch (config.provider) {
    case 'qwen':
      return config.qwen.apiKey ? null : '未配置千问 API Key'
    case 'doubao':
      if (!config.doubao.apiKey) return '未配置豆包 API Key'
      return null
    case 'tencent':
      if (!config.tencent.appid) return '未配置腾讯 AppID'
      if (!config.tencent.secretId) return '未配置腾讯 SecretId'
      if (!config.tencent.secretKey) return '未配置腾讯 SecretKey'
      return null
  }
}