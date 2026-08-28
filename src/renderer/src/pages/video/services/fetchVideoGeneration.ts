/**
 * 视频生成统一入口：按模型所属服务商分发到对应适配器
 *
 * 路由规则（内置 id 优先，自定义服务商按 API 域名识别，与 dashscopeImage 的 host 识别法一致）：
 * - dashscope / *.dashscope*.aliyuncs.com → 百炼
 * - doubao / *volces.com → 火山 Ark
 * - hunyuan / tencentcloudapi.com → 腾讯混元
 * 未匹配一律拦截报错，绝不把请求发给不支持的服务商。
 */

import { generateArkVideo } from '@renderer/aiCore/utils/arkVideo'
import { generateDashScopeVideo } from '@renderer/aiCore/utils/dashscopeVideo'
import { generateHunyuanVideo } from '@renderer/aiCore/utils/tencentHunyuanVideo'
import type { VideoGenParams, VideoStatusCallback } from '@renderer/aiCore/utils/videoGenerationTypes'
import type { Provider } from '@renderer/types'

export type FetchVideoParams = VideoGenParams & { onStatus?: VideoStatusCallback }

function extractHostname(url: string): string {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return (url || '').toLowerCase()
  }
}

/** 识别服务商对应的视频适配器；未适配返回 null */
export function resolveVideoAdapter(
  provider: Provider
): { name: string; run: (params: VideoGenParams, onStatus?: VideoStatusCallback) => Promise<string> } | null {
  const id = provider?.id || ''
  const host = extractHostname(provider?.apiHost || '')

  if (id === 'dashscope' || host.includes('aliyuncs.com')) {
    return { name: 'DashScopeVideo', run: generateDashScopeVideo }
  }
  if (id === 'doubao' || host.endsWith('.volces.com')) {
    return { name: 'ArkVideo', run: generateArkVideo }
  }
  if (id === 'hunyuan' || host.endsWith('tencentcloudapi.com')) {
    return { name: 'HunyuanVideo', run: generateHunyuanVideo }
  }
  return null
}

/**
 * 统一视频生成入口：提交任务并轮询至完成，返回 videoUrl（短期有效，调用方负责持久化）
 */
export async function fetchVideoGeneration(params: FetchVideoParams): Promise<string> {
  const { onStatus, ...rest } = params
  const adapter = resolveVideoAdapter(rest.provider)
  if (!adapter) {
    throw new Error(
      `该服务商暂不支持视频生成（${params.provider?.name || params.provider?.id}），请在动感视频助手中选择百炼/火山豆包/腾讯混元的视频模型`
    )
  }
  return adapter.run(rest as VideoGenParams, onStatus)
}
