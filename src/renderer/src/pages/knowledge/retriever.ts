/** 检索引擎的纯逻辑：中文分词、向量余弦、RRF 融合。 */

const ZH_RX = /[\u4e00-\u9fa5]/
const LATIN_RX = /[A-Za-z0-9]/

/**
 * 分词（供 BM25 关键词检索）：
 * - 中文：每个汉字成单字 token，并追加相邻两字的 bigram（解决 MiniSearch 空格分词对中文失效的问题）
 * - 英文/数字：按连续片段切词并小写
 */
export function tokenizeZh(text: string): string[] {
  const tokens: string[] = []
  let latin = ''

  const flushLatin = () => {
    if (latin) {
      tokens.push(latin.toLowerCase())
      latin = ''
    }
  }

  for (const ch of text) {
    if (ZH_RX.test(ch)) {
      flushLatin()
      tokens.push(ch)
    } else if (LATIN_RX.test(ch)) {
      latin += ch
    } else {
      flushLatin()
    }
  }
  flushLatin()

  // 相邻中文 bigram
  const zhChars = tokens.filter((t) => ZH_RX.test(t))
  for (let i = 0; i < zhChars.length - 1; i++) {
    tokens.push(zhChars[i] + zhChars[i + 1])
  }
  return tokens
}

/** 余弦相似度（维度不一致返回 0） */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * Reciprocal Rank Fusion 融合多路排名。
 * @param rankings 多路 chunkId 排名列表（分数/相关性从高到低）
 * @returns chunkId → 融合分数
 */
export function rrfScore(rankings: string[][], k = 60): Map<string, number> {
  const score = new Map<string, number>()
  for (const list of rankings) {
    list.forEach((id, rank) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1))
    })
  }
  return score
}
