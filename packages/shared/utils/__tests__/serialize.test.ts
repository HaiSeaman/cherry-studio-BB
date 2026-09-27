import { describe, expect, it, vi } from 'vitest'

// serialize.ts 从 '@types' 引入 isSerializable，但 shared 包的 vitest 配置未提供该别名。
// 这里用桩替代：恒返回 false 以强制走宽容序列化（tryLenientSerialize）分支。
vi.mock('@types', () => ({
  isSerializable: () => false
}))

import { safeSerialize } from '../serialize'

describe('safeSerialize (lenient path)', () => {
  it('should preserve shared (non-circular) references instead of marking them circular', () => {
    const shared = { value: 1 }
    const result = safeSerialize({ a: shared, b: shared })
    expect(result).not.toBeNull()
    expect(result).not.toContain('[Circular]')
    expect(JSON.parse(result as string)).toEqual({ a: { value: 1 }, b: { value: 1 } })
  })

  it('should still detect true circular references', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    const result = safeSerialize(obj)
    expect(result).toContain('[Circular]')
  })

  it('should detect circular references in arrays', () => {
    const arr: unknown[] = [1, 2]
    arr.push(arr)
    const result = safeSerialize(arr)
    expect(result).toContain('[Circular]')
  })

  it('should handle special types consistently', () => {
    const result = safeSerialize({
      date: new Date('2020-01-01T00:00:00.000Z'),
      fn: function named() {},
      undef: undefined
    })
    expect(result).toContain('2020-01-01T00:00:00.000Z')
    expect(result).toContain('[Function: named]')
    expect(result).toContain('[undefined]')
  })
})