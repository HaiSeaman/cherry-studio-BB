// port https://github.com/zcaceres/fetch-mcp/blob/main/src/index.ts

import dns from 'node:dns/promises'
import net from 'node:net'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { net as electronNet } from 'electron'
import TurndownService from 'turndown'
import * as z from 'zod'

export const RequestPayloadSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional()
})

export type RequestPayload = z.infer<typeof RequestPayloadSchema>

/**
 * 判断某个 IP 是否属于环回 / 链路本地 / 私有 / CGNAT 等不应被外部抓取工具访问的地址。
 * SSRF 防护核心判断，导出以便单元测试。
 */
export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip)
  if (version === 0) {
    return false
  }

  if (version === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0) return true // 0.0.0.0/8
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local（含云元数据 169.254.169.254）
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
    return false
  }

  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true // unspecified / loopback
  if (lower.startsWith('::ffff:')) return isBlockedIp(lower.slice('::ffff:'.length)) // IPv4-mapped
  if (/^fe[89ab]/.test(lower)) return true // fe80::/10 link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 unique local
  return false
}

/**
 * 校验 URL 协议与目标地址：
 * - 仅允许 http/https
 * - 拒绝字面量形式的环回/私有/保留 IP
 * - 对域名做 DNS 解析，拒绝解析到内网地址的情况
 */
export async function assertSafeFetchUrl(rawUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL: only http/https are allowed (got ${parsed.protocol})`)
  }

  // URL.hostname 对 IPv6 会保留方括号，去掉后再判断
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error(`Blocked URL: ${hostname} is a loopback/private address`)
    }
    return
  }

  let addresses: { address: string }[]
  try {
    addresses = await dns.lookup(hostname, { all: true })
  } catch {
    // 解析失败时不额外拦截，交给底层 fetch 抛出真实的网络错误，避免误伤正常公网域名
    return
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new Error(`Blocked URL: ${hostname} resolves to a loopback/private address`)
    }
  }
}

export class Fetcher {
  private static async _fetch({ url, headers }: RequestPayload): Promise<Response> {
    try {
      // SSRF 防护：拒绝内网/环回/保留地址以及非 http(s) 协议
      await assertSafeFetchUrl(url)

      // 加 30s 超时：恶意/超慢站点不再能无限挂住 LLM 调用请求
      const response = await electronNet.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers
        },
        signal: AbortSignal.timeout(30000)
      })

      // 重定向到内网也需拦截：对最终 URL 复检
      if (response.url && response.url !== url) {
        await assertSafeFetchUrl(response.url)
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }
      return response
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(`Failed to fetch ${url}: ${e.message}`)
      } else {
        throw new Error(`Failed to fetch ${url}: Unknown error`)
      }
    }
  }

  static async html(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload)
      const html = await response.text()
      return { content: [{ type: 'text', text: html }], isError: false }
    } catch (error) {
      return {
        content: [{ type: 'text', text: (error as Error).message }],
        isError: true
      }
    }
  }

  static async json(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload)
      const json = await response.json()
      return {
        content: [{ type: 'text', text: JSON.stringify(json) }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: (error as Error).message }],
        isError: true
      }
    }
  }

  static async txt(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload)
      const html = await response.text()

      // jsdom 很重（完整 DOM 实现），仅在提取网页纯文本时按需加载
      const { JSDOM } = await import('jsdom')
      const dom = new JSDOM(html)
      const document = dom.window.document

      const scripts = document.getElementsByTagName('script')
      const styles = document.getElementsByTagName('style')
      Array.from(scripts).forEach((script: any) => script.remove())
      Array.from(styles).forEach((style: any) => style.remove())

      const text = document.body.textContent || ''

      const normalizedText = text.replace(/\s+/g, ' ').trim()

      return {
        content: [{ type: 'text', text: normalizedText }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: (error as Error).message }],
        isError: true
      }
    }
  }

  static async markdown(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload)
      const html = await response.text()
      const turndownService = new TurndownService()
      const markdown = turndownService.turndown(html)
      return { content: [{ type: 'text', text: markdown }], isError: false }
    } catch (error) {
      return {
        content: [{ type: 'text', text: (error as Error).message }],
        isError: true
      }
    }
  }
}

const server = new Server(
  {
    name: 'zcaceres/fetch',
    version: '0.1.0'
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    }
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'fetch_html',
        description: 'Fetch a website and return the content as HTML',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL of the website to fetch'
            },
            headers: {
              type: 'object',
              description: 'Optional headers to include in the request'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'fetch_markdown',
        description: 'Fetch a website and return the content as Markdown',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL of the website to fetch'
            },
            headers: {
              type: 'object',
              description: 'Optional headers to include in the request'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'fetch_txt',
        description: 'Fetch a website, return the content as plain text (no HTML)',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL of the website to fetch'
            },
            headers: {
              type: 'object',
              description: 'Optional headers to include in the request'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'fetch_json',
        description: 'Fetch a JSON file from a URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL of the JSON to fetch'
            },
            headers: {
              type: 'object',
              description: 'Optional headers to include in the request'
            }
          },
          required: ['url']
        }
      }
    ]
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { arguments: args } = request.params

  const validatedArgs = RequestPayloadSchema.parse(args)

  if (request.params.name === 'fetch_html') {
    return await Fetcher.html(validatedArgs)
  }
  if (request.params.name === 'fetch_json') {
    return await Fetcher.json(validatedArgs)
  }
  if (request.params.name === 'fetch_txt') {
    return await Fetcher.txt(validatedArgs)
  }
  if (request.params.name === 'fetch_markdown') {
    return await Fetcher.markdown(validatedArgs)
  }
  throw new Error('Tool not found')
})

class FetchServer {
  public server: Server
  constructor() {
    this.server = server
  }
}
export default FetchServer
