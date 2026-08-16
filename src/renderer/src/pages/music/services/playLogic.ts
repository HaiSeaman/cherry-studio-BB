import type { MusicTrack } from '../types'

/** 秒 → m:ss（NaN/负数按 0 处理） */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 池内下一首索引（池为 playlist 全体索引或收藏索引池）
 * - sequential：(i+1) % len 回绕；current 不在池中从池首开始
 * - shuffle：随机且异于 current（单元素池返回自身）
 */
export function nextIndexInPool(pool: number[], current: number, mode: 'sequential' | 'shuffle'): number {
  if (pool.length === 0) return -1
  if (pool.length === 1) return pool[0]
  if (mode === 'shuffle') {
    const curPos = pool.indexOf(current)
    for (let attempt = 0; attempt < 10; attempt++) {
      const pick = pool[Math.floor(Math.random() * pool.length)]
      if (pick !== current) return pick
    }
    // 兜底：取池中 current 的下一个（异于 current）
    const pos = curPos >= 0 ? curPos : -1
    return pool[(pos + 1 + pool.length) % pool.length]
  }
  const pos = pool.indexOf(current)
  if (pos < 0) return pool[0]
  return pool[(pos + 1) % pool.length]
}

/** 池内上一首索引（回绕） */
export function prevIndexInPool(pool: number[], current: number): number {
  if (pool.length === 0) return -1
  const pos = pool.indexOf(current)
  if (pos < 0) return pool[0]
  return pool[(pos - 1 + pool.length) % pool.length]
}

/** 随机历史入栈：先移除已有同索引保持「栈顶=最新」，上限 100 */
export function pushShuffleHistory(history: number[], index: number): number[] {
  const next = history.filter((i) => i !== index)
  next.push(index)
  return next.length > 100 ? next.slice(next.length - 100) : next
}

/** 删除索引修正：删在 current 之前 → current-1；删自身 → 原位（由调用方决定接续）；删在后 → 不变 */
export function fixIndexAfterDelete(deleted: number, current: number): number {
  if (deleted < current) return current - 1
  return current
}

/** 删除后修正随机历史栈：等于 deleted 的移除，大于 deleted 的减一 */
export function fixHistoryAfterDelete(history: number[], deleted: number): number[] {
  return history.filter((i) => i !== deleted).map((i) => (i > deleted ? i - 1 : i))
}

/** 拖拽移动后修正 current（照文档 §4.8 三分支） */
export function fixIndexAfterMove(from: number, to: number, current: number): number {
  if (current === from) return to
  if (from < current && to >= current) return current - 1
  if (from > current && to <= current) return current + 1
  return current
}

/** 本地绝对路径 → file:// URL（反斜杠转正斜杠、分段 encodeURIComponent；盘符 D: 的冒号保留） */
export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const encoded = normalized
    .split('/')
    .map((seg) => (seg === '' || /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/')
  return 'file://' + (encoded.startsWith('/') ? '' : '/') + encoded
}

export type TrackMetadata = Pick<MusicTrack, 'title' | 'artist' | 'album' | 'duration' | 'coverPath' | 'thumbPath'>

/** 元数据 IPC 读取，失败降级：文件名（去扩展名）当标题，其余为空 */
export async function fetchTrackMetadata(filePath: string): Promise<TrackMetadata> {
  try {
    const res = await window.api.music.readMetadata(filePath)
    if (res?.success && res.metadata) {
      return {
        title: res.metadata.title,
        artist: res.metadata.artist,
        album: res.metadata.album,
        duration: res.metadata.duration,
        coverPath: res.metadata.coverPath,
        thumbPath: res.metadata.thumbPath
      }
    }
  } catch {
    // IPC 异常走降级
  }
  const name = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
  return { title: name.replace(/\.[^.]+$/, ''), artist: '', album: '', duration: 0, coverPath: '', thumbPath: '' }
}
