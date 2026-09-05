import db from '@renderer/databases'

import type { IptvPlaylist } from '../types'
import { fetchRemotePlaylist, parseAndStore, readLocalPlaylist } from './m3uService'

export async function getPlaylists(): Promise<IptvPlaylist[]> {
  return db.iptv_playlists.toArray()
}

/** 添加播放列表源：先入库拿到 id，再拉取解析频道 */
export async function addPlaylist(name: string, url: string, type: 'remote' | 'local'): Promise<IptvPlaylist> {
  const id = await db.iptv_playlists.add({ name, url, type, updatedAt: Date.now() } as IptvPlaylist)
  try {
    await refreshPlaylist({ id, name, url, type, updatedAt: Date.now() })
    return (await db.iptv_playlists.get(id))!
  } catch (err) {
    // 拉取失败回滚，不留空壳列表
    await db.iptv_playlists.delete(id)
    throw err
  }
}

/** 重新拉取/读取并解析入库；返回频道数 */
export async function refreshPlaylist(playlist: IptvPlaylist): Promise<number> {
  const text =
    playlist.type === 'remote' ? await fetchRemotePlaylist(playlist.url) : await readLocalPlaylist(playlist.url)
  const count = await parseAndStore(playlist.id, text)
  await db.iptv_playlists.update(playlist.id, { updatedAt: Date.now() })
  return count
}

/** 删除播放列表：连带删除该列表的频道缓存（收藏/历史为 url 快照，有意保留） */
export async function removePlaylist(playlist: IptvPlaylist): Promise<void> {
  await db.transaction('rw', [db.iptv_playlists, db.iptv_channels], async () => {
    await db.iptv_playlists.delete(playlist.id)
    await db.iptv_channels.where('playlistId').equals(playlist.id).delete()
  })
}
