import type { SerializedError } from '@renderer/types/error'

export interface ErrorClassification {
  category:
    | 'auth'
    | 'region'
    | 'model'
    | 'quota'
    | 'rate_limit'
    | 'context_length'
    | 'payload'
    | 'network'
    | 'proxy'
    | 'stream'
    | 'content'
    | 'server'
    | 'deprecated'
    | 'mcp'
    | 'parse'
    | 'unknown'
  message: string
  navTarget: string | null
}

export function isQuotaErrorMessage(message: string): boolean {
  const msg = message.toLowerCase()

  return (
    msg.includes('quota') ||
    msg.includes('insufficient_balance') ||
    msg.includes('insufficient balance') ||
    msg.includes('insufficient_credit') ||
    msg.includes('insufficient credit') ||
    msg.includes('billing') ||
    msg.includes('payment')
  )
}

export function isMcpErrorMessage(message: string): boolean {
  const msg = message.toLowerCase()

  return (
    msg.includes('mcp server') ||
    msg.includes('mcp connection') ||
    msg.includes('mcp error') ||
    msg.includes('mcp timeout') ||
    msg.includes('mcp transport') ||
    msg.includes('mcp client') ||
    msg.startsWith('mcp:') ||
    msg.startsWith('[mcp]') ||
    msg.includes('mcp_')
  )
}

export function classifyError(error?: SerializedError, providerId?: string): ErrorClassification {
  if (!error) {
    return { category: 'unknown', message: '发生了一个错误', navTarget: null }
  }

  const errorBag = error as Record<string, unknown>
  const finishReason = String(errorBag.finishReason ?? '').toLowerCase()

  // Structured finish metadata is more reliable than status-code and message heuristics.
  switch (finishReason) {
    case 'content-filter':
    case 'content_filter':
    case 'safety':
    case 'recitation':
      return { category: 'content', message: '消息内容被安全系统拦截，请修改后重试', navTarget: null }
    case 'length':
      return { category: 'context_length', message: '回复达到最大长度后被截断', navTarget: null }
    case 'error':
    case 'other':
      return { category: 'server', message: '回复异常结束，请重试或更换模型', navTarget: null }
  }

  const status = errorBag.statusCode ?? errorBag.status
  const numStatus = typeof status === 'number' ? status : typeof status === 'string' ? parseInt(status, 10) : undefined
  const providerSuffix = providerId ? `?id=${providerId}` : ''

  // SDK wrapper messages often hide the real error code; merge in responseBody and data
  // so structured signals like "insufficient_quota" inside responseBody can win over a generic
  // message like "Rate limit exceeded". Without this, the rule layer and the AI (which gets
  // these fields separately) would disagree on the category.
  const messageText = ((error.message as string) || '').toLowerCase()
  const responseBodyText = typeof errorBag.responseBody === 'string' ? errorBag.responseBody.toLowerCase() : ''
  let dataText = ''
  if (errorBag.data !== undefined && errorBag.data !== null) {
    try {
      dataText = (typeof errorBag.data === 'string' ? errorBag.data : JSON.stringify(errorBag.data)).toLowerCase()
    } catch {
      // ignore non-serializable data
    }
  }
  const msg = [messageText, responseBodyText, dataText].filter(Boolean).join('\n')

  // Geo / region block — must run BEFORE auth, since OpenAI returns 403 with
  // "unsupported_country_region_territory" and Anthropic blocks regions with 403.
  // Keywords are scoped to geographic phrases to avoid catching model-permission errors
  // like "model is not available in your account/plan".
  if (
    msg.includes('unsupported_country') ||
    msg.includes('country, region') ||
    msg.includes('country/region') ||
    msg.includes('region not supported') ||
    msg.includes('not available in your region') ||
    msg.includes('not available in your country') ||
    msg.includes('not available in your location') ||
    msg.includes('not available in your area') ||
    msg.includes('not available in your territory') ||
    (msg.includes('territory') && (numStatus === 403 || msg.includes('unsupported')))
  ) {
    return {
      category: 'region',
      message: '服务在你所在的地区不可用，请配置代理或更换为可用的服务商',
      navTarget: '/settings/general'
    }
  }

  // Auth errors (401/403)
  if (
    numStatus === 401 ||
    numStatus === 403 ||
    msg.includes('invalid_api_key') ||
    msg.includes('authentication') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden')
  ) {
    return {
      category: 'auth',
      message: 'API Key 无效，请检查并重新配置',
      navTarget: `/settings/provider${providerSuffix}`
    }
  }

  // Model not found (404)
  if (
    numStatus === 404 ||
    msg.includes('model_not_found') ||
    msg.includes('model not found') ||
    msg.includes('model does not exist')
  ) {
    return {
      category: 'model',
      message: '模型不存在或你没有访问权限',
      navTarget: `/settings/provider${providerSuffix}`
    }
  }

  // Quota / balance exhausted — check first so "429 + insufficient_balance" routes here, not to rate_limit.
  // HTTP 402 Payment Required is the canonical billing-failure status (used by several providers and gateways).
  if (numStatus === 402 || isQuotaErrorMessage(msg)) {
    return {
      category: 'quota',
      message: '账户额度已用完，请充值或更换服务商',
      navTarget: `/settings/provider${providerSuffix}`
    }
  }

  // Rate limit (429 / "too many requests")
  if (
    numStatus === 429 ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return {
      category: 'rate_limit',
      message: '请求过于频繁，请稍等片刻再试，或更换为更高速率的模型',
      navTarget: `/settings/provider${providerSuffix}`
    }
  }

  // Context length exceeded — Anthropic uses "prompt is too long", others vary
  if (
    msg.includes('context_length_exceeded') ||
    msg.includes('too many tokens') ||
    msg.includes('maximum context length') ||
    msg.includes('context window') ||
    msg.includes('prompt is too long') ||
    msg.includes('input is too long')
  ) {
    return { category: 'context_length', message: '对话上下文过长，请清理历史消息或开启新对话', navTarget: null }
  }

  // Payload too large (413)
  if (numStatus === 413 || msg.includes('payload too large') || msg.includes('request entity too large')) {
    return { category: 'payload', message: '请求内容过大，请减少发送的文件或文本量', navTarget: null }
  }

  // Content filter — provider-agnostic safety blocks (no status restriction)
  if (
    msg.includes('content_filter') ||
    msg.includes('content_policy') ||
    msg.includes('content_policy_violation') ||
    msg.includes('safety') ||
    msg.includes('prohibited_content') ||
    msg.includes('responsible_ai') ||
    msg.includes('output_blocked') ||
    msg.includes('finishreason: safety') ||
    msg.includes('"safety"') ||
    msg.includes('recitation') ||
    msg.includes('blocked by safety')
  ) {
    return { category: 'content', message: '消息内容被安全系统拦截，请修改后重试', navTarget: null }
  }

  // MCP errors — must run BEFORE network so "MCP timeout" / "MCP connection reset" route here
  if (isMcpErrorMessage(msg)) {
    return { category: 'mcp', message: 'MCP 服务器连接失败，请检查服务是否已启动', navTarget: '/settings/mcp/servers' }
  }

  // Stream interrupted — require specific transport-failure phrases, not bare "stream"
  if (
    msg.includes('econnreset') ||
    msg.includes('connection reset') ||
    msg.includes('stream interrupted') ||
    msg.includes('stream closed') ||
    msg.includes('stream aborted') ||
    msg.includes('stream ended unexpectedly') ||
    msg.includes('premature close')
  ) {
    return { category: 'stream', message: '响应传输中断，请检查网络稳定性或重试', navTarget: null }
  }

  // Network errors
  if (
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('enotfound')
  ) {
    return { category: 'network', message: '无法连接到服务器，请检查网络或代理设置', navTarget: '/settings/general' }
  }

  // Proxy / SSL certificate errors
  if (
    msg.includes('proxy') ||
    msg.includes('socks') ||
    msg.includes('certificate') ||
    msg.includes('self-signed') ||
    msg.includes('unable_to_verify_leaf_signature')
  ) {
    return { category: 'proxy', message: '代理或 SSL 证书错误，请检查代理和网络设置', navTarget: '/settings/general' }
  }

  // Server errors (5xx / overloaded)
  if (numStatus === 529 || (numStatus && numStatus >= 500) || msg.includes('overloaded') || msg.includes('overload')) {
    return { category: 'server', message: '服务器异常，建议稍后重试', navTarget: null }
  }

  // Model deprecated / retired — require co-occurrence with "model" to avoid matching
  // SDK warnings like "parameter X is deprecated"
  if (
    (msg.includes('deprecated') && msg.includes('model')) ||
    msg.includes('model has been retired') ||
    msg.includes('model is retired') ||
    msg.includes('model has been sunset') ||
    msg.includes('decommission')
  ) {
    return {
      category: 'deprecated',
      message: '该模型已下线或弃用，请更换其他模型',
      navTarget: `/settings/provider${providerSuffix}`
    }
  }

  // Response parse errors — require specific parse-failure phrases, not bare "json"
  if (
    msg.includes('unexpected token') ||
    msg.includes('invalid response') ||
    msg.includes('parse error') ||
    msg.includes('failed to parse') ||
    msg.includes('json parse') ||
    msg.includes('invalid json') ||
    msg.includes('malformed json')
  ) {
    return { category: 'parse', message: 'AI 返回的格式异常，请重试或更换模型', navTarget: null }
  }

  return { category: 'unknown', message: '发生了一个错误', navTarget: null }
}
