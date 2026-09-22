/** 知识库 TAB 的类型定义（与 pages/music、pages/notes 的 types.ts 模式一致） */

export interface KnowledgeBase {
  id: string
  name: string
  /** 建库时锁定的嵌入模型 id（禁止中途更换，检索必须用同一模型） */
  embedding_model_id: string
  embedding_provider_id: string
  /** 向量维度（建库时探测固化，写入时强校验） */
  embedding_dim: number
  /** 切块参数（仅对之后新添加的内容生效） */
  chunk_size: number
  chunk_overlap: number
  /** 每次检索返回的引用块数 */
  top_k: number
  /** 相关性及格线（余弦相似度 0~1）：低于此值的片段不参与结果；缺省时用 MIN_RELEVANCE 常量 */
  min_relevance?: number
  /** 重排模型（可选，查询时精排召回结果；不参与索引构建，可随时更换） */
  rerank_model_id?: string
  rerank_provider_id?: string
  created_at: string
  updated_at: string
}

export type KBFileStatus = 'pending' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'error'

export interface KBFile {
  id: string
  base_id: string
  name: string
  /** 原文件路径（仅本次会话内有效，用于读取内容） */
  path: string
  ext: string
  size: number
  /** 内容 SHA-256，同库去重依据 */
  content_hash: string
  status: KBFileStatus
  error_message?: string
  chunk_count: number
  created_at: string
  updated_at: string
}

/** 原文位置：txt/md 按行记录、PDF 按页、docx 按段落 */
export interface KBChunkSource {
  type: 'line' | 'page' | 'para'
  lineStart?: number
  lineEnd?: number
  page?: number
  paraStart?: number
  paraEnd?: number
}

export interface KBChunk {
  id: string
  base_id: string
  file_id: string
  /** 块在文件内的序号 */
  index: number
  text: string
  vector: Float32Array
  source: KBChunkSource
  created_at: string
}

/** 检索结果（引用溯源用） */
export interface KBHit {
  chunk: KBChunk
  file: KBFile
  /** 相关度：有重排时为重排模型分，否则为语义相似度（余弦，0~1） */
  score: number
}

/** 文件处理进度（Worker → UI） */
export interface KBProgress {
  fileId: string
  baseId: string
  status: KBFileStatus
  /** 当前阶段进度 0~1 */
  ratio: number
  error_message?: string
}
