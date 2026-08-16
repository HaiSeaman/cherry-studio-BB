import type { RadioStation } from '../types'

/**
 * RadioBrowser API 封装（复刻自音乐tab页.md §7）
 * - 镜像随机化 + 固定容灾顺序
 * - 归一化字段截断、url/favicon 仅接受 http(s)
 * - 中港音乐台过滤（剔除 HLS/m3u8、码率 <64）
 * - 按 url 去重，参数顺序即优先级
 * - 内置 4 个 RTHK 精选电台保底
 */

export type RadioConfig = {
  apiBaseUrl: string
  timeout: number
  customStations: RadioStation[]
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

/** 中港音乐台可播性过滤：剔除 HLS / m3u8 / 码率 <64 */
export function isPlayableCnHk(s: RadioStation): boolean {
  const codec = s.codec.toUpperCase()
  if (codec.includes('HLS') || codec.includes('MPEGURL')) return false
  if (s.url.toLowerCase().includes('.m3u8')) return false
  return s.bitrate >= 64
}

/** 内置精选电台（线上 API 完全不可用时的保底，永远排在最前） */
export const BUILTIN_CN_HK_MUSIC_STATIONS: RadioStation[] = [
  { name: 'RTHK Radio 1', url: 'http://rthkaudio1.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,news', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
  { name: 'RTHK Radio 2', url: 'http://rthkaudio2.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,pop', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
  { name: 'RTHK Radio 3', url: 'http://rthkaudio3.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,english', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
  { name: 'RTHK Radio 4', url: 'http://rthkaudio4.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,classical', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' }
]

/**
 * 内置中文音乐电台（直链流，2026-08 经 RadioBrowser 核实可用）。
 * 含「清晨音乐台」等 11 个台，永远排在电台列表最前。
 */
export const BUILTIN_CN_MUSIC_STATIONS: RadioStation[] = [
  { name: '清晨音乐台', url: 'http://lhttp.qingting.fm/live/4915/64k.mp3', favicon: '', country: 'China', tags: 'music,pop', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: 'AsiaFM 亚洲音乐台', url: 'http://lhttp.qingting.fm/live/4581/64k.mp3', favicon: '', country: 'China', tags: 'music,pop', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: 'AsiaFM 高清音乐台', url: 'http://asiafm.hk:8000/asiahd', favicon: '', country: 'China', tags: 'music,hd', bitrate: 96, codec: 'AAC+', homepage: '' },
  { name: 'AsiaFM 亚洲经典台', url: 'http://goldfm.cn:8000/goldfm', favicon: '', country: 'China', tags: 'music,classic', bitrate: 128, codec: 'AAC+', homepage: '' },
  { name: '广东音乐之声', url: 'https://lhttp.qtfm.cn/live/1260/64k.mp3', favicon: '', country: 'China', tags: 'music', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: '上海音乐广播', url: 'http://lhttp.qingting.fm/live/273/64k.mp3', favicon: '', country: 'China', tags: 'music', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: '上海经典音乐广播', url: 'http://lhttp.qingting.fm/live/267/64k.mp3', favicon: '', country: 'China', tags: 'music,classic', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: '广州金曲音乐广播', url: 'http://lhttp.qingting.fm/live/20192/64k.mp3', favicon: '', country: 'China', tags: 'music,golden', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: 'CRI 劲曲调频 HIT FM（成都）', url: 'http://lhttp.qingting.fm/live/15318703/64k.mp3', favicon: '', country: 'China', tags: 'music,hit', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: 'CityFM 城市音乐台', url: 'https://lhttp.qtfm.cn/live/20500153/64k.mp3', favicon: '', country: 'China', tags: 'music,city', bitrate: 64, codec: 'MP3', homepage: '' },
  { name: '动听音乐台', url: 'https://lhttp-hw.qtfm.cn/live/5022107/64k.mp3', favicon: '', country: 'China', tags: 'music', bitrate: 64, codec: 'MP3', homepage: '' }
]

/** 中港音乐列表统一合并：中文精选 → RTHK → 自定义 → 线上结果（缓存读取与在线拉取共用，保证内置台始终置顶） */
export function withBuiltinCnHk(list: RadioStation[], customStations: RadioStation[] = []): RadioStation[] {
  return dedupStationsByUrl(BUILTIN_CN_MUSIC_STATIONS, BUILTIN_CN_HK_MUSIC_STATIONS, customStations, list)
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

/**
 * 全球热门榜（三路并行）：topvote + 中国 + 香港
 * 合并顺序：中港置顶 → 自定义电台 → 全球热门榜
 */
export async function getTopStations(cfg: RadioConfig, limit = 50): Promise<RadioStation[]> {
  const n = clampLimit(limit)
  const [top, china, hongkong] = await Promise.all([
    fetchStations(cfg.apiBaseUrl, cfg.timeout, `/json/stations/topvote/${n}`),
    fetchStations(cfg.apiBaseUrl, cfg.timeout, `/json/stations/bycountryexact/China?limit=50`),
    fetchStations(cfg.apiBaseUrl, cfg.timeout, `/json/stations/bycountryexact/Hong%20Kong?limit=30`)
  ])
  return dedupStationsByUrl(dedupStationsByUrl(china, hongkong), cfg.customStations, top)
}

/**
 * 中港音乐台：search 按 countrycode+tag=music 按点击量倒序
 * 合并顺序：内置 RTHK 精选 → 自定义电台 → 线上筛选结果
 * apiBaseUrl = 'cnhk-music' 时为纯离线模式（仅内置 + 自定义）
 */
export async function getCnHkMusicStations(cfg: RadioConfig, limit = 50): Promise<RadioStation[]> {
  if (cfg.apiBaseUrl === 'cnhk-music') {
    return dedupStationsByUrl(BUILTIN_CN_MUSIC_STATIONS, BUILTIN_CN_HK_MUSIC_STATIONS, cfg.customStations)
  }
  const n = clampLimit(limit)
  const [cn, hk] = await Promise.all([
    fetchStations(cfg.apiBaseUrl, cfg.timeout, `/json/stations/search?countrycode=CN&tag=music&hidebroken=true&order=clickcount&reverse=true&limit=${n}`),
    fetchStations(cfg.apiBaseUrl, cfg.timeout, `/json/stations/search?countrycode=HK&tag=music&hidebroken=true&order=clickcount&reverse=true&limit=30`)
  ])
  const filtered = dedupStationsByUrl(cn, hk).filter(isPlayableCnHk)
  return withBuiltinCnHk(filtered, cfg.customStations)
}

/** 列表刷新来源（照文档 §7.7 五种循环） */
export type RadioSource = 'topvote' | 'topclick' | 'recent' | 'bycountry-china' | 'bycountry-hongkong'

const SOURCE_PATHS: Record<RadioSource, (n: number) => string> = {
  topvote: (n) => `/json/stations/topvote/${n}`,
  topclick: (n) => `/json/stations/topclick/${n}`,
  recent: (n) => `/json/stations/lastclick/${n}`,
  'bycountry-china': (n) => `/json/stations/bycountryexact/China?limit=${n}`,
  'bycountry-hongkong': (n) => `/json/stations/bycountryexact/Hong%20Kong?limit=${n}`
}

export async function getStationsBySource(cfg: RadioConfig, source: RadioSource, limit = 50): Promise<RadioStation[]> {
  const build = SOURCE_PATHS[source]
  if (!build) throw new Error(`unknown source: ${source}`)
  return fetchStations(cfg.apiBaseUrl, cfg.timeout, build(clampLimit(limit)))
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
