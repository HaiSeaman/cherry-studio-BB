/**
 * 通用 provider 工具注入插件
 *
 * 查找 extensionRegistry 中声明的 toolFactory，
 * 将返回的 ToolFactoryPatch（tools / providerOptions）合并到 params。
 */

import { extensionRegistry } from '../../providers'
import type { ToolCapability } from '../../providers/types/toolFactory'
import { definePlugin } from '../'

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function deepMergeObjects(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...target }
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMergeObjects(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

function mergeProviderOptions(target?: Record<string, any>, source?: Record<string, any>): Record<string, any> {
  if (!target) return source ? { ...source } : {}
  if (!source) return { ...target }
  return deepMergeObjects(target, source)
}
export const providerToolPlugin = (capability: ToolCapability, config: Record<string, any> = {}) =>
  definePlugin({
    name: capability,
    enforce: 'pre',

    transformParams: async (params: any, context) => {
      const { providerId } = context

      const modelProvider =
        context.model && typeof context.model !== 'string' && 'provider' in context.model
          ? context.model.provider
          : undefined

      const resolved = await extensionRegistry.resolveToolCapability(providerId, capability, modelProvider)
      if (!resolved) return params

      const userConfig = config[providerId] ?? {}
      const patch = resolved.factory(resolved.provider)(userConfig)

      if (patch.tools) {
        params.tools = { ...params.tools, ...patch.tools }
      }
      if (patch.providerOptions) {
        params.providerOptions = mergeProviderOptions(params.providerOptions, patch.providerOptions)
      }

      return params
    }
  })
