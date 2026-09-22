import type { KBChunkSource } from './types'

export interface ChunkResult {
  index: number
  text: string
  source: KBChunkSource
}

const ENGLISH_RX = /[A-Za-z0-9]/
const SPLIT_RX = /[。！？；，、\s)\]}」』》]/
const HEADING_RX = /^(#{1,6})\s+(.+?)\s*$/

/**
 * 逐行计算「标题层级路径」，用作块的上下文前缀（Anthropic Contextual Retrieval 的零成本版）：
 * 借用文档自身的标题结构，让脱离上下文的片段也能被检索到（例如只有"保修期是两年"的段落，
 * 带上"手册 > 保修"才好被 BM25 与向量同时命中）。
 * 规则：标题行先弹出同级/更深的层级并取当前（父级）路径，再把自己入栈——
 * 于是标题块只带父级路径（不重复自己），正文块带完整层级。
 */
function headingPathsOf(lines: string[]): string[] {
  const stack: { level: number; text: string }[] = []
  const paths: string[] = []

  for (const line of lines) {
    const matched = line.match(HEADING_RX)
    if (matched) {
      const level = matched[1].length
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
    }
    paths.push(stack.map((h) => h.text).join(' > '))
    if (matched) stack.push({ level: matched[1].length, text: matched[2] })
  }

  return paths
}

/**
 * 粗估 token 数（不引重型 tokenizer）：
 * 中文/标点/空白按 1 字符 ≈ 1 token，英文数字按 4 字符 ≈ 1 token（向上取整）。
 * 仅用于切块控制，偏保守即可。
 */
export function estimateTokens(text: string): number {
  let t = 0
  for (const ch of text) {
    t += ENGLISH_RX.test(ch) ? 0.25 : 1
  }
  return Math.ceil(t)
}

/**
 * 把文本切成不超过 chunkSize(token) 的若干块，块间按 overlap(token) 重叠。
 * - kind='line'：source 记录真实行号（txt/md 等）
 * - kind='flow'：source 用 para 序号（pdf/docx/xlsx，无真实行号）
 * 单行若本身超过 chunkSize，会在该行内按标点二次细分，绝不产生超限的正文块。
 * 每块文本前会加上所在标题层级路径（见 headingPathsOf），用于提升检索命中率；
 * 该前缀最多 6 级标题，不参与 chunkSize 预算（预算按正文行累计）。
 */
export function chunkText(text: string, kind: 'line' | 'flow', chunkSize: number, overlap: number): ChunkResult[] {
  if (!text || text.trim() === '') return []

  const lines = text.split('\n')
  const headingPaths = headingPathsOf(lines)
  const chunks: ChunkResult[] = []
  let idx = 0
  let i = 0
  const n = lines.length

  /** 给块正文加上起始行所处的标题路径（无标题时原样返回） */
  const withContext = (body: string, startLine: number): string =>
    headingPaths[startLine] ? `${headingPaths[startLine]}\n${body}` : body

  while (i < n) {
    // 贪心累积 [i, end) 的行，使其 token 尽量接近 chunkSize 且不超
    const buffer: string[] = []
    let tokens = 0
    let end = i
    while (end < n) {
      const lt = estimateTokens(lines[end])
      if (buffer.length > 0 && tokens + lt > chunkSize) break
      buffer.push(lines[end])
      tokens += lt
      end++
      if (tokens >= chunkSize) break
    }

    const joined = buffer.join('\n')
    const jt = estimateTokens(joined)

    if (buffer.length === 1 && jt > chunkSize) {
      // 单行超长：在该行内部细分（每片一个块，行号相同）
      const lineNo = i + 1
      for (const piece of splitLongLine(buffer[0], chunkSize)) {
        chunks.push({
          index: idx++,
          text: withContext(piece, i),
          source:
            kind === 'line'
              ? { type: 'line', lineStart: lineNo, lineEnd: lineNo }
              : { type: 'para', paraStart: lineNo, paraEnd: lineNo }
        })
      }
    } else {
      const source: KBChunkSource =
        kind === 'line'
          ? { type: 'line', lineStart: i + 1, lineEnd: end }
          : { type: 'para', paraStart: i + 1, paraEnd: end }
      chunks.push({ index: idx++, text: withContext(joined, i), source })
    }

    if (end >= n) break

    // 计算下一块的起点：从 end 往前回退 overlap token 的行（至少回退 1 行）
    let ovTokens = 0
    let ovStart = end
    if (overlap > 0 && end > 0) {
      ovStart = end - 1
      ovTokens = estimateTokens(lines[ovStart])
      while (ovStart > 0 && ovTokens < overlap) {
        const lt = estimateTokens(lines[ovStart - 1])
        if (ovTokens + lt > overlap) break
        ovTokens += lt
        ovStart--
      }
    }
    i = ovStart
  }

  return chunks
}

/** 把超长单行按标点/空白切成若干 ≤ chunkSize 的片（保留原始内容不漏字） */
function splitLongLine(line: string, chunkSize: number): string[] {
  if (estimateTokens(line) <= chunkSize) return [line]
  const pieces: string[] = []
  let start = 0
  while (start < line.length) {
    // 向前累积字符直到超限
    let end = start
    let t = 0
    while (end < line.length) {
      t += ENGLISH_RX.test(line[end]) ? 0.25 : 1
      if (t > chunkSize) break
      end++
    }
    if (end <= start) end = start + 1
    // 从末端回退到最近的分隔符，让断点更自然
    let cut = end
    for (let k = end - 1; k > start; k--) {
      if (SPLIT_RX.test(line[k])) {
        cut = k + 1
        break
      }
    }
    if (cut <= start) cut = end
    pieces.push(line.slice(start, cut))
    if (cut <= start) break // 死循环保护
    start = cut
  }
  return pieces.filter((p) => p !== '')
}
