import db from '@renderer/databases'

import type { IptvChannel, IptvLocalVideo, LocalPlayMode } from '../types'

/** 可添加的本地视频扩展名（容器层面；编码是否可解码由播放时的引擎决定，失败有明确提示） */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'ts', 'm2ts', 'flv', 'ogv'] as const

const VIDEO_EXT_RE = new RegExp(`\\.(${VIDEO_EXTENSIONS.join('|')})$`, 'i')

/** 纯函数：按扩展名判断是否本地视频文件（大小写不敏感） */
export function isVideoFile(path: string): boolean {
  return VIDEO_EXT_RE.test(path.trim())
}

/** 本地文件协议判定（file:// 前缀即本地媒体，走 native 引擎 / 断点续播等 VOD 语义） */
export function isLocalUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith('file:')
}

/** 倍速夹取范围（0.25-4），切片存档与播放器内核共用 */
export const clampRate = (rate: number) => Math.min(Math.max(rate, 0.25), 4)

/**
 * 纯函数：断点是否有效（>5s 且未临近片尾 10s）。
 * 时长未知（dur<=0）时视为有效断点（playLocal 起播路径）；调用方要求"时长已知才算"的可自行加 dur>0 前缀。
 */
export function hasResumePoint(positionSec: number, durationSec: number): boolean {
  return positionSec > 5 && (durationSec <= 0 || positionSec < durationSec - 10)
}

/**
 * 纯函数：本地文件绝对路径 → 可直接喂给 <video> 的 file:// URL。
 * Windows 反斜杠归一为正斜杠；逐段 encodeURIComponent（中文/空格/#/? 全覆盖）；
 * 盘符段（D:）的冒号不编码；UNC 路径（\\server\share\x）→ file://server/share/x。
 */
export function localFileUrl(path: string): string {
  const norm = path.replace(/\\/g, '/').replace(/\/+$/, '')
  // UNC：//server/share/a.mp4
  if (norm.startsWith('//')) {
    const segs = norm.slice(2).split('/').filter(Boolean)
    return `file://${segs.map(encodeURIComponent).join('/')}`
  }
  const segs = norm.split('/').filter(Boolean)
  return `file:///${segs.map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join('/')}`
}

/** 纯函数：秒 → mm:ss（满 1 小时 h:mm:ss），非法值给 --:-- */
export function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '--:--'
  const s = Math.floor(totalSec)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return hh > 0 ? `${hh}:${p2(mm)}:${p2(ss)}` : `${p2(mm)}:${p2(ss)}`
}

/**
 * 纯函数：自动连播的下一个索引（video ended 时）。
 * order：顺序，播完列表末尾 → null（停止）；loopOne：原地循环；shuffle：随机换一个（单视频时原地）。
 */
export function nextLocalIndex(current: number, len: number, mode: LocalPlayMode): number | null {
  if (len <= 0 || current < 0 || current >= len) return null
  switch (mode) {
    case 'loopOne':
      return current
    case 'shuffle':
      return len === 1 ? current : excludeRandom(current, len)
    default: // order：顺序推进，末尾停止
      return current + 1 < len ? current + 1 : null
  }
}

/** 纯函数：手动上一个/下一个（delta=±1），越界环绕（列表循环切换，符合播放器直觉） */
export function stepIndex(current: number, len: number, delta: number): number | null {
  if (len <= 0) return null
  return (((current + delta) % len) + len) % len
}

function excludeRandom(current: number, len: number): number {
  let next = current
  while (next === current) next = Math.floor(Math.random() * len)
  return next
}

/** 本地文件路径 → IptvChannel 形状（复用播放器管道；engineType 由 store 强制 native） */
export function toLocalChannel(v: Pick<IptvLocalVideo, 'name' | 'path'>): IptvChannel {
  return { id: 0, playlistId: 0, name: v.name, url: localFileUrl(v.path), logo: null, group: '本地视频', tvgId: null }
}

/** 文件路径取文件名（兼容 \ 与 / 分隔） */
export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * 批量添加本地视频（&path 唯一索引天然去重，已存在的跳过）。
 * 返回本次真正新增的数量。
 */
export async function addLocalVideos(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0
  const existing = new Set((await db.iptv_locals.toArray()).map((v) => v.path))
  const fresh = paths.filter((p) => !existing.has(p))
  if (fresh.length === 0) return 0
    const now = Date.now()
    try {
      await db.iptv_locals.bulkAdd(
        fresh.map((p) => ({
          name: basename(p),
          path: p,
          addedAt: now,
          lastPlayedAt: null,
          positionSec: 0,
          durationSec: 0
        }))
      )
    } catch (e) {
      // 极快连拖两批的竞态：查重后到落库之间对方已写入同一 path → 唯一索引冲突。
      // 已写入的部分保留，本次按 0 新增处理（提示"都已在列表中"）；其他错误照常抛出由入口提示
      if ((e as { name?: string })?.name !== 'ConstraintError') throw e
      return 0
    }
    return fresh.length
  }

/** 保存断点：只接受有效时长下的有限值（流媒体/加载中的 NaN 一律不写） */
export async function saveLocalProgress(path: string, positionSec: number, durationSec: number): Promise<void> {
  if (!Number.isFinite(positionSec) || positionSec < 0) return
  const patch: Partial<IptvLocalVideo> = { positionSec: Math.floor(positionSec) }
  if (Number.isFinite(durationSec) && durationSec > 0) patch.durationSec = Math.floor(durationSec)
  await db.iptv_locals.where('path').equals(path).modify(patch)
}
