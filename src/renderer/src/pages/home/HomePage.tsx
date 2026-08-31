import { ensureDefaultAutomationAssistant } from '@renderer/automation/runner'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { useAssistants } from '@renderer/hooks/useAssistant'
import { useSettings } from '@renderer/hooks/useSettings'
import { useShortcut } from '@renderer/hooks/useShortcuts'
import { useShowAssistants, useShowTopics } from '@renderer/hooks/useStore'
import { useActiveTopic } from '@renderer/hooks/useTopic'
import { reassociatePaintTopics } from '@renderer/pages/paint/services/paintService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import NavigationService from '@renderer/services/NavigationService'
import { newMessagesActions } from '@renderer/store/newMessage'
import type { Assistant, Topic } from '@renderer/types'
import { getAssistantType } from '@renderer/types'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, SECOND_MIN_WINDOW_WIDTH } from '@shared/config/constant'
import { AnimatePresence, motion } from 'motion/react'
import type { FC } from 'react'
import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import Chat from './Chat'
import HomeTabs from './Tabs'

// 助手形态工作区懒加载：不进聊天首屏 chunk
const PaintWorkspace = lazy(() => import('./PaintWorkspace'))
const VideoWorkspace = lazy(() => import('./VideoWorkspace'))
const AutomationWorkspace = lazy(() => import('./AutomationWorkspace'))

// 跨路由挂载时保持当前助手：只记 id，助手对象一律从 Redux 派生（见下方 activeAssistant）
let _activeAssistantId: string | undefined
let _activeAssistant: Assistant | undefined

// 每会话只跑一次：启动期数据回流（绘画话题挂回生图助手 / 补建自动化助手入口，均幂等）
let _startupMigrated = false

const HomePage: FC = () => {
  const { assistants } = useAssistants()
  const navigate = useNavigate()

  const location = useLocation()
  const state = location.state

  // state 里只存「当前助手 id」，助手对象统一从 Redux 派生。
  // 之前用 useState 存整个 assistant 对象，而 addTopic / removeTopic 经 Immer 会换掉 store 中的
  // 对象引用，快照的 topics 永远停在挂载那一刻；下游 Workspace 用 assistant.topics 校验话题归属时，
  // 新建的话题会被误判为「不属于本助手」→ 内容区空白、生成结果写进孤儿话题。
  const [activeAssistantId, setActiveAssistantId] = useState<string | undefined>(
    state?.assistant?.id ?? _activeAssistantId ?? assistants[0]?.id
  )

  // 兜底顺序：Redux 命中 > 路由带来的游离助手 > 上次会话 > 首个助手（含 assistants 尚未水合的初始渲染）
  const activeAssistant = useMemo(
    () =>
      (activeAssistantId ? assistants.find((a) => a.id === activeAssistantId) : undefined) ??
      state?.assistant ??
      _activeAssistant ??
      assistants[0],
    [assistants, activeAssistantId, state?.assistant]
  ) as Assistant

  const { activeTopic, setActiveTopic: _setActiveTopic } = useActiveTopic(activeAssistant?.id ?? '', state?.topic)
  const { showAssistants, showTopics, topicPosition } = useSettings()
  const { setShowAssistants, toggleShowAssistants } = useShowAssistants()
  const { toggleShowTopics } = useShowTopics()
  const dispatch = useDispatch()

  _activeAssistantId = activeAssistantId
  _activeAssistant = activeAssistant

  useShortcut('toggle_show_assistants', () => {
    if (topicPosition === 'right') {
      toggleShowAssistants()
      return
    }

    if (!showAssistants) {
      setShowAssistants(true)
      requestAnimationFrame(() => {
        EventEmitter.emit(EVENT_NAMES.SHOW_ASSISTANTS)
      })
      return
    }

    EventEmitter.emit(EVENT_NAMES.SHOW_ASSISTANTS)
  })

  useShortcut('toggle_show_topics', () => {
    if (topicPosition === 'right') {
      toggleShowTopics()
      return
    }

    if (!showAssistants) {
      setShowAssistants(true)
      requestAnimationFrame(() => {
        EventEmitter.emit(EVENT_NAMES.SHOW_TOPIC_SIDEBAR)
      })
      return
    }

    EventEmitter.emit(EVENT_NAMES.SHOW_TOPIC_SIDEBAR)
  })

  const setActiveAssistant = useCallback(
    (newAssistant: Assistant) => {
      if (newAssistant.id === activeAssistantId) return
      startTransition(() => {
        setActiveAssistantId(newAssistant.id)
        // 同步更新 active topic，避免不必要的重新渲染
        const newTopic = newAssistant.topics[0]
        _setActiveTopic((prev) => (prev && newTopic?.id === prev.id ? prev : newTopic))
      })
    },
    [_setActiveTopic, activeAssistantId]
  )

  const setActiveTopic = useCallback(
    (newTopic: Topic) => {
      startTransition(() => {
        _setActiveTopic((prev) => (prev && newTopic?.id === prev.id ? prev : newTopic))
        dispatch(newMessagesActions.setTopicFulfilled({ topicId: newTopic.id, fulfilled: false }))
      })
    },
    [_setActiveTopic, dispatch]
  )

  useEffect(() => {
    NavigationService.setNavigate(navigate)
  }, [navigate])

  // 首次进入：把游离的绘画话题挂到生图助手名下（/paint 页下线后的数据回流，幂等）；
  // 同时为有遗留任务但无自动化助手的用户补建入口（/automation 页下线，幂等）
  useEffect(() => {
    if (_startupMigrated || assistants.length === 0) return
    _startupMigrated = true
    void reassociatePaintTopics()
    void ensureDefaultAutomationAssistant()
  }, [assistants])

  useEffect(() => {
    state?.assistant && setActiveAssistant(state?.assistant)
    state?.topic && setActiveTopic(state?.topic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    const canMinimize = topicPosition == 'left' ? !showAssistants : !showAssistants && !showTopics
    void window.api.window.setMinimumSize(canMinimize ? SECOND_MIN_WINDOW_WIDTH : MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)

    return () => {
      void window.api.window.resetMinimumSize()
    }
  }, [showAssistants, showTopics, topicPosition])

  return (
    <Container id="home-page">
      <ContentContainer id="content-container">
        <AnimatePresence initial={false}>
          {showAssistants && (
            <ErrorBoundary>
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'var(--assistants-width)', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}>
                <HomeTabs
                  activeAssistant={activeAssistant}
                  activeTopic={activeTopic}
                  setActiveAssistant={setActiveAssistant}
                  setActiveTopic={setActiveTopic}
                  position="left"
                />
              </motion.div>
            </ErrorBoundary>
          )}
        </AnimatePresence>
        <ErrorBoundary>
          {getAssistantType(activeAssistant) === 'image_gen' ? (
            <Suspense fallback={null}>
              <PaintWorkspace assistant={activeAssistant} activeTopic={activeTopic} setActiveTopic={setActiveTopic} />
            </Suspense>
          ) : getAssistantType(activeAssistant) === 'video_gen' ? (
            <Suspense fallback={null}>
              <VideoWorkspace assistant={activeAssistant} activeTopic={activeTopic} setActiveTopic={setActiveTopic} />
            </Suspense>
          ) : getAssistantType(activeAssistant) === 'automation' ? (
            <Suspense fallback={null}>
              <AutomationWorkspace assistant={activeAssistant} />
            </Suspense>
          ) : (
            <Chat
              assistant={activeAssistant}
              activeTopic={activeTopic}
              setActiveTopic={setActiveTopic}
              setActiveAssistant={setActiveAssistant}
            />
          )}
        </ErrorBoundary>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  [navbar-position='left'] & {
    max-width: calc(100vw - var(--sidebar-width));
  }
  [navbar-position='top'] & {
    max-width: 100vw;
  }
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  overflow: hidden;

  [navbar-position='top'] & {
    max-width: calc(100vw - 12px);
  }
`

export default HomePage
