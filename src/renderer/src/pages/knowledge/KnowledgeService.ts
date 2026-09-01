import { db } from '@renderer/databases'
import type { Model } from '@renderer/types'

import AiProvider from '../../aiCore/AiProvider'
import { chunkText } from './chunker'
import { getModelDefaults } from './defaults'
import { assertDimensions, batchTexts } from './embedding'
import { computeContentHash, extractExt, extractText, SUPPORTED_EXTS } from './parser'
import { invalidateIndex } from './search'
import type { KBFile, KBFileStatus, KBProgress, KnowledgeBase } from './types'

const EMBED_BATCH_SIZE = 32

const now = (): string => new Date().toISOString()

/** 依据库锁定信息构造嵌入 Model（供 AiProvider 批量嵌入与检索向量化共用） */
export function makeModel(base: KnowledgeBase): Model {
  return {
    id: base.embedding_model_id,
    provider: base.embedding_provider_id,
    name: base.embedding_model_id,
    group: 'Embedding'
  }
}

/**
 * 知识库入库流水线（状态机：pending→parsing→chunking→embedding→ready/error）。
 * 文件读取依赖主进程 window.api，故在主线程异步执行（分批 await 让出事件循环），
 * 进度经 onProgress 回调回报。内容去重依据原始字节 SHA-256。
 */
export const KnowledgeService = {
  /** 创建知识库：按所选模型的推荐默认参数初始化，并探测固化向量维度 */
  async createBase(name: string, model: Model): Promise<KnowledgeBase> {
    const ai = new AiProvider(model)
    const dim = await ai.getEmbeddingDimensions(model)
    const defaults = getModelDefaults(model.id)
    const base: KnowledgeBase = {
      id: crypto.randomUUID(),
      name,
      embedding_model_id: model.id,
      embedding_provider_id: model.provider,
      embedding_dim: dim,
      chunk_size: defaults.chunk_size,
      chunk_overlap: defaults.chunk_overlap,
      top_k: defaults.top_k,
      created_at: now(),
      updated_at: now()
    }
    await db.kb_bases.add(base)
    return base
  },

  /** 更新库的检索/切块参数（只影响之后新添加的文件） */
  async updateBaseSettings(
    baseId: string,
    patch: Partial<Pick<KnowledgeBase, 'chunk_size' | 'chunk_overlap' | 'top_k'>>
  ): Promise<void> {
    await db.kb_bases.update(baseId, { ...patch, updated_at: now() })
    invalidateIndex(baseId)
  },

  listBases(): Promise<KnowledgeBase[]> {
    return db.kb_bases.toArray()
  },

  listFiles(baseId: string): Promise<KBFile[]> {
    return db.kb_files.where('base_id').equals(baseId).toArray()
  },

  /**
   * 添加并处理一个文件（完整跑完会等待处理结束）。
   * @returns 'duplicate' 表示同库已有相同内容，未重复入库
   */
  async addFile(
    base: KnowledgeBase,
    path: string,
    onProgress?: (p: KBProgress) => void
  ): Promise<{ status: 'added' | 'duplicate'; file?: KBFile }> {
    const buffer = await window.api.fs.read(path)
    const content_hash = await computeContentHash(new Uint8Array(buffer))

    // 内容去重
    const dup = await db.kb_files
      .where('base_id')
      .equals(base.id)
      .and((f) => f.content_hash === content_hash)
      .first()
    if (dup) {
      return { status: 'duplicate' }
    }

    const file: KBFile = {
      id: crypto.randomUUID(),
      base_id: base.id,
      name: path.split(/[\\/]/).pop() ?? path,
      path,
      // 扩展名取最后一个点后的部分（点在文件名起始位之前时视为无扩展名，如 "README"）
      ext: extractExt(path),
      size: buffer.byteLength,
      content_hash,
      status: 'pending',
      chunk_count: 0,
      created_at: now(),
      updated_at: now()
    }
    await db.kb_files.add(file)

    try {
      await this.processFile(base, file, onProgress)
      return { status: 'added', file: (await db.kb_files.get(file.id)) ?? file }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.kb_files.update(file.id, { status: 'error', error_message: message, updated_at: now() })
      onProgress?.({ fileId: file.id, baseId: base.id, status: 'error', ratio: 1, error_message: message })
      return { status: 'added', file: (await db.kb_files.get(file.id)) ?? file }
    }
  },

  /** 导入整个文件夹：递归扫描支持的扩展名，逐个入库，重复内容自动跳过 */
  async addFolder(
    base: KnowledgeBase,
    folderPath: string,
    onProgress?: (p: KBProgress) => void
  ): Promise<{ added: number; skipped: number; failed: number; truncated: boolean }> {
    const res = await window.api.fs.scanDir(folderPath, [...SUPPORTED_EXTS] as string[], true)
    if (!res.success) {
      throw new Error(res.error ?? '扫描文件夹失败')
    }
    let added = 0
    let skipped = 0
    let failed = 0
    for (const f of res.files) {
      try {
        const r = await this.addFile(base, f.filePath, onProgress)
        if (r.status === 'duplicate') skipped += 1
        else added += 1
      } catch {
        failed += 1
      }
    }
    return { added, skipped, failed, truncated: res.truncated }
  },

  async processFile(base: KnowledgeBase, file: KBFile, onProgress?: (p: KBProgress) => void): Promise<void> {
    const setStatus = async (status: KBFileStatus, error_message?: string) => {
      await db.kb_files.update(file.id, { status, error_message, updated_at: now() })
      onProgress?.({ fileId: file.id, baseId: base.id, status, ratio: ratioOf(status), error_message })
    }

    await setStatus('parsing')
    const { text, kind } = await extractText(file.path, file.ext)

    await setStatus('chunking')
    const chunks = chunkText(text, kind, base.chunk_size, base.chunk_overlap)

    await setStatus('embedding')
    const ai = new AiProvider(makeModel(base))
    const vectors: Float32Array[] = []
    const batches = batchTexts(
      chunks.map((c) => c.text),
      EMBED_BATCH_SIZE
    )
    for (let b = 0; b < batches.length; b++) {
      const vs = await ai.embedTexts(batches[b])
      assertDimensions(vs, base.embedding_dim, base.embedding_model_id)
      vectors.push(...vs)
      onProgress?.({
        fileId: file.id,
        baseId: base.id,
        status: 'embedding',
        ratio: 0.5 + (0.5 * (b + 1)) / Math.max(batches.length, 1)
      })
    }

    // 落库（事务保证 chunk 与文件状态原子一致）
    await db.transaction('rw', db.kb_chunks, db.kb_files, async () => {
      // 处理期间文件已被删除（用户点了删除）则放弃落库，避免产生无主 chunk
      if (!(await db.kb_files.get(file.id))) return
      const createdAt = now()
      for (let i = 0; i < chunks.length; i++) {
        await db.kb_chunks.add({
          id: crypto.randomUUID(),
          base_id: base.id,
          file_id: file.id,
          index: chunks[i].index,
          text: chunks[i].text,
          vector: vectors[i],
          source: chunks[i].source,
          created_at: createdAt
        })
      }
      await db.kb_files.update(file.id, { status: 'ready', chunk_count: chunks.length, updated_at: now() })
    })

    onProgress?.({ fileId: file.id, baseId: base.id, status: 'ready', ratio: 1 })
    invalidateIndex(base.id)
  },

  /** 删除文件并级联清掉其全部 chunk */
  async deleteFile(fileId: string): Promise<void> {
    const file = await db.kb_files.get(fileId)
    await db.transaction('rw', db.kb_files, db.kb_chunks, async () => {
      await db.kb_chunks.where('file_id').equals(fileId).delete()
      await db.kb_files.delete(fileId)
    })
    if (file) invalidateIndex(file.base_id)
  },

  /** 删除知识库并级联清掉其全部文件与 chunk */
  async deleteBase(baseId: string): Promise<void> {
    await db.transaction('rw', db.kb_bases, db.kb_files, db.kb_chunks, async () => {
      await db.kb_chunks.where('base_id').equals(baseId).delete()
      await db.kb_files.where('base_id').equals(baseId).delete()
      await db.kb_bases.delete(baseId)
    })
    invalidateIndex(baseId)
  }
}

function ratioOf(status: KBFileStatus): number {
  switch (status) {
    case 'parsing':
      return 0.2
    case 'chunking':
      return 0.35
    case 'embedding':
      return 0.5
    default:
      return 0
  }
}
