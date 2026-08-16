/**
 * 便签一键转长图：纯 Canvas 2D 绘制白底黑字（逐字换行），复制到剪贴板。
 * 复刻便签和闹钟.md §4.6 的绘制思路（wrapNoteText 用 ctx.measureText 逐字测量）。
 */

const WIDTH = 720
const FONT_SIZE = 16
const LINE_HEIGHT = 26
const PADDING = 24

/** 按画布宽度逐字换行（中文无空格分词，须逐字测量） */
export function wrapNoteText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }
    let current = ''
    for (const ch of paragraph) {
      if (ctx.measureText(current + ch).width > maxWidth && current) {
        lines.push(current)
        current = ch
      } else {
        current += ch
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

/** 绘制长图并写入剪贴板；内容为空或剪贴板失败返回 false */
export async function exportNoteImage(content: string): Promise<boolean> {
  const text = (content || '').trimEnd()
  if (!text.trim()) return false

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  ctx.font = `${FONT_SIZE}px "PingFang SC", "Microsoft YaHei", sans-serif`
  const lines = wrapNoteText(ctx, text, WIDTH - PADDING * 2)
  canvas.width = WIDTH
  canvas.height = Math.max(PADDING * 2 + lines.length * LINE_HEIGHT, WIDTH / 4)

  // 白底
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 黑字逐行绘制
  ctx.fillStyle = '#22312A'
  ctx.font = `${FONT_SIZE}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    ctx.fillText(line, PADDING, PADDING + i * LINE_HEIGHT)
  })

  try {
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}
