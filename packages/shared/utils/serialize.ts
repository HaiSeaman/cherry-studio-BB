import { isSerializable } from '@types'

/**
 * 安全地序列化一个值为 JSON 字符串。
 * 基于 `Serializable` 类型和 `isSerializable` 运行时检查。
 *
 * @param value 要序列化的值
 * @param options 配置选项
 * @returns 序列化后的字符串，或 null（如果失败且未抛错）
 */
export function safeSerialize(
  value: unknown,
  options: {
    /**
     * 处理不可序列化值的方式：
     * - 'error': 抛出错误
     * - 'omit': 尝试过滤掉非法字段（⚠️ 不支持深度修复，仅顶层判断）
     * - 'serialize': 尝试安全转换（如 Date → ISO 字符串）
     */
    onError?: 'error' | 'omit' | 'serialize'

    /**
     * 是否美化输出
     * @default true
     */
    pretty?: boolean
  } = {}
): string | null {
  const { onError = 'serialize', pretty = true } = options
  const space = pretty ? 2 : undefined

  // 1. 如果本身就是合法的 Serializable 值，直接序列化
  if (isSerializable(value)) {
    try {
      return JSON.stringify(value, null, space)
    } catch (err) {
      // 理论上不会发生，但以防万一（比如极深嵌套栈溢出）
      if (onError === 'error') {
        throw new Error(`Failed to stringify serializable value: ${err instanceof Error ? err.message : err}`)
      }
      return null
    }
  }

  // 2. 不是可序列化的，根据策略处理
  switch (onError) {
    case 'error':
      throw new TypeError('Value is not serializable and cannot be safely serialized.')

    case 'omit':
      // 注意：这里不能“修复”对象，只能返回 null 表示跳过
      return null

    case 'serialize': {
      // 宽容模式：尝试做一些安全转换
      return tryLenientSerialize(value, space)
    }
  }
}

/**
 * 尽力而为地序列化一个值，即使它不符合 Serializable。
 * 适用于调试、日志等非关键场景。
 */
function tryLenientSerialize(value: unknown, space?: string | number): string {
  // 用「当前递归路径」栈做循环检测：仅当对象出现在自身的祖先链上时才判为循环，
  // 这样 `{ a: shared, b: shared }` 这类共享引用的 DAG 不会被误判为循环引用。
  const ancestors: unknown[] = []

  const serialized = JSON.stringify(
    value,
    function (this: unknown, _key: string, val: any) {
      // 特殊类型优先转换（转换结果不再是对象，无需参与循环检测）
      if (val instanceof Date) return val.toISOString()
      if (val instanceof RegExp) return `{RegExp: "${val.toString()}"}`
      if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`
      if (typeof val === 'symbol') return `Symbol(${String(val.description)})`
      if (val instanceof Map) return Object.fromEntries(val.entries())
      if (val instanceof Set) return Array.from(val)
      if (val === undefined) return '[undefined]'

      if (typeof val === 'object' && val !== null) {
        // `this` 是 val 的直接父对象；把栈收缩回当前递归路径
        while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
          ancestors.pop()
        }
        if (ancestors.includes(val)) {
          return '[Circular]'
        }
        ancestors.push(val)
      }

      return val
    },
    space
  )

  return serialized
}
