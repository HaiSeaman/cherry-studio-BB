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
 * 语义相似度及格线的缺省值：低于此值的片段不进入候选。
 * 目的：问题与知识库无关时不硬塞资料——无关片段会干扰模型，还会诱发编造引用。
 * 各库可在设置里覆盖（KnowledgeBase.min_relevance），故判定阈值请统一走 relevanceThreshold()。
 */
export const MIN_RELEVANCE = 0.3

/** 取某个库实际生效的相关性阈值（库未设置时用缺省值）——唯一入口，避免各处各写一份 */
export const relevanceThreshold = (base: KnowledgeBase): number => base.min_relevance ?? MIN_RELEVANCE

/**
 * 重排候选池大小：重排模型负责精排，候选给得越多越准（Anthropic 实验用的候选池是 150 条）。
 * 代价是每次提问都要把这些候选文本发给重排服务，条数越多越慢越贵——50 是个人知识库的折中。
 */
// ponytail: 固定 50。若库很大且愿意为质量付费，可再做成每库可调。
const RERANK_CANDIDATES = 50

/**
 * 混合检索：BM25 关键词（MiniSearch + 中文 bigram 分词） 与 向量语义（余弦）双路，
 * 经 RRF 融合取 TopK，附原文来源文件。
 * 向量路可用时以余弦相似度作相关性门槛（阈值取库配置 min_relevance，缺省用 MIN_RELEVANCE），两路候选都须过线。
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

  const minRelevance = relevanceThreshold(base)
  // 配了重排模型则放大候选池（精排需要更大的选择面）；否则只取 TopK×2，不为融合多花算力
  const rerankModel = makeRerankModel(base)
  const pool = rerankModel ? RERANK_CANDIDATES : topK * 2

  // 向量路先算：余弦相似度既用于向量排序，也是「是否与提问相关」的唯一门槛
  // （失败时降级为仅关键词，避免整体中断）
  let cosById: Map<string, number> | null = null
  try {
    const ai = new AiProvider(makeModel(base))
    const [qv] = await ai.embedTexts([query])
    assertDimensions([qv], base.embedding_dim, base.embedding_model_id)
    cosById = new Map(chunks.map((c) => [c.id, cosine(qv, c.vector)]))
  } catch (error) {
    logger.warn('知识库向量检索失败，降级为关键词检索：', error as Error)
  }

  const cosOf = (id: string): number => cosById?.get(id) ?? 0

  // 相关性过滤：向量路不可用时不做语义门槛，否则词面命中的片段会被全部误杀
  const relevant = cosById ? chunks.filter((c) => cosOf(c.id) >= minRelevance) : chunks
  if (relevant.length === 0) return []
  const relevantIds = new Set(relevant.map((c) => c.id))

  // 路 1：关键词（BM25）
  const kwIds = ms
    .search(query, { prefix: true })
    .map((r) => r.id)
    .filter((id) => relevantIds.has(id))
    .slice(0, pool)

  // 路 2：向量语义（按余弦降序取候选池）
  const vecIds = cosById
    ? relevant
        .map((c) => c.id)
        .sort((a, b) => cosOf(b) - cosOf(a))
        .slice(0, pool)
    : []

  // 融合
  const fused = rrfScore([kwIds, vecIds])
  const candidates = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, pool)
  if (candidates.length === 0) return []

  // 组装命中（附来源文件）
  const chunkById = new Map(chunks.map((c) => [c.id, c]))
  const byScoreDesc = (hits: KBHit[]): KBHit[] => hits.slice().sort((a, b) => b.score - a.score)
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
          return byScoreDesc(await assemble(reranked))
        }
      }
    } catch (error) {
      // 重排失败不阻断检索，降级为融合结果（与向量路降级策略一致）
      logger.warn('知识库重排失败，降级为 RRF 融合结果：', error as Error)
    }
  }

  // 无重排：取融合后的 TopK，得分改用语义相似度（可展示，也便于人工判断相关性）
  return byScoreDesc(await assemble(candidates.slice(0, topK).map(([id]) => [id, cosOf(id)] as [string, number])))
}
