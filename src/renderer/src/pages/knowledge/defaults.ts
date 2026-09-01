/**
 * 向量模型 → 推荐默认参数（切块/重叠/TopK）。
 * 说明：embedding 模型本身没有"切块大小"概念，这里按"模型输入 token 上限 + 经验推荐"给出默认：
 * - 短输入（≤512/8192 上限的常见中英文模型）：512 切块 + 10~15% 重叠，避免噪声
 * - 长上下文（qwen/gte/jina/voyage 等 32k+）：1024 切块 + 20% 重叠，适合长文档
 * 用户可在知识库设置里覆盖；未手动设置时建库自动套用本表。
 */

export interface KBDefaults {
  chunk_size: number
  chunk_overlap: number
  top_k: number
}

/** 通用兜底默认（与既有默认一致，偏长文档） */
export const FALLBACK_DEFAULTS: KBDefaults = { chunk_size: 1024, chunk_overlap: 200, top_k: 6 }

/** 短输入模型特征子串（bge/e5/text-embedding/mistral-embed）→ 512 切块 */
const SHORT_CONTEXT_PATTERNS = [/bge/i, /e5/i, /text-embedding/i, /mistral-embed/i]

/** 长上下文模型特征子串 → 1024 切块 */
const LONG_CONTEXT_PATTERNS = [/qwen/i, /gte/i, /jina/i, /voyage/i, /m3/i]

export function getModelDefaults(modelId: string): KBDefaults {
  const id = modelId.trim()
  if (SHORT_CONTEXT_PATTERNS.some((p) => p.test(id))) {
    return { chunk_size: 512, chunk_overlap: 80, top_k: 6 }
  }
  if (LONG_CONTEXT_PATTERNS.some((p) => p.test(id))) {
    return { chunk_size: 1024, chunk_overlap: 200, top_k: 6 }
  }
  return { ...FALLBACK_DEFAULTS }
}
