/**
 * 腾讯云 TC3-HMAC-SHA256 签名（TC3 签名 v3）
 *
 * 腾讯混元视频生成走腾讯云 API（hunyuan.tencentcloudapi.com），鉴权不是简单 API Key，
 * 而是 SecretId + SecretKey 双密钥的 TC3 请求签名。签名流程：
 *   CanonicalRequest = POST\n/\n\n<canonical headers>\n<signed headers>\n<sha256(payload)>
 *   StringToSign     = TC3-HMAC-SHA256\n<timestamp>\n<date>/<service>/tc3_request\n<sha256(CanonicalRequest)>
 *   派生密钥         = HMAC(HMAC(HMAC('TC3'+SecretKey, date), service), 'tc3_request')
 *   Signature        = hex(HMAC(派生密钥, StringToSign))
 *
 * 使用 WebCrypto 实现（Electron 渲染进程可用）；固定向量测试锁定行为。
 */

export type Tc3SignInput = {
  secretId: string
  secretKey: string
  /** 服务名，如 'hunyuan' */
  service: string
  /** 接口域名，如 'hunyuan.tencentcloudapi.com' */
  host: string
  /** 接口 Action，如 'SubmitHunyuanVideoJob' */
  action: string
  /** 接口版本，如 '2023-09-01' */
  version: string
  /** 请求体 JSON 字符串 */
  payload: string
  /** Unix 时间戳（秒） */
  timestamp: number
}

/** 解析 apiKey 字段中约定的 SecretId:SecretKey（半角冒号分隔） */
export function parseTencentCredentials(apiKey: string): { secretId: string; secretKey: string } {
  const trimmed = (apiKey || '').trim()
  const sepIndex = trimmed.indexOf(':')
  if (!trimmed || sepIndex <= 0 || sepIndex === trimmed.length - 1) {
    throw new Error('腾讯混元 apiKey 请按「SecretId:SecretKey」格式填写（半角冒号分隔），可在腾讯云控制台 API 密钥管理中获取')
  }
  return {
    secretId: trimmed.slice(0, sepIndex).trim(),
    secretKey: trimmed.slice(sepIndex + 1).trim()
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toHex(new Uint8Array(digest))
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return new Uint8Array(signature)
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 计算 TC3 签名并返回完整请求头（含 Authorization / X-TC-*）。
 * CanonicalHeaders 固定为 content-type + host（与腾讯云官方示例一致）。
 */
export async function signTc3(input: Tc3SignInput): Promise<Record<string, string>> {
  const { secretId, secretKey, service, host, action, version, payload, timestamp } = input

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const hashedPayload = await sha256Hex(payload)
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n')

  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    `${date}/${service}/tc3_request`,
    hashedCanonicalRequest
  ].join('\n')

  const encoder = new TextEncoder()
  const kDate = await hmacSha256(encoder.encode(`TC3${secretKey}`), date)
  const kService = await hmacSha256(kDate, service)
  const kSigning = await hmacSha256(kService, 'tc3_request')
  const signature = toHex(await hmacSha256(kSigning, stringToSign))

  return {
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': String(timestamp),
    Authorization:
      `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`
  }
}
