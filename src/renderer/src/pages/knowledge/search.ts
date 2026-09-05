import { loggerService } from '@logger'
import { db } from '@renderer/databases'
import MiniSearch from 'minisearch'

import AiProvider from '../../aiCore/AiProvider'
import { assertDimensions } from './embedding'
import { makeModel, makeRerankModel } from './KnowledgeService'
import { cosine, rrfScore, tokenizeZh } from './retriever'
import type { KBChunk, KBFile, KBHit, KnowledgeBase } from './types'

const logger = loggerService.withContext('pages/knowledge/search')

// 每个库一份内存索引/块缓存（文件变更后经 invalidateIndex 失效）。
// ponytail: 单库级缓存，5 万块以内够用；若规模暴涨再按需分批加载。
const indexCache = new Map<string, MiniSearch>()
const chunkCache = new Map<string, KBChunk[]>()

/** 文件库数据变更（入库/删除/重建）后调用，使检索缓存失效 */
export function invalidateIndex(baseId: string): void {
  indexCache.delete(baseId)
  chunkCache.delete(baseId)
}

async function ensureIndex(base: KnowledgeBase): Promise<{ ms: MiniSearch; chunks: KBChunk[] }> {
  const cachedMs = indexCache.get(base.id)
  const cachedChunks = chunkCache.get(base.id)
  if (cachedMs && cachedChunks) return { ms: cachedMs, chunks: cachedChunks }

  const chunks = await db.kb_chunks.where('base_id').equals(base.id).toArray()
  const ms = new MiniSearch<{ id: string; text: string }>({
    fields: ['text'],
    storeFields: [],
    tokenize: tokenizeZh,
    processTerm: (t: string) => t
  })
  ms.addAll(chunks.map((c) => ({ id: c.id, text: c.text })))
  indexCache.set(base.id, ms)
  chunkCache.set(base.id, chunks)
  return { ms, chunks }
}

/**
 * 混合检索：BM25 关键词（MiniSearch + 中文 bigram 分词） 与 向量语义（余弦）双路，
 * 经 RRF 融合取 TopK，附原文来源文件。
 * @param base 知识库
 * @param query 问题文本
 * @param topK 返回条数
 */
export async function searchKnowledge(
  base: KnowledgeBase,
  query: string,
  topK: number = base.top_k ?? 6
): Promise<KBHit[]> {
  if (!query.trim()) return []
  const { ms, chunks } = await ensureIndex(base)
  if (chunks.length === 0) return []

  // 路 1：关键词（BM25）
  const kwIds = ms
    .search(query, { prefix: true })
    .slice(0, topK * 2)
    .map((r) => r.id)

  // 路 2：向量语义（失败时降级为仅关键词，避免整体中断）
  let vecIds: string[] = []
  try {
    const ai = new AiProvider(makeModel(base))
    const [qv] = await ai.embedTexts([query])
    assertDimensions([qv], base.embedding_dim, base.embedding_model_id)
    vecIds = chunks
      .map((c) => ({ id: c.id, s: cosine(qv, c.vector) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, topK * 2)
      .map((x) => x.id)
  } catch (error) {
    logger.warn('知识库向量检索失败，降级为关键词检索：', error as Error)
  }

  // 融合（候选池放大 2 倍，为重排预留精排空间）
  const fused = rrfScore([kwIds, vecIds])
  const candidates = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK * 2)
  if (candidates.length === 0) return []

  // 组装命中（附来源文件）
  const chunkById = new Map(chunks.map((c) => [c.id, c]))
  const assemble = async (ranked: [string, number][]): Promise<KBHit[]> => {
    const fileIds = [...new Set(ranked.map(([id]) => chunkById.get(id)!.file_id))]
    const files = (await db.kb_files.bulkGet(fileIds)).filter((f): f is KBFile => Boolean(f))
    const fileById = new Map(files.map((f) => [f.id, f]))
    return ranked
      .map(([id, score]) => {
        const chunk = chunkById.get(id)
        if (!chunk) return null
        const file = fileById.get(chunk.file_id)
        if (!file) return null
        return { chunk, file, score }
      })
      .filter((h): h is KBHit => h !== null)
  }

  // 可选重排（Rerank）：配置了重排模型时，用交叉编码模型对候选精排（失败降级为 RRF 结果）
  const rerankModel = makeRerankModel(base)
  if (rerankModel) {
    try {
      const ai = new AiProvider(rerankModel)
      const docs = candidates.map(([id]) => chunkById.get(id)?.text ?? '')
      const ranked = await ai.rerankDocuments(query, docs, topK)
      if (ranked.length > 0) {
        const reranked: [string, number][] = ranked
          .map((r) => {
            const candidateId = candidates[r.index]?.[0]
            return candidateId ? ([candidateId, r.score] as [string, number]) : null
          })
          .filter((x): x is [string, number] => x !== null)
        if (reranked.length > 0) {
          return await assemble(reranked)
        }
      }
    } catch (error) {
      // 重排失败不阻断检索，降级为融合结果（与向量路降级策略一致）
      logger.warn('知识库重排失败，降级为 RRF 融合结果：', error as Error)
    }
  }

  return await assemble(candidates.slice(0, topK))
}
