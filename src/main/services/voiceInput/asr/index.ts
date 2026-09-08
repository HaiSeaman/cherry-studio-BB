import type { VoiceInputConfig } from '@shared/config/types'

import { DoubaoASRAdapter } from './doubao'
import { QwenASRAdapter } from './qwen'
import { TencentASRAdapter } from './tencent'
import type { ASRAdapter } from './types'

export interface ASRAdapterCallbacks {
  onResult?: (text: string) => void
  onError?: (message: string) => void
}

/** 按配置创建对应服务商的适配器（写死的官方 API 地址在各适配器内部） */
export function createASRAdapter(config: VoiceInputConfig, callbacks: ASRAdapterCallbacks): ASRAdapter {
  switch (config.provider) {
    case 'qwen':
      return new QwenASRAdapter({
        apiKey: config.qwen.apiKey,
        model: config.qwen.model,
        sampleRate: 16000,
        format: 'pcm',
        ...callbacks
      })
    case 'doubao':
      return new DoubaoASRAdapter({
        apiKey: config.doubao.apiKey,
        resourceId: config.doubao.resourceId,
        ...callbacks
      })
    case 'tencent':
      return new TencentASRAdapter({
        appid: config.tencent.appid,
        secretId: config.tencent.secretId,
        secretKey: config.tencent.secretKey,
        engineModel: config.tencent.engineModel,
        ...callbacks
      })
  }
}
