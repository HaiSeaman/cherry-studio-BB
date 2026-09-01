import * as XLSX from '@e965/xlsx'
import mammoth from 'mammoth'

/**
 * 文本解析结果。
 * - kind 'line'：txt/md/csv 等纯文本，可按行记录位置（source.type='line'）
 * - kind 'flow'：pdf/docx/xlsx 等流式文本，无行号概念，按块序号记录（source.type='para'）
 */
export interface ParsedDoc {
  text: string
  kind: 'line' | 'flow'
}

/** 支持的扩展名（小写，含点） */
export const SUPPORTED_EXTS = ['.txt', '.md', '.mdx', '.csv', '.json', '.pdf', '.docx', '.xlsx', '.xls'] as const

export type SupportedExt = (typeof SUPPORTED_EXTS)[number]

export function isSupportedExt(ext: string): ext is SupportedExt {
  return (SUPPORTED_EXTS as readonly string[]).includes(ext.toLowerCase())
}

/**
 * 按扩展名读取并抽取纯文本。
 * 数据源均为 Electron 现成能力：fs.readText（自动编码含 GBK）、fs.read（Buffer）、pdf.extractText（主进程）。
 * @param path 本地文件绝对路径（来自用户对话框选择）
 */
export async function extractText(path: string, ext: string): Promise<ParsedDoc> {
  const lowerExt = ext.toLowerCase()
  if (!isSupportedExt(lowerExt)) {
    throw new Error(`暂不支持的文件类型：${ext}`)
  }

  // 纯文本类：用 readText（chardet+iconv 自动识别编码，含 GBK 中文）
  if (lowerExt === '.txt' || lowerExt === '.md' || lowerExt === '.mdx' || lowerExt === '.csv' || lowerExt === '.json') {
    const text = await window.api.fs.readText(path)
    return { text: normalizeText(text), kind: 'line' }
  }

  const buffer = await window.api.fs.read(path)

  if (lowerExt === '.pdf') {
    const text = await window.api.pdf.extractText(buffer)
    return { text: normalizeText(text), kind: 'flow' }
  }

  if (lowerExt === '.docx') {
    // Buffer 可能是底层池化大数组，必须按实际长度切片（与 computeContentHash 同理）
    const view = new Uint8Array(buffer)
    const arrayBuffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
    const result = await mammoth.extractRawText({ arrayBuffer })
    return { text: normalizeText(result.value), kind: 'flow' }
  }

  // xlsx / xls：逐 sheet 读单元格文本
  if (lowerExt === '.xlsx' || lowerExt === '.xls') {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const lines: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: ''
      })
      const textRows = rows
        .map((row) => (Array.isArray(row) ? row.map(cellText).filter(Boolean).join('\t') : ''))
        .filter(Boolean)
      if (textRows.length) {
        lines.push(`[${sheetName}]`, ...textRows)
      }
    }
    return { text: normalizeText(lines.join('\n')), kind: 'flow' }
  }

  throw new Error(`暂不支持的文件类型：${ext}`)
}

function cellText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim()
}

/** 规范化文本：去 BOM、\r\n → \n、去行尾空白 */
export function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
}

/** 提取文件扩展名（小写含点）；点必须出现在最后一个路径分隔符之后、且文件名不以点开头（隐藏文件如 ".env" 视为无扩展名） */
export function extractExt(path: string): string {
  const lastSep = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  const baseStart = lastSep + 1
  const dotIdx = path.lastIndexOf('.')
  if (path[baseStart] === '.' || dotIdx <= lastSep) return ''
  return path.slice(dotIdx).toLowerCase()
}

/** 计算内容 SHA-256 十六进制摘要（同库去重依据） */
export async function computeContentHash(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const source =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? new Uint8Array(data) // instanceof Buffer 也走这里；Uint8Array 已按实际长度，避免 .buffer 池化大数组混入脏字节
        : new Uint8Array(data)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
