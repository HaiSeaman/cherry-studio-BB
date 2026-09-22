import { isDedicatedImageGenerationModel } from '@renderer/config/models'
import { loggerService } from '@logger'
import type { KnowledgeItem, Model } from '@renderer/types'
import type { MessageBlock } from '@renderer/types/newMessage'
import { MessageBlockType } from '@renderer/types/newMessage'
import { createCitationBlock } from '@renderer/utils/messageUtils/create'

import { knowledgeAttachStore } from './knowledgeAttachStore'
import { rrfScore } from './retriever'
import { searchKnowledge } from './search'
import type { KBHit } from './types'

const logger = loggerService.withContext('pages/knowledge/knowledgeContext')

/** 单次请求注入的参考片段上限（防上下文膨胀） */
const MAX_REF_BLOCKS = 8

const REF_HEADER = '请优先依据以下参考资料回答，资料不足时请明确说明。参考资料间以空行分隔：'

export interface KnowledgeContext {
  /** 追加到 system 提示的参考资料文本（无命中时为空串） */
  text: string
  /** 命中的片段（供界面渲染引用气泡） */
  items: KnowledgeItem[]
}

/**
 * 把块挂到助手消息上所需的最小能力（结构化类型：调用方传真的 BlockManager 即可，
 * 测试也不必为了一个方法去造整个类）。
 */
export interface CitationSink {
  assistantMsgId: string
  blockManager: { handleBlockTransition: (block: MessageBlock, type: MessageBlockType) => Promise<void> }
}

/**
 * 聊天请求的知识库接缝：按本次提问检索 → 返回要追加到 system 提示的文本，
 * 并把命中片段挂成助手消息上的引用块（供界面展示来源）。
 * 只作用于本次请求：不写入消息内容，因此既不出现在用户气泡，也不会被当作上下文发给模型。
 * @param query 本次提问原文
 * @param model 本次请求使用的对话模型（专用图像生成模型不吃文本上下文，直接跳过）
 * @returns 要追加到 system 提示的参考资料文本（无命中时为空串）
 */
export async function attachKnowledgeContext(query: string, model: Model, sink: CitationSink): Promise<string> {
  if (isDedicatedImageGenerationModel(model)) return ''

  const knowledge = await buildKnowledgeContext(query)
  if (knowledge.items.length === 0) return ''

  const citationBlock = createCitationBlock(sink.assistantMsgId, { knowledge: knowledge.items })
  await sink.blockManager.handleBlockTransition(citationBlock, MessageBlockType.CITATION)

  return knowledge.text
}

/**
 * 按当前提问检索挂载的知识库，产出「参考资料」文本与命中片段。
 * 文本供调用方追加到 system 提示；片段供调用方渲染引用。
 * 只作用于本次请求：不写入消息内容，因此既不出现在用户气泡，也不会随历史消息反复发送。
 * @param query 本次提问原文（无挂载库或问题为空时返回空结果）
 */
export async function buildKnowledgeContext(query: string): Promise<KnowledgeContext> {
  const bases = knowledgeAttachStore.get()
  const question = query.trim()
  if (bases.length === 0 || !question) return { text: '', items: [] }

  // 各库分别检索（单库失败只跳过该库），保留库内相似度排序
  const rankings: KBHit[][] = []
  for (const base of bases) {
    try {
      const hits = await searchKnowledge(base, question)
      if (hits.length > 0) rankings.push(hits)
    } catch (error) {
      logger.warn(`知识库「${base.name}」检索失败，已跳过：`, error as Error)
    }
  }

  const picked = rankings.length > 0 ? mergeRankings(rankings) : []
  if (picked.length === 0) {
    window.toast.warning('知识库中未找到与本次提问相关的内容，本次未引用知识库')
    return { text: '', items: [] }
  }

  return {
    text: `${REF_HEADER}\n${picked.map((item) => `[${item.file}] ${item.content}`).join('\n\n')}`,
    items: picked
  }
}

/**
 * 跨库合并：按「名次」融合（RRF）而非相似度。
 * 各库可能绑定不同嵌入模型，分数不可比、名次可比；这样每个库都有机会出条目，
 * 而不是第一个库吃满配额。同一段内容在多个库/文件中重复出现时只保留一条。
 */
function mergeRankings(rankings: KBHit[][]): KnowledgeItem[] {
  const byChunkId = new Map<string, KBHit>()
  for (const hits of rankings) {
    for (const hit of hits) byChunkId.set(hit.chunk.id, hit)
  }

  const fused = [...rrfScore(rankings.map((hits) => hits.map((hit) => hit.chunk.id)))].sort((a, b) => b[1] - a[1])

  const picked: KnowledgeItem[] = []
  const seenContent = new Set<string>()
  for (const [chunkId] of fused) {
    const hit = byChunkId.get(chunkId)
    if (!hit) continue
    const content = hit.chunk.text.trim()
    if (!content || seenContent.has(content)) continue
    seenContent.add(content)
    picked.push({
      id: chunkId,
      file: hit.file.name,
      path: hit.file.path,
      content: hit.chunk.text,
      score: hit.score
    })
    if (picked.length >= MAX_REF_BLOCKS) break
  }
  return picked
}
