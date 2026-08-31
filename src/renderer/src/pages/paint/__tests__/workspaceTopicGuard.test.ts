import { resolveLiveAssistant, resolveValidTopicId } from '@renderer/hooks/useAssistant'
import assistantsReducer, { addTopic, type AssistantsState, removeTopic } from '@renderer/store/assistants'
import type { Assistant, Topic } from '@renderer/types'
import { describe, expect, it } from 'vitest'

/**
 * 回归测试：生图/视频助手「新建会话后内容区空白、生成结果写进孤儿话题」。
 *
 * 根因：父组件（HomePage）传下来的 assistant 是挂载时的 useState 快照，addTopic / removeTopic
 * 经 Immer 会换掉 store 中的对象引用，快照的 topics 却停在挂载那一刻。Workspace 用它做
 * 「话题是否属于本助手」判定时，新建的话题一律被判为不属于本助手 → validTopicId = null
 * → 内容区空态、输入区每次生成都再建一个孤儿话题（图片照常落盘，所以用户看得见文件、看不见会话）。
 *
 * 本文件锁定两条修复约束：
 *   ① HomePage 只存 assistantId，assistant 从 Redux 派生；
 *   ② Workspace 内部再用 useLiveAssistant 取实时助手做归属校验（防御任何其他快照来源）。
 */

const ASSISTANT_ID = 'paint-assistant'

const makeTopic = (id: string): Topic =>
  ({
    id,
    assistantId: ASSISTANT_ID,
    name: `会话-${id}`,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    messages: []
  }) as Topic

const makeAssistant = (topics: Topic[]): Assistant =>
  ({ id: ASSISTANT_ID, name: '灵感生图', type: 'image_gen', emoji: '🎨', topics }) as unknown as Assistant

/** 真实 reducer 上的迷你 store，模拟 Redux 中 assistants 的增删演进 */
function createStoreHarness(initialTopics: Topic[]) {
  let state: AssistantsState = {
    assistants: [makeAssistant(initialTopics)],
    defaultAssistant: makeAssistant(initialTopics),
    tagsOrder: [],
    collapsedTags: {}
  }
  // 挂载时父组件 useState 捕获的快照：此后 Redux 再变它也纹丝不动
  const mountedSnapshot = state.assistants[0]

  return {
    snapshot: mountedSnapshot,
    get assistants() {
      return state.assistants
    },
    dispatch(action: Parameters<typeof assistantsReducer>[1]) {
      state = assistantsReducer(state, action)
    }
  }
}

describe('resolveLiveAssistant — 快照 → Redux 实时对象', () => {
  it('命中 store 时返回 store 中的对象（与快照不是同一引用）', () => {
    const store = createStoreHarness([makeTopic('topic-old')])
    store.dispatch(addTopic({ assistantId: ASSISTANT_ID, topic: makeTopic('topic-new') }))

    const live = resolveLiveAssistant(store.assistants, store.snapshot)
    expect(live).not.toBe(store.snapshot)
    expect(live).toBe(store.assistants[0])
    expect(live.topics.map((t) => t.id)).toEqual(['topic-new', 'topic-old'])
  })

  it('store 里没有该助手时回退传入的对象', () => {
    const orphan = makeAssistant([makeTopic('topic-x')])
    expect(resolveLiveAssistant([], orphan)).toBe(orphan)
  })
})

describe('resolveValidTopicId — 生图/视频 Workspace 的会话归属守卫', () => {
  it('修复点：新建话题后用实时助手校验，守卫放行', () => {
    const store = createStoreHarness([makeTopic('topic-old')])
    const created = makeTopic('topic-new')
    store.dispatch(addTopic({ assistantId: ASSISTANT_ID, topic: created }))

    const live = resolveLiveAssistant(store.assistants, store.snapshot)
    expect(resolveValidTopicId(live, created)).toBe('topic-new')
  })

  it('回归保护：直接拿挂载快照校验仍然失败——所以 useLiveAssistant 不可省略', () => {
    const store = createStoreHarness([makeTopic('topic-old')])
    const created = makeTopic('topic-new')
    store.dispatch(addTopic({ assistantId: ASSISTANT_ID, topic: created }))

    // 快照不认新话题：这正是线上「新建会话内容区空白 + 每次生成再造孤儿话题」的成因
    expect(resolveValidTopicId(store.snapshot, created)).toBeNull()
    expect(store.snapshot.topics.map((t) => t.id)).toEqual(['topic-old'])
  })

  it('连续新建多个会话，实时助手逐个放行，快照逐个拒绝', () => {
    const store = createStoreHarness([makeTopic('topic-old')])
    const created = [makeTopic('t1'), makeTopic('t2'), makeTopic('t3')]
    for (const topic of created) {
      store.dispatch(addTopic({ assistantId: ASSISTANT_ID, topic }))
    }

    const live = resolveLiveAssistant(store.assistants, store.snapshot)
    for (const topic of created) {
      expect(resolveValidTopicId(live, topic)).toBe(topic.id)
      expect(resolveValidTopicId(store.snapshot, topic)).toBeNull()
    }
  })

  it('话题被删除后实时助手同步收缩，守卫不再放行已删话题', () => {
    const doomed = makeTopic('topic-doomed')
    const store = createStoreHarness([doomed, makeTopic('topic-keep')])
    store.dispatch(removeTopic({ assistantId: ASSISTANT_ID, topic: doomed }))

    const live = resolveLiveAssistant(store.assistants, store.snapshot)
    expect(resolveValidTopicId(live, doomed)).toBeNull()
    expect(resolveValidTopicId(live, makeTopic('topic-keep'))).toBe('topic-keep')
  })

  it('挂载时就存在的旧会话不受影响', () => {
    const old = makeTopic('topic-old')
    const store = createStoreHarness([old])
    expect(resolveValidTopicId(store.snapshot, old)).toBe('topic-old')
  })

  it('边界：activeTopic 为空 / 助手无 topics 时返回 null', () => {
    const store = createStoreHarness([])
    expect(resolveValidTopicId(store.assistants[0], undefined)).toBeNull()
    expect(resolveValidTopicId(store.assistants[0], makeTopic('ghost'))).toBeNull()
  })
})
