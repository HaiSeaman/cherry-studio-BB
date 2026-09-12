import type { RadioStation } from '../types'
import raw from './stations.json'

/**
 * FM 电台四大板块（静态精选数据，打包内置、零网络依赖）：
 * 国内/国外 × 综合/音乐，源自 stations.json。
 * m3u8 类型映射为 codec 'HLS'（播放引擎据此走 hls.js 路径）。
 */

export type BoardGroup = 'domestic' | 'foreign'
export type BoardSub = 'news' | 'music'
export type BoardKey = 'domestic_news' | 'domestic_music' | 'foreign_news' | 'foreign_music'

/** 一级 + 二级 → 板块 key 的唯一映射表（避免散落的字符串拼接与类型断言） */
export const BOARD_KEYS: Record<BoardGroup, Record<BoardSub, BoardKey>> = {
  domestic: { news: 'domestic_news', music: 'domestic_music' },
  foreign: { news: 'foreign_news', music: 'foreign_music' }
}

/** 二级板块顺序（UI 渲染用） */
export const BOARD_SUBS: BoardSub[] = ['news', 'music']

export function boardKeyOf(group: BoardGroup, sub: BoardSub): BoardKey {
  return BOARD_KEYS[group][sub]
}

type RawStation = { name: string; url: string; type: string; desc: string; badge: string }

const toStation = (s: RawStation): RadioStation => ({
  name: s.name,
  url: s.url,
  favicon: '',
  country: '',
  tags: '',
  bitrate: 0,
  codec: s.type === 'm3u8' ? 'HLS' : s.type.toUpperCase(),
  homepage: '',
  badge: s.badge,
  desc: s.desc
})

export const RADIO_BOARDS: Record<BoardKey, RadioStation[]> = {
  domestic_news: raw.domestic_news.map(toStation),
  domestic_music: raw.domestic_music.map(toStation),
  foreign_news: raw.foreign_news.map(toStation),
  foreign_music: raw.foreign_music.map(toStation)
}

/**
 * 板块电台 + 自定义电台合并：自定义一律排尾部。
 * 同 url 时**自定义优先**（保留用户自己的命名，且列表里 isCustom 为真、✕ 才能正常删除它）；
 * 因此与自定义撞 url 的板块台先被剔除，避免同一地址在列表里出现两次。
 */
export function getBoardStations(board: BoardKey, customStations: RadioStation[]): RadioStation[] {
  const customUrls = new Set(customStations.map((s) => s.url))
  return [...RADIO_BOARDS[board].filter((s) => !customUrls.has(s.url)), ...customStations]
}

const HLS_CODEC_RE = /HLS|M3U8/i
const M3U8_URL_RE = /\.m3u8($|\?)/i

/**
 * 全板块 HLS 流地址集合：RTHK / 商业电台等 HLS 流地址没有 .m3u8 后缀，
 * 单看 URL 无法判定，必须查数据。收藏/挂件播放的电台可能不在当前板块列表内，
 * 播放端据此兜底，避免把这些流交给原生 <audio>（Chromium 不支持 HLS）。
 */
const HLS_URLS = new Set<string>(
  Object.values(RADIO_BOARDS)
    .flat()
    .filter((s) => s.codec === 'HLS')
    .map((s) => s.url)
)

/**
 * 是否 HLS 流 —— 全项目唯一判定入口（播放端与数据端共用，勿在别处重复写正则）。
 * 依次判定：电台 codec 字段 → 板块 HLS 名单 → .m3u8 后缀（覆盖用户自定义与搜索来源）。
 */
export function isHlsStation(url: string, codec?: string): boolean {
  if (codec && HLS_CODEC_RE.test(codec)) return true
  if (HLS_URLS.has(url)) return true
  return M3U8_URL_RE.test(url)
}
