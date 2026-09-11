import type { Assistant, Topic } from '@renderer/types'
import { describe, expect, it } from 'vitest'

import assistantsReducer, { updateTopic } from '../assistants'

const makeTopic = (id: string, name = id): Topic =>
  ({
    id,
    name,
    assistantId: 'assistant-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: []
  }) as Topic

type AssistantsState = NonNullable<Parameters<typeof assistantsReducer>[0]>

const makeState = (): AssistantsState => ({
  defaultAssistant: {} as Assistant,
  assistants: [
    {
      id: 'assistant-1',
      name: '助手一',
      topics: [makeTopic('topic-a', '话题 A'), makeTopic('topic-b', '话题 B')]
    },
    {
      id: 'assistant-2',
      name: '助手二',
      topics: [makeTopic('topic-c', '话题 C')]
    }
  ] as Assistant[],
  tagsOrder: [],
  collapsedTags: {}
})

describe('assistants reducer · updateTopic', () => {
  it('只更新命中的那个话题，其它话题保持不变', () => {
    const state = makeState()
    const next = assistantsReducer(
      state,
      updateTopic({ assistantId: 'assistant-1', topic: { ...makeTopic('topic-a'), name: '新名字' } })
    )

    const assistant1 = next.assistants.find((a) => a.id === 'assistant-1')!
    expect(assistant1.topics.map((t) => t.name)).toEqual(['新名字', '话题 B'])

    // 另一个助手完全不受影响（且引用未变）
    expect(next.assistants[1]).toBe(state.assistants[1])
  })

  it('不就地改写 action.payload（reducer 保持纯函数）', () => {
    const state = makeState()
    const payloadTopic = { ...makeTopic('topic-a'), updatedAt: '2026-01-01T00:00:00.000Z' }
    const action = updateTopic({ assistantId: 'assistant-1', topic: payloadTopic })

    assistantsReducer(state, action)

    expect(payloadTopic.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(Object.isFrozen(payloadTopic)).toBe(false)
  })

  it('命中话题写入新的 updatedAt（用于话题列表排序）', () => {
    const state = makeState()
    const next = assistantsReducer(state, updateTopic({ assistantId: 'assistant-1', topic: makeTopic('topic-a') }))

    const updated = next.assistants[0].topics.find((t) => t.id === 'topic-a')!
    expect(updated.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('维持「话题不携带消息」的不变量（消息存在 messages slice 里）', () => {
    const state = makeState()
    state.assistants[0].topics[1].messages = [{ id: 'm1' }] as never

    const next = assistantsReducer(state, updateTopic({ assistantId: 'assistant-1', topic: makeTopic('topic-a') }))

    expect(next.assistants[0].topics.every((t) => t.messages.length === 0)).toBe(true)
  })
})
