import { loggerService } from '@logger'
import type { Model, ModelType } from '@renderer/types'
import type { ModalFuncProps } from 'antd'
import { isEqual } from 'lodash'

const logger = loggerService.withContext('Utils')

/**
 * 安全异步执行一个函数，带有错误捕获与日志保护。
 * @param {() => Promise<void>} fn 要执行的异步函数
 * @returns {Promise<void>}
 */
export const runAsyncFunction = async (fn: () => Promise<void>): Promise<void> => {
  try {
    await fn()
  } catch (error) {
    logger.error('Unhandled error in runAsyncFunction:', error as Error)
  }
}

/**
 * 检查 URL 是否是有效的代理 URL。
 * @param {string} url 代理 URL
 * @returns {boolean} 是否有效
 */
export const isValidProxyUrl = (url: string): boolean => {
  return url.includes('://')
}

/**
 * 显示确认模态框。
 * @param {ModalFuncProps} params 模态框参数
 * @returns {Promise<boolean>} 用户确认返回 true，取消返回 false
 */
export function modalConfirm(params: ModalFuncProps): Promise<boolean> {
  return new Promise((resolve) => {
    window.modal.confirm({
      centered: true,
      ...params,
      onOk: () => resolve(true),
      onCancel: () => resolve(false)
    })
  })
}

/**
 * 从npm readme中提取 npx mcp config
 * @param {string} readme readme字符串
 * @returns {Record<string, any> | null} mcp config sample
 */
export function getMcpConfigSampleFromReadme(readme: string): Record<string, any> | null {
  if (readme) {
    try {
      const regex = /"mcpServers"\s*:\s*({(?:[^{}]*|{(?:[^{}]*|{[^{}]*})*})*})/g
      for (const match of readme.matchAll(regex)) {
        let orgSample = JSON.parse(match[1])
        orgSample = orgSample[Object.keys(orgSample)[0] ?? '']
        if (orgSample.command === 'npx') {
          return orgSample
        }
      }
    } catch (e) {
      logger.error('getMcpConfigSampleFromReadme', e as Error)
    }
  }
  return null
}

/**
 * 判断模型是否为用户手动选择
 * @param {Model} model 模型对象
 * @param {ModelType} type 模型类型
 * @returns {boolean} 是否为用户手动选择
 */
export function isUserSelectedModelType(model: Model, type: ModelType): boolean | undefined {
  const t = model.capabilities?.find((t) => t.type === type)
  return t ? t.isUserSelected : undefined
}

export function uniqueObjectArray<T>(array: T[]): T[] {
  return array.filter((obj, index, self) => index === self.findIndex((t) => isEqual(t, obj)))
}

export * from './api'
export * from './collection'
export * from './dataLimit'
export * from './dom'
export * from './file'
export * from './image'
export * from './json'
export * from './match'
export * from './naming'
export * from './sort'
export * from './style'
