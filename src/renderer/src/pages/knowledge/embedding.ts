/**
 * 嵌入相关的纯逻辑（批切分、维度校验、数组转换）。
 * 真正调用远端/本地 embedding 的能力复用在 AiProvider.embedTexts（aiCore）。
 */

/** 把文本切成不超过 batchSize 的多个批次，避免单次请求过大 */
export function batchTexts(texts: string[], batchSize: number): string[][] {
  if (batchSize <= 0) throw new Error('batchSize 必须为正数')
  if (texts.length === 0) return []
  const batches: string[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize))
  }
  return batches
}

/** number[][] → Float32Array[]（存 IndexedDB 用，省一半内存） */
export function toFloat32Array(values: number[][]): Float32Array[] {
  return values.map((v) => Float32Array.from(v))
}

/**
 * 维度强校验：远端返回的每个向量维度必须等于建库时固化的 embedding_dim。
 * 不一致说明远端模型变更或配置错误，禁止静默写入（否则余弦相似度会算错）。
 */
export function assertDimensions(vectors: Float32Array[], expectedDim: number, modelLabel: string): void {
  for (const v of vectors) {
    if (v.length !== expectedDim) {
      throw new Error(
        `向量维度不一致：期望 ${expectedDim}（库锁定的模型 ${modelLabel}），实际返回 ${v.length}。` +
          '请检查是否更换了 embedding 模型。'
      )
    }
  }
}
