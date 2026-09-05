import db from '@renderer/databases'
import { parse } from 'iptv-playlist-parser'

import type { IptvChannel } from '../types'

/** iptv-playlist-parser 对缺失属性返回 '' 而非 undefined/null（实测验证），入库前归一化 */
const norm = (v: string | undefined): string | null => (v && v.length > 0 ? v : null)

/**
 * 纯函数：M3U 文本 → 频道对象数组（只取 5 个字段；id/playlistId 由入库时生成）。
 * iptv-playlist-parser 要求首行必须 #EXTM3U（否则抛"Playlist is not valid"）：
 * 这里做最小防护——去 BOM、无头文件自动补头、空文本返回空数组（真实源良莠不齐）。
 */
export function parseM3U(text: string): Omit<IptvChannel, 'id' | 'playlistId'>[] {
  const stripped = text.replace(/^\uFEFF/, '').trim()
  if (!stripped) return []
  const normalized = stripped.startsWith('#EXTM3U') ? stripped : `#EXTM3U\n${stripped}`
  return parse(normalized).items.map((it) => ({
    name: it.name,
    url: it.url,
    logo: norm(it.tvg?.logo),
    group: norm(it.group?.title),
    tvgId: norm(it.tvg?.id)
  }))
}

/**
 * 拉取远程 M3U 文本：走主进程 download → readText（自动 chardet 编码检测，含 GBK）。
 * download 会落盘到用户文件目录，读完即删，不留垃圾。
 */
export async function fetchRemotePlaylist(url: string): Promise<string> {
  const meta = await window.api.file.download(url)
  if (!meta?.path) throw new Error('下载播放列表失败')
  try {
    return await window.api.fs.readText(meta.path)
  } finally {
    void window.api.file.deleteExternalFile(meta.path).catch(() => {})
  }
}

/** 读取本地 .m3u 文件（主进程 readText 自动编码检测） */
export async function readLocalPlaylist(filePath: string): Promise<string> {
  return window.api.fs.readText(filePath)
}

/** 解析并入库：先清空该列表旧频道再批量写入（收藏/历史为 url 快照表，不受影响） */
export async function parseAndStore(playlistId: number, text: string): Promise<number> {
  const channels = parseM3U(text)
  if (channels.length === 0) throw new Error('播放列表中没有可用的频道')
  await db.transaction('rw', db.iptv_channels, async () => {
    await db.iptv_channels.where('playlistId').equals(playlistId).delete()
    await db.iptv_channels.bulkAdd(channels.map((c) => ({ ...c, playlistId })))
  })
  return channels.length
}

/** 按 URL 后缀路由播放引擎 */
export function selectEngine(url: string): 'hls' | 'mpegts' | 'native' {
  if (/\.m3u8($|\?)/i.test(url)) return 'hls'
  if (/\.(ts|mpegts|flv)($|\?)/i.test(url)) return 'mpegts'
  return 'native'
}
