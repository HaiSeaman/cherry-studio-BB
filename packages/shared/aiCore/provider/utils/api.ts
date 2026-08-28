import { formatApiHost, withoutTrailingSlash } from '@shared/utils'

/**
 * 格式化 Ollama 的 API 主机地址。
 */
export function formatOllamaApiHost(host: string): string {
  const normalizedHost = withoutTrailingSlash(host)
    ?.replace(/\/v1$/, '')
    ?.replace(/\/api$/, '')
    ?.replace(/\/chat$/, '')
  return formatApiHost(normalizedHost + '/api', false)
}
