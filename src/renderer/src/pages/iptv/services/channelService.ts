import db from '@renderer/databases'

import type { IptvChannel, IptvFavorite, IptvHistory } from '../types'

const HISTORY_LIMIT = 50

/** 全量加载所有播放列表的频道（orderBy(':id') = 插入顺序 = M3U 原始顺序），后续过滤全在内存做 */
export async function loadChannels(): Promise<IptvChannel[]> {
  return db.iptv_channels.orderBy(':id').toArray()
}

/** 纯函数：按分组 + 关键词过滤频道（keyword 大小写不敏感，模糊匹配频道名） */
export function filterChannels(
  channels: IptvChannel[],
  opts: { group: string | null; keyword: string }
): IptvChannel[] {
  const kw = opts.keyword.trim().toLowerCase()
  return channels.filter((c) => {
    if (opts.group != null && c.group !== opts.group) return false
    if (kw && !c.name.toLowerCase().includes(kw)) return false
    return true
  })
}

/** 纯函数：按 group 聚合频道名列表，保留首次出现顺序（M3U 原始分组顺序） */
export function groupByChannels(channels: IptvChannel[]): { name: string; count: number }[] {
  const groups = new Map<string | null, number>()
  for (const c of channels) groups.set(c.group, (groups.get(c.group) ?? 0) + 1)
  return [...groups.entries()].map(([name, count]) => ({ name: name ?? '未分组', count }))
}

// ---------------- 收藏（url 主键快照表） ----------------

export async function getFavorites(): Promise<IptvFavorite[]> {
  return db.iptv_favorites.orderBy('addedAt').reverse().toArray()
}

export async function toggleFavorite(channel: Pick<IptvChannel, 'url' | 'name' | 'logo' | 'group' | 'tvgId'>) {
  const existing = await db.iptv_favorites.get(channel.url)
  if (existing) {
    await db.iptv_favorites.delete(channel.url)
    return false
  }
  await db.iptv_favorites.put({
    url: channel.url,
    name: channel.name,
    logo: channel.logo,
    group: channel.group,
    tvgId: channel.tvgId,
    addedAt: Date.now()
  })
  return true
}

// ---------------- 最近观看（url 主键快照，put 天然去重） ----------------

export async function recordPlay(channel: Pick<IptvChannel, 'url' | 'name' | 'logo'>) {
  await db.iptv_history.put({ url: channel.url, name: channel.name, logo: channel.logo, playedAt: Date.now() })
  // 超上限删最旧（事务包裹读改写：快速连开两个台并发裁剪时不会重复多删）
  await db.transaction('rw', db.iptv_history, async () => {
    const total = await db.iptv_history.count()
    if (total <= HISTORY_LIMIT) return
    const oldest = await db.iptv_history
      .orderBy('playedAt')
      .limit(total - HISTORY_LIMIT)
      .toArray()
    await db.iptv_history.bulkDelete(oldest.map((h) => h.url))
  })
}

export async function getRecent(limit = HISTORY_LIMIT): Promise<IptvHistory[]> {
  return db.iptv_history.orderBy('playedAt').reverse().limit(limit).toArray()
}
