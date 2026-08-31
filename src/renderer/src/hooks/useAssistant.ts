import { loggerService } from '@logger'
import {
  getThinkModelType,
  isSupportedReasoningEffortModel,
  isSupportedThinkingTokenModel,
  MODEL_SUPPORTED_OPTIONS,
  MODEL_SUPPORTED_REASONING_EFFORT
} from '@renderer/config/models'
import { db } from '@renderer/databases'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  addAssistant,
  addTopic,
  insertAssistant,
  removeAllTopics,
  removeAssistant,
  removeTopic,
  setModel,
  updateAssistant,
  updateAssistants,
  updateAssistantSettings as _updateAssistantSettings,
  updateDefaultAssistant,
  updateTopic,
  updateTopics
} from '@renderer/store/assistants'
import { setDefaultModel, setQuickModel, setTranslateModel } from '@renderer/store/llm'
import type { Assistant, AssistantSettings, Model, ThinkingOption, Topic } from '@renderer/types'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { TopicManager } from './useTopic'

export function useAssistants() {
  const { assistants } = useAppSelector((state) => state.assistants)
  const dispatch = useAppDispatch()
  const logger = loggerService.withContext('useAssistants')

  return {
    assistants,
    updateAssistants: (assistants: Assistant[]) => dispatch(updateAssistants(assistants)),
    addAssistant: (assistant: Assistant) => dispatch(addAssistant(assistant)),
    insertAssistant: (index: number, assistant: Assistant) => dispatch(insertAssistant({ index, assistant })),
    copyAssistant: (assistant: Assistant): Assistant | undefined => {
      if (!assistant) {
        logger.error("assistant doesn't exists.")
        return
      }
      const index = assistants.findIndex((_assistant) => _assistant.id === assistant.id)
      const _assistant: Assistant = { ...assistant, id: crypto.randomUUID(), topics: [getDefaultTopic(assistant.id)] }
      if (index === -1) {
        logger.warn("Origin assistant's id not found. Fallback to addAssistant.")
        dispatch(addAssistant(_assistant))
      } else {
        // 插入到后面
        try {
          dispatch(insertAssistant({ index: index + 1, assistant: _assistant }))
        } catch (e) {
          logger.error('Failed to insert assistant', e as Error)
          window.toast.error('复制失败')
        }
      }
      return _assistant
    },
    removeAssistant: (id: string) => {
      dispatch(removeAssistant({ id }))
      const assistant = assistants.find((a) => a.id === id)
      const topics = assistant?.topics || []
      topics.forEach(({ id }) => TopicManager.removeTopic(id))
    }
  }
}

/**
 * 从 Redux 的 assistants 列表里取最新助手对象，取不到时回退传入的对象。
 * 纯函数，便于在测试里直接验证「快照 → 最新」这一解析规则。
 */
export function resolveLiveAssistant(assistants: Assistant[], assistant: Assistant): Assistant {
  return assistants.find((a) => a.id === assistant.id) ?? assistant
}

/**
 * 取 Redux 里的最新助手对象，替代调用方手里的「快照」。
 *
 * 背景：HomePage 等父组件常把 assistant 存在 useState 里，而 addTopic / removeTopic
 * 经 Immer 会换掉 store 中的对象引用，快照的 topics 却停留在挂载那一刻。用快照做
 * 「话题是否属于本助手」判定，会把新建的话题误判为不属于本助手（生图/视频助手表现为
 * 新建会话后内容区空白、生成结果写进孤儿话题）。凡是要读 assistant.topics 的地方都应该用它。
 */
export function useLiveAssistant(assistant: Assistant): Assistant {
  return useAppSelector((state) => resolveLiveAssistant(state.assistants.assistants, assistant))
}

/**
 * 会话归属守卫：activeTopic 是否仍属于该助手。
 * 删光话题 / 跨助手切换时 activeTopic 可能残留失效 id，放行会导致内容区无限加载、
 * 生成结果写入已删话题，故不命中一律返回 null（由调用方渲染空态）。
 * 注意：必须用 useLiveAssistant 取到的实时助手调用，快照会把新建话题误判为不属于本助手。
 */
export function resolveValidTopicId(assistant: Assistant, activeTopic: Topic | undefined): string | null {
  return activeTopic && (assistant.topics ?? []).some((t) => t.id === activeTopic.id) ? activeTopic.id : null
}

export function useAssistant(id: string) {
  const assistant = useAppSelector((state) => state.assistants.assistants.find((a) => a.id === id) as Assistant)
  const dispatch = useAppDispatch()
  const { defaultModel } = useDefaultModel()

  const model = useMemo(() => assistant?.model ?? assistant?.defaultModel ?? defaultModel, [assistant, defaultModel])
  if (!model) {
    throw new Error(`Assistant model is not set for assistant with name: ${assistant?.name ?? 'unknown'}`)
  }

  const normalizedTopics = useMemo(
    () => (Array.isArray(assistant?.topics) ? assistant.topics : []),
    [assistant?.topics]
  )
  const assistantWithModel = useMemo(
    () => ({ ...assistant, model, topics: normalizedTopics }),
    [assistant, model, normalizedTopics]
  )

  const settingsRef = useRef(assistant?.settings)

  useEffect(() => {
    settingsRef.current = assistant?.settings
  }, [assistant?.settings])

  const updateAssistantSettings = useCallback(
    (settings: Partial<AssistantSettings>) => {
      assistant?.id && dispatch(_updateAssistantSettings({ assistantId: assistant.id, settings }))
    },
    [assistant?.id, dispatch]
  )

  // 当model变化时，同步reasoning effort为模型支持的合法值
  useEffect(() => {
    const settings = settingsRef.current
    if (settings) {
      const currentReasoningEffort = settings.reasoning_effort
      if (isSupportedThinkingTokenModel(model) || isSupportedReasoningEffortModel(model)) {
        const modelType = getThinkModelType(model)
        const supportedOptions = MODEL_SUPPORTED_OPTIONS[modelType]
        if (supportedOptions.every((option) => option !== currentReasoningEffort)) {
          const cache = settings.reasoning_effort_cache
          let fallbackOption: ThinkingOption

          // 选项不支持时，首先尝试恢复到上次使用的值
          if (cache && supportedOptions.includes(cache)) {
            fallbackOption = cache
          } else {
            // 灵活回退到支持的值
            // 注意：这里假设可用的options不会为空
            const enableThinking = currentReasoningEffort !== undefined
            fallbackOption = enableThinking
              ? MODEL_SUPPORTED_REASONING_EFFORT[modelType][0]
              : MODEL_SUPPORTED_OPTIONS[modelType][0]
          }

          updateAssistantSettings({
            reasoning_effort: fallbackOption === 'none' ? undefined : fallbackOption,
            reasoning_effort_cache: fallbackOption === 'none' ? undefined : fallbackOption,
            qwenThinkMode: fallbackOption === 'none' ? undefined : true
          })
        } else {
          // 对于支持的选项, 不再更新 cache.
        }
      } else {
        // 切换到非思考模型时保留cache
        updateAssistantSettings({
          reasoning_effort: undefined,
          reasoning_effort_cache: currentReasoningEffort,
          qwenThinkMode: undefined
        })
      }
    }
  }, [model, updateAssistantSettings])

  return {
    assistant: assistantWithModel,
    model,
    addTopic: (topic: Topic) => dispatch(addTopic({ assistantId: assistant.id, topic })),
    removeTopic: (topic: Topic) => {
      void TopicManager.removeTopic(topic.id)
      dispatch(removeTopic({ assistantId: assistant.id, topic }))
    },
    moveTopic: (topic: Topic, toAssistant: Assistant) => {
      dispatch(addTopic({ assistantId: toAssistant.id, topic: { ...topic, assistantId: toAssistant.id } }))
      dispatch(removeTopic({ assistantId: assistant.id, topic }))
      // update topic messages in database
      void db.topics
        .where('id')
        .equals(topic.id)
        .modify((dbTopic) => {
          if (dbTopic.messages) {
            dbTopic.messages = dbTopic.messages.map((message) => ({
              ...message,
              assistantId: toAssistant.id
            }))
          }
        })
    },
    updateTopic: (topic: Topic) => dispatch(updateTopic({ assistantId: assistant.id, topic })),
    updateTopics: (topics: Topic[]) => dispatch(updateTopics({ assistantId: assistant.id, topics })),
    removeAllTopics: () => dispatch(removeAllTopics({ assistantId: assistant.id })),
    setModel: useCallback(
      (model: Model) => assistant && dispatch(setModel({ assistantId: assistant?.id, model })),
      [assistant, dispatch]
    ),
    updateAssistant: useCallback(
      (update: Partial<Omit<Assistant, 'id'>>) => dispatch(updateAssistant({ id, ...update })),
      [dispatch, id]
    ),
    updateAssistantSettings
  }
}

export function useDefaultAssistant() {
  const defaultAssistant = useAppSelector((state) => state.assistants.defaultAssistant)
  const dispatch = useAppDispatch()
  const memoizedTopics = useMemo(() => [getDefaultTopic(defaultAssistant.id)], [defaultAssistant.id])

  return {
    defaultAssistant: {
      ...defaultAssistant,
      topics: memoizedTopics
    },
    updateDefaultAssistant: (assistant: Assistant) => dispatch(updateDefaultAssistant({ assistant }))
  }
}

export function useDefaultModel() {
  const { defaultModel, quickModel, translateModel } = useAppSelector((state) => state.llm)
  const dispatch = useAppDispatch()

  return {
    defaultModel,
    quickModel,
    translateModel,
    setDefaultModel: (model: Model) => dispatch(setDefaultModel({ model })),
    setQuickModel: (model: Model) => dispatch(setQuickModel({ model })),
    setTranslateModel: (model: Model) => dispatch(setTranslateModel({ model }))
  }
}
