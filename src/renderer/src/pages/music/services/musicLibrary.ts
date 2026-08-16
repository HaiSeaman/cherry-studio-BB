import { db } from '@renderer/databases'

import type { MusicTrack } from '../types'
import { fetchTrackMetadata } from './playLogic'

/** 逐个读取元数据的并发数（主进程 parseStream 有 IO/CPU 开销，限 3） */
const METADATA_CONCURRENCY = 3

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

/** 为扫描到的文件构建曲目（去重 + 元数据降级 + order 接续） */
export async function buildTracks(
  files: { filePath: string; size: number }[],
  existingPaths: Set<string>
): Promise<MusicTrack[]> {
  const fresh = files.filter((f) => f.filePath && !existingPaths.has(f.filePath))
  if (fresh.length === 0) return []

  let maxOrder = 0
  await db.music_tracks.each((t) => {
    if (t.order > maxOrder) maxOrder = t.order
  })

  const metas = await mapWithConcurrency(fresh, METADATA_CONCURRENCY, (f) => fetchTrackMetadata(f.filePath))
  const now = Date.now()
  return metas.map((meta, i) => ({
    filePath: fresh[i].filePath,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    duration: meta.duration,
    coverPath: meta.coverPath,
    thumbPath: meta.thumbPath,
    size: fresh[i].size,
    addedAt: now,
    favorite: 0 as const,
    order: maxOrder + i + 1
  }))
}

/** 添加文件（来自 file.select 对话框），返回新增数量 */
export async function addFilesToLibrary(filePaths: { filePath: string; size: number }[]): Promise<number> {
  const existing = new Set((await db.music_tracks.toArray()).map((t) => t.filePath))
  const tracks = await buildTracks(filePaths, existing)
  if (tracks.length > 0) await db.music_tracks.bulkAdd(tracks)
  return tracks.length
}

/** 添加文件夹：扫描 + 入库 + 记住文件夹；返回 {added, truncated} */
export async function addFolderToLibrary(folderPath: string): Promise<{ added: number; truncated: boolean }> {
  const res = await window.api.music.scanFolder(folderPath, true)
  if (!res.success) throw new Error('扫描文件夹失败')
  const added = await addFilesToLibrary(res.files)
  await db.music_folders.put({ path: folderPath, addedAt: Date.now() })
  return { added, truncated: res.truncated }
}

/** 增量重扫已保存文件夹（静默，仅合并新文件），返回新增数量 */
export async function rescanFolders(): Promise<number> {
  const folders = await db.music_folders.toArray()
  let added = 0
  for (const folder of folders) {
    try {
      const res = await window.api.music.scanFolder(folder.path, true)
      if (res.success) added += await addFilesToLibrary(res.files)
    } catch {
      // 单个文件夹失败继续下一个
    }
  }
  return added
}

/** 批量更新拖拽排序后的 order（重建整表顺序） */
export async function reorderTracks(orderedIds: number[]): Promise<void> {
  await db.transaction('rw', db.music_tracks, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.music_tracks.update(orderedIds[i], { order: i + 1 })
    }
  })
}
