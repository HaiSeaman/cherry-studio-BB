/**
 * 剪贴板纯逻辑：不依赖 electron，可被单元测试直接导入。
 * （electron 侧轮询/存储/广播见 ClipboardService.ts）
 */

import type { ClipboardItem } from '@shared/IpcChannel'

export type { ClipboardItem }

/** 历史上限默认（条数；需求4：可被 ClipboardLimits 覆盖） */
export const HISTORY_LIMIT = 200

/** 收藏与固定都是"钉住"语义：清空与容量修剪时两者都保护（需求3/4：收藏+置顶永不清理） */
const isProtected = (i: ClipboardItem): boolean => i.fav || i.pinned

/** 归一化：老版本持久化数据可能缺 fav 字段（JSON 加载兜底） */
export function normalizeItems(items: unknown[]): ClipboardItem[] {
  return items
    .filter(
      (i): i is ClipboardItem =>
        !!i && typeof (i as ClipboardItem).id === 'string' && typeof (i as ClipboardItem).fingerprint === 'string'
    )
    .map((i) => ({
      ...i,
      pinned: !!i.pinned,
      fav: !!i.fav
    }))
}

/** 展示排序：收藏/固定区在前（组内按 ts 倒序），其余按 ts 倒序 */
export function sortForDisplay(items: ClipboardItem[]): ClipboardItem[] {
  const pinned = items.filter(isProtected).sort((a, b) => b.ts - a.ts)
  const rest = items.filter((i) => !isProtected(i)).sort((a, b) => b.ts - a.ts)
  return [...pinned, ...rest]
}

/** 条数修剪（需求4）：超过 limit 时淘汰最旧的非收藏非固定条目；返回被删条目 */
export function pruneByCount(
  items: ClipboardItem[],
  limit: number
): { items: ClipboardItem[]; evicted: ClipboardItem[] } {
  const evicted: ClipboardItem[] = []
  const nonProtected = items.filter((i) => !isProtected(i))
  if (nonProtected.length > limit) {
    // 淘汰最旧（ts 最小）未被收藏/固定的条目：列表顺序会被"去重提升"打乱，不能按位置截断
    const toEvict = [...nonProtected].sort((a, b) => a.ts - b.ts).slice(0, nonProtected.length - limit)
    const evictedIds = new Set(toEvict.map((i) => i.id))
    evicted.push(...toEvict)
    return { items: items.filter((i) => !evictedIds.has(i.id)), evicted }
  }
  return { items, evicted }
}

/**
 * 入库：
 * - 指纹未命中（全新内容）→ 插到最前（时间顺序：最新复制在最前）；
 * - 指纹命中已有条目 → 该条保持身份/时间戳/位置全不变（同内容再次复制不提升置顶、不刷新时间）；
 * - 超出上限时淘汰最旧的非收藏非固定条目。
 * 返回更新后的列表与被淘汰条目（调用方负责删缩略图文件）。
 */
export function upsertAndEvict(
  items: ClipboardItem[],
  incoming: ClipboardItem,
  limit: number = HISTORY_LIMIT
): { items: ClipboardItem[]; evicted: ClipboardItem[] } {
  const existingIdx = items.findIndex((i) => i.fingerprint === incoming.fingerprint)
  if (existingIdx === -1) {
    return pruneByCount([incoming, ...items], limit)
  }
  // 同内容再次复制：原样保留（含 pinned/fav/ts/列表位置），避免"点击复制后自动置顶"
  const next = [...items]
  return pruneByCount(next, limit)
}

/** 清空/清理保留集合：收藏与置顶的条目一律保留（需求3：永不清理），其余返回待删除 */
export function partitionProtected(items: ClipboardItem[]): { keep: ClipboardItem[]; removed: ClipboardItem[] } {
  const keep = items.filter(isProtected)
  const keepIds = new Set(keep.map((i) => i.id))
  return { keep, removed: items.filter((i) => !keepIds.has(i.id)) }
}

/** 天数修剪（需求4）：删除超过 maxDays 天且未收藏未固定条目；返回被删条目 */
export function pruneByTime(
  items: ClipboardItem[],
  now: number,
  maxDays: number
): { items: ClipboardItem[]; evicted: ClipboardItem[] } {
  const cutoff = now - maxDays * 24 * 60 * 60 * 1000
  const evicted = items.filter((i) => !isProtected(i) && i.ts < cutoff)
  const evictedIds = new Set(evicted.map((i) => i.id))
  return { items: items.filter((i) => !evictedIds.has(i.id)), evicted }
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** 检测十六进制色号（需求5）：必须带 # 前缀（防普通文本误判）；返回规范化大写，非色号返回 null */
export function detectColor(text: string): string | null {
  const t = text.trim()
  if (!HEX_RE.test(t)) return null
  let digits = t.replace('#', '').toUpperCase()
  if (digits.length === 3 || digits.length === 4) digits = digits.replace(/./g, (ch) => ch + ch)
  return '#' + digits
}

/** HTML → 纯文本预览（轻量正则去标签+实体；不引入 DOM 依赖） */
export function stripHtmlText(html: string): string {
  const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'"
  }
  return text
    .replace(/&(?:nbsp|lt|gt|amp|quot|#39);/g, (m) => entities[m] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 解析 Windows FileNameW 剪贴板格式（UTF-16LE 路径列表，单 \0 分隔、双 \0 结束）。
 * 读不到或解析为空返回 null（调用方降级处理）。
 */
export function parseFileNameW(buf: Buffer | null): string[] | null {
  if (!buf || buf.length < 2) return null
  let text = buf.toString('utf16le')
  // 去除尾部空字符：用 charCodeAt 判断而非正则，规避 no-control-regex 误报
  let end = text.length
  while (end > 0 && text.charCodeAt(end - 1) === 0) end--
  text = text.slice(0, end)
  const paths = text
    .split('\0')
    .map((p) => p.trim())
    .filter(Boolean)
  return paths.length > 0 ? paths : null
}
