import type { RadioStation } from '../types'

/**
 * RadioBrowser API 封装（复刻自音乐tab页.md §7）—— 现仅服务「搜索」tab：
 * - 镜像随机化 + 固定容灾顺序
 * - 归一化字段截断、url/favicon 仅接受 http(s)
 * - 按 url 去重，参数顺序即优先级
 * 板块电台（国内/国外 × 综合/音乐）见 radioBoards.ts（静态数据，不走本模块）
 */

export type RadioConfig = {
  apiBaseUrl: string
  timeout: number
}

export const RADIO_DEFAULT_API = 'https://all.api.radio-browser.info'

const RADIO_MIRROR_HOSTS = ['de1', 'nl1', 'at1']

export const RADIO_FALLBACKS = RADIO_MIRROR_HOSTS.map((host) => `https://${host}.api.radio-browser.info`)

const RESPONSE_LIMIT = 5 * 1024 * 1024

const clampLimit = (limit: number): number => Math.min(Math.max(limit, 1), 200)

/** all 地址随机均衡到三镜像之一；自定义地址不随机 */
export function radioGetMirror(apiBaseUrl?: string): string {
  const base = apiBaseUrl || RADIO_DEFAULT_API
  if (base === RADIO_DEFAULT_API) {
    const pick = RADIO_MIRROR_HOSTS[Math.floor(Math.random() * RADIO_MIRROR_HOSTS.length)]
    return `https://${pick}.api.radio-browser.info`
  }
  return base
}

/** 容灾顺序：随机镜像优先，其余镜像按固定顺序补位（已去重） */
export function buildTryUrls(apiBaseUrl?: string): string[] {
  const first = radioGetMirror(apiBaseUrl)
  return [first, ...RADIO_FALLBACKS.filter((u) => u !== first)]
}

/** RadioBrowser 原始 JSON → 统一结构；非法记录返回 null（照文档 §7.5 截断规则） */
export function radioNormalizeStation(raw: any): RadioStation | null {
  if (!raw || typeof raw !== 'object') return null
  const url = String(raw.url || raw.streamurl || '').slice(0, 1024)
  if (!url || !/^https?:\/\//i.test(url)) return null
  const tags = Array.isArray(raw.tags) ? raw.tags.join(',') : String(raw.tags || '')
  const favicon = String(raw.favicon || '').slice(0, 512)
  return {
    name: String(raw.name || raw.stationname || '未知电台').slice(0, 128),
    url,
    favicon: /^https?:\/\//i.test(favicon) ? favicon : '',
    country: String(raw.country || '').slice(0, 64),
    tags: tags.slice(0, 256),
    bitrate: Number(raw.bitrate) || 0,
    codec: String(raw.codec || '').slice(0, 32),
    homepage: String(raw.homepage || '').slice(0, 512)
  }
}

/** 按 url 去重，先出现的优先（参数顺序即优先级） */
export function dedupStationsByUrl(...lists: RadioStation[][]): RadioStation[] {
  const seen = new Set<string>()
  const result: RadioStation[] = []
  for (const list of lists) {
    for (const s of list) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      result.push(s)
    }
  }
  return result
}

/** 单镜像 JSON 请求：超时中止 + 响应体 5MB 上限 */
export async function fetchRadioJson(base: string, path: string, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(base + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const len = Number(res.headers.get('content-length') || 0)
    if (len > RESPONSE_LIMIT) throw new Error('response too large')
    const text = await res.text()
    if (text.length > RESPONSE_LIMIT) throw new Error('response too large')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

/** 按容灾顺序逐镜像尝试，全部失败抛出最后一个错误 */
export async function radioGetJson(apiBaseUrl: string, timeout: number, path: string): Promise<any> {
  let lastError: unknown = new Error('no mirror tried')
  for (const base of buildTryUrls(apiBaseUrl)) {
    try {
      return await fetchRadioJson(base, path, timeout)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/** 请求任意 stations 端点并归一化 + 去重 */
export async function fetchStations(apiBaseUrl: string, timeout: number, path: string): Promise<RadioStation[]> {
  const raw = await radioGetJson(apiBaseUrl, timeout, path)
  if (!Array.isArray(raw)) return []
  const normalized = raw.map(radioNormalizeStation).filter((s): s is RadioStation => s !== null)
  return dedupStationsByUrl(normalized)
}

export type RadioSearchOptions = { keyword?: string; country?: string; tag?: string; limit?: number }

/** 搜索三模式：按名称 / 按国家 / 按标签（keyword 截 128，country/tag 截 64） */
export async function searchStations(cfg: RadioConfig, opts: RadioSearchOptions): Promise<RadioStation[]> {
  const n = clampLimit(opts.limit ?? 50)
  let path: string
  if (opts.keyword) {
    path = `/json/stations/byname/${encodeURIComponent(opts.keyword.slice(0, 128))}?limit=${n}`
  } else if (opts.country) {
    path = `/json/stations/bycountry/${encodeURIComponent(opts.country.slice(0, 64))}?limit=${n}`
  } else if (opts.tag) {
    path = `/json/stations/bytag/${encodeURIComponent(opts.tag.slice(0, 64))}?limit=${n}`
  } else {
    throw new Error('searchStations requires keyword / country / tag')
  }
  return fetchStations(cfg.apiBaseUrl, cfg.timeout, path)
}
