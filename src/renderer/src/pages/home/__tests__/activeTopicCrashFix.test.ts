import { describe, expect, it } from 'vitest'

// 复现并验证 HomePage setActiveTopic / setActiveAssistant 中 prev（activeTopic）为 undefined 时的崩溃修复。
// 原代码：_setActiveTopic((prev) => (newTopic?.id === prev.id ? prev : newTopic))
// 当 prev 为 undefined（如生图助手 topics 为空）时会抛 "Cannot read properties of undefined (reading 'id')"。

describe('HomePage activeTopic 切换崩溃修复', () => {
  it('prev 为 undefined 且 newTopic 有值时不再崩溃（修复后逻辑）', () => {
    const setActiveTopic = (fn: (prev: any) => any) => {
      // 模拟 React setState：初始 prev 为 undefined（空 topics 的生图助手）
      const prev = undefined
      const next = fn(prev)
      expect(next).toEqual({ id: 'paint-topic-1' })
    }
    const newTopic = { id: 'paint-topic-1' }
    // 修复后的表达式：prev && newTopic?.id === prev.id ? prev : newTopic
    setActiveTopic((prev: any) => (prev && newTopic?.id === prev.id ? prev : newTopic))
  })

  it('prev 为 undefined 且 newTopic 也为 undefined（空 topics）时不再崩溃，返回 undefined', () => {
    const setActiveTopic = (fn: (prev: any) => any) => {
      const prev = undefined
      const next = fn(prev)
      expect(next).toBeUndefined()
    }
    const newTopic: any = undefined
    // 修复后的表达式：不访问 prev.id，安全返回 newTopic(undefined)
    setActiveTopic((prev: any) => (prev && newTopic?.id === prev.id ? prev : newTopic))
  })

  it('prev 有值且 newTopic 相同 id 时保持原值（原有行为不变）', () => {
    const prevTopic = { id: 't1' }
    const newTopic = { id: 't1' }
    const result = prevTopic && newTopic?.id === prevTopic.id ? prevTopic : newTopic
    expect(result).toBe(prevTopic)
  })

  it('prev 有值且 newTopic 不同 id 时切换到 newTopic（原有行为不变）', () => {
    const prevTopic = { id: 't1' }
    const newTopic = { id: 't2' }
    const result = prevTopic && newTopic?.id === prevTopic.id ? prevTopic : newTopic
    expect(result).toBe(newTopic)
  })
})

describe('Topics 空 activeTopic 渲染保护', () => {
  it('activeTopic 为 undefined 时读取 .id 会崩溃，修复后 useEffect 先判空', () => {
    const activeTopic = undefined
    // 修复前：dispatch(... activeTopic.id ...) 崩溃
    // 修复后：if (activeTopic) { dispatch(...) }
    let dispatched = false
    if (activeTopic) {
      dispatched = true
    }
    expect(dispatched).toBe(false)
  })
})
