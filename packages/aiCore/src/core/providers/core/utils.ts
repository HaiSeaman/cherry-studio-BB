/**
 * Provider 工具函数和错误类
 * 合并自 utils.ts 和 errors.ts
 */

// ==================== 错误类 ====================

/**
 * Provider 创建错误
 * 当创建 provider 实例失败时抛出
 */
export class ProviderCreationError extends Error {
  constructor(
    message: string,
    public providerId: string,
    public cause: Error
  ) {
    super(message)
    this.name = 'ProviderCreationError'
  }
}
