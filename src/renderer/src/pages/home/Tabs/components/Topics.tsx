import AddButton from '@renderer/components/AddButton'
import AssistantAvatar from '@renderer/components/Avatar/AssistantAvatar'
import type { DraggableVirtualListRef } from '@renderer/components/DraggableList'
import { DraggableVirtualList } from '@renderer/components/DraggableList'
import { CopyIcon, DeleteIcon, EditIcon } from '@renderer/components/Icons'
import ObsidianExportPopup from '@renderer/components/Popups/ObsidianExportPopup'
import PromptPopup from '@renderer/components/Popups/PromptPopup'
import { isMac } from '@renderer/config/constant'
import { db } from '@renderer/databases'
import { useAssistant, useAssistants } from '@renderer/hooks/useAssistant'
import { useInPlaceEdit } from '@renderer/hooks/useInPlaceEdit'
import { modelGenerating } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { finishTopicRenaming, startTopicRenaming, TopicManager } from '@renderer/hooks/useTopic'
import { fetchMessagesSummary } from '@renderer/services/ApiService'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { RootState } from '@renderer/store'
import store from '@renderer/store'
import { newMessagesActions } from '@renderer/store/newMessage'
import { setGenerating } from '@renderer/store/runtime'
import type { Assistant, Topic } from '@renderer/types'
import { classNames, removeSpecialCharactersForFileName } from '@renderer/utils'
import { copyTopicAsMarkdown, copyTopicAsPlainText } from '@renderer/utils/copy'
import {
  exportMarkdownToJoplin,
  exportMarkdownToSiyuan,
  exportMarkdownToYuque,
  exportTopicAsMarkdown,
  exportTopicToNotion,
  topicToMarkdown
} from '@renderer/utils/export'
import type { MenuProps } from 'antd'
import { Dropdown, Tooltip } from 'antd'
import type { ItemType, MenuItemType } from 'antd/es/menu/interface'
import dayjs from 'dayjs'
import { findIndex } from 'lodash'
import {
  BrushCleaning,
  CheckSquare,
  FolderOpen,
  HelpCircle,
  ListChecks,
  MenuIcon,
  PackagePlus,
  PinIcon,
  PinOffIcon,
  Sparkles,
  Square,
  UploadIcon,
  XIcon
} from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import styled from 'styled-components'

import { TopicManagePanel, useTopicManageMode } from './TopicManageMode'

interface Props {
  assistant: Assistant
  activeTopic: Topic
  setActiveTopic: (topic: Topic) => void
  position: 'left' | 'right'
}

export const Topics: React.FC<Props> = ({ assistant: _assistant, activeTopic, setActiveTopic, position }) => {
  const { assistants } = useAssistants()
  const { assistant, addTopic, removeTopic, moveTopic, updateTopic, updateTopics } = useAssistant(_assistant.id)
  const { showTopicTime, pinTopicsToTop, setTopicPosition, topicPosition } = useSettings()

  const renamingTopics = useSelector((state: RootState) => state.runtime.chat.renamingTopics)
  const topicLoadingQuery = useSelector((state: RootState) => state.messages.loadingByTopic)
  const topicFulfilledQuery = useSelector((state: RootState) => state.messages.fulfilledByTopic)
  const newlyRenamedTopics = useSelector((state: RootState) => state.runtime.chat.newlyRenamedTopics)

  const borderRadius = showTopicTime ? 12 : 'var(--list-item-border-radius)'

  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null)
  const deleteTimerRef = useRef<NodeJS.Timeout>(null)
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const listRef = useRef<DraggableVirtualListRef>(null)

  // 管理模式状态
  const manageState = useTopicManageMode()
  const { isManageMode, selectedIds, searchText, enterManageMode, exitManageMode, toggleSelectTopic } = manageState

  const { startEdit, isEditing, inputProps } = useInPlaceEdit({
    onSave: (name: string) => {
      const topic = assistant.topics.find((t) => t.id === editingTopicId)
      if (topic && name !== topic.name) {
        const updatedTopic = { ...topic, name, isNameManuallyEdited: true }
        updateTopic(updatedTopic)
        window.toast.success('已保存')
      }
      setEditingTopicId(null)
    },
    onCancel: () => {
      setEditingTopicId(null)
    }
  })

  const isPending = useCallback((topicId: string) => topicLoadingQuery[topicId], [topicLoadingQuery])
  const isFulfilled = useCallback((topicId: string) => topicFulfilledQuery[topicId], [topicFulfilledQuery])
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(newMessagesActions.setTopicFulfilled({ topicId: activeTopic.id, fulfilled: false }))
  }, [activeTopic.id, dispatch, topicFulfilledQuery])

  const isRenaming = useCallback(
    (topicId: string) => {
      return renamingTopics.includes(topicId)
    },
    [renamingTopics]
  )

  const isNewlyRenamed = useCallback(
    (topicId: string) => {
      return newlyRenamedTopics.includes(topicId)
    },
    [newlyRenamedTopics]
  )

  const handleDeleteClick = useCallback((topicId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current)
    }

    setDeletingTopicId(topicId)

    deleteTimerRef.current = setTimeout(() => setDeletingTopicId(null), 2000)
  }, [])

  const onClearMessages = useCallback((topic: Topic) => {
    // window.keyv.set(EVENT_NAMES.CHAT_COMPLETION_PAUSED, true)
    store.dispatch(setGenerating(false))
    void EventEmitter.emit(EVENT_NAMES.CLEAR_MESSAGES, topic)
  }, [])

  const handleConfirmDelete = useCallback(
    async (topic: Topic, e: React.MouseEvent) => {
      e.stopPropagation()
      if (assistant.topics.length === 1) {
        const newTopic = getDefaultTopic(assistant.id)
        await db.topics.add({ id: newTopic.id, messages: [] })
        addTopic(newTopic)
        setActiveTopic(newTopic)
      } else {
        const index = findIndex(assistant.topics, (t) => t.id === topic.id)
        if (topic.id === activeTopic.id) {
          setActiveTopic(assistant.topics[index + 1 === assistant.topics.length ? index - 1 : index + 1])
        }
      }
      await modelGenerating()
      removeTopic(topic)
      setDeletingTopicId(null)
    },
    [activeTopic.id, addTopic, assistant.id, assistant.topics, removeTopic, setActiveTopic]
  )

  const onPinTopic = useCallback(
    (topic: Topic) => {
      // 只有当 pinTopicsToTop 开启时才重新排序话题
      if (pinTopicsToTop) {
        let newIndex = 0

        if (topic.pinned) {
          // 取消固定：将话题移到未固定话题的顶部
          const pinnedTopics = assistant.topics.filter((t) => t.pinned)
          const unpinnedTopics = assistant.topics.filter((t) => !t.pinned)

          const reorderedTopics = [...pinnedTopics.filter((t) => t.id !== topic.id), topic, ...unpinnedTopics]

          newIndex = pinnedTopics.length - 1
          updateTopics(reorderedTopics)
        } else {
          // 固定话题：移到固定区域顶部
          const pinnedTopics = assistant.topics.filter((t) => t.pinned)
          const unpinnedTopics = assistant.topics.filter((t) => !t.pinned)

          const reorderedTopics = [topic, ...pinnedTopics, ...unpinnedTopics.filter((t) => t.id !== topic.id)]

          newIndex = 0
          updateTopics(reorderedTopics)
        }

        // 延迟滚动到话题位置（等待渲染完成）
        setTimeout(() => {
          listRef.current?.scrollToIndex(newIndex, { align: 'auto' })
        }, 50)
      }

      const updatedTopic = { ...topic, pinned: !topic.pinned }
      updateTopic(updatedTopic)
    },
    [assistant.topics, updateTopic, updateTopics, pinTopicsToTop]
  )

  const onDeleteTopic = useCallback(
    async (topic: Topic) => {
      await modelGenerating()
      if (topic.id === activeTopic?.id) {
        const index = findIndex(assistant.topics, (t) => t.id === topic.id)
        setActiveTopic(assistant.topics[index + 1 === assistant.topics.length ? index - 1 : index + 1])
      }
      removeTopic(topic)
    },
    [assistant.topics, removeTopic, setActiveTopic, activeTopic]
  )

  const onMoveTopic = useCallback(
    async (topic: Topic, toAssistant: Assistant) => {
      await modelGenerating()
      const index = findIndex(assistant.topics, (t) => t.id === topic.id)
      setActiveTopic(assistant.topics[index + 1 === assistant.topics.length ? 0 : index + 1])
      moveTopic(topic, toAssistant)
    },
    [assistant.topics, moveTopic, setActiveTopic]
  )

  const onSwitchTopic = useCallback(
    async (topic: Topic) => {
      // await modelGenerating()
      setActiveTopic(topic)
    },
    [setActiveTopic]
  )

  const exportMenuOptions = useSelector((state: RootState) => state.settings.exportMenuOptions)

  const [_targetTopic, setTargetTopic] = useState<Topic | null>(null)
  const targetTopic = useDeferredValue(_targetTopic)
  const getTopicMenuItems = useMemo(() => {
    const topic = targetTopic
    if (!topic) return []

    const menus: MenuProps['items'] = [
      {
        label: '生成话题名',
        key: 'auto-rename',
        icon: <Sparkles size={14} />,
        disabled: isRenaming(topic.id),
        async onClick() {
          const messages = await TopicManager.getTopicMessages(topic.id)
          if (messages.length >= 2) {
            startTopicRenaming(topic.id)
            try {
              const { text: summaryText, error } = await fetchMessagesSummary({ messages })
              if (summaryText) {
                const updatedTopic = { ...topic, name: summaryText, isNameManuallyEdited: false }
                updateTopic(updatedTopic)
              } else if (error) {
                window.toast?.error(`${'话题命名失败'}: ${error}`)
              }
            } finally {
              finishTopicRenaming(topic.id)
            }
          }
        }
      },
      {
        label: '编辑话题名',
        key: 'rename',
        icon: <EditIcon size={14} />,
        disabled: isRenaming(topic.id),
        async onClick() {
          const name = await PromptPopup.show({
            title: '编辑话题名',
            message: '',
            defaultValue: topic?.name || '',
            extraNode: (
              <div style={{ color: 'var(--color-text-3)', marginTop: 8 }}>{'提示: 双击话题名可以直接就地重命名'}</div>
            )
          })
          if (name && topic?.name !== name) {
            const updatedTopic = { ...topic, name, isNameManuallyEdited: true }
            updateTopic(updatedTopic)
          }
        }
      },
      {
        label: '话题提示词',
        key: 'topic-prompt',
        icon: <PackagePlus size={14} />,
        extra: (
          <Tooltip title={'话题提示词：针对当前话题提供额外的补充提示词'}>
            <HelpCircle size={14} />
          </Tooltip>
        ),
        async onClick() {
          const prompt = await PromptPopup.show({
            title: '编辑话题提示词',
            message: '',
            defaultValue: topic?.prompt || '',
            inputProps: {
              rows: 8,
              allowClear: true
            }
          })

          prompt !== null &&
            (() => {
              const updatedTopic = { ...topic, prompt: prompt.trim() }
              updateTopic(updatedTopic)
              topic.id === activeTopic.id && setActiveTopic(updatedTopic)
            })()
        }
      },
      {
        label: topic.pinned ? '取消固定' : '固定话题',
        key: 'pin',
        icon: topic.pinned ? <PinOffIcon size={14} /> : <PinIcon size={14} />,
        onClick() {
          onPinTopic(topic)
        }
      },
      {
        label: '清空消息',
        key: 'clear-messages',
        icon: <BrushCleaning size={14} />,
        onClick: () => onClearMessages(topic)
      },
      {
        label: '话题位置',
        key: 'topic-position',
        icon: <MenuIcon size={14} />,
        children: [
          {
            label: '左侧',
            key: 'left',
            onClick: () => setTopicPosition('left')
          },
          {
            label: '右侧',
            key: 'right',
            onClick: () => setTopicPosition('right')
          }
        ]
      },
      {
        label: '复制',
        key: 'copy',
        icon: <CopyIcon size={14} />,
        children: [
          {
            label: '复制为图片',
            key: 'img',
            onClick: () => EventEmitter.emit(EVENT_NAMES.COPY_TOPIC_IMAGE, topic)
          },
          {
            label: '复制为 Markdown',
            key: 'md',
            onClick: () => copyTopicAsMarkdown(topic)
          },
          {
            label: '复制为纯文本（去除 Markdown）',
            key: 'plain_text',
            onClick: () => copyTopicAsPlainText(topic)
          }
        ]
      },
      {
        label: '导出',
        key: 'export',
        icon: <UploadIcon size={14} />,
        children: [
          exportMenuOptions.image && {
            label: '导出为图片',
            key: 'image',
            onClick: () => EventEmitter.emit(EVENT_NAMES.EXPORT_TOPIC_IMAGE, topic)
          },
          exportMenuOptions.markdown && {
            label: '导出为 Markdown',
            key: 'markdown',
            onClick: () => exportTopicAsMarkdown(topic)
          },
          exportMenuOptions.markdown_reason && {
            label: '导出为 Markdown (包含思考)',
            key: 'markdown_reason',
            onClick: () => exportTopicAsMarkdown(topic, true)
          },
          exportMenuOptions.docx && {
            label: '导出为 Word',
            key: 'word',
            onClick: async () => {
              const markdown = await topicToMarkdown(topic)
              void window.api.export.toWord(markdown, removeSpecialCharactersForFileName(topic.name))
            }
          },
          exportMenuOptions.notion && {
            label: '导出到 Notion',
            key: 'notion',
            onClick: async () => {
              void exportTopicToNotion(topic)
            }
          },
          exportMenuOptions.yuque && {
            label: '导出到语雀',
            key: 'yuque',
            onClick: async () => {
              const markdown = await topicToMarkdown(topic)
              void exportMarkdownToYuque(topic.name, markdown)
            }
          },
          exportMenuOptions.obsidian && {
            label: '导出到 Obsidian',
            key: 'obsidian',
            onClick: async () => {
              await ObsidianExportPopup.show({ title: topic.name, topic, processingMethod: '3' })
            }
          },
          exportMenuOptions.joplin && {
            label: '导出到 Joplin',
            key: 'joplin',
            onClick: async () => {
              const topicMessages = await TopicManager.getTopicMessages(topic.id)
              void exportMarkdownToJoplin(topic.name, topicMessages)
            }
          },
          exportMenuOptions.siyuan && {
            label: '导出到思源笔记',
            key: 'siyuan',
            onClick: async () => {
              const markdown = await topicToMarkdown(topic)
              void exportMarkdownToSiyuan(topic.name, markdown)
            }
          }
        ].filter(Boolean) as ItemType<MenuItemType>[]
      }
    ]

    if (assistants.length > 1 && assistant.topics.length > 1) {
      menus.push({
        label: '移动到',
        key: 'move',
        icon: <FolderOpen size={14} />,
        popupClassName: 'move-to-submenu',
        children: assistants
          .filter((a) => a.id !== assistant.id)
          .map((a) => ({
            label: a.name,
            key: a.id,
            icon: <AssistantAvatar assistant={a} size={18} />,
            onClick: () => onMoveTopic(topic, a)
          }))
      })
    }

    if (assistant.topics.length > 1 && !topic.pinned) {
      menus.push({ type: 'divider' })
      menus.push({
        label: '删除',
        danger: true,
        key: 'delete',
        icon: <DeleteIcon size={14} className="lucide-custom" />,
        onClick: () => onDeleteTopic(topic)
      })
    }

    return menus
  }, [
    targetTopic,
    isRenaming,
    exportMenuOptions.image,
    exportMenuOptions.markdown,
    exportMenuOptions.markdown_reason,
    exportMenuOptions.docx,
    exportMenuOptions.notion,
    exportMenuOptions.yuque,
    exportMenuOptions.obsidian,
    exportMenuOptions.joplin,
    exportMenuOptions.siyuan,
    assistants,
    assistant,
    updateTopic,
    activeTopic.id,
    setActiveTopic,
    onPinTopic,
    onClearMessages,
    setTopicPosition,
    onMoveTopic,
    onDeleteTopic
  ])

  // Sort topics based on pinned status if pinTopicsToTop is enabled
  const sortedTopics = useMemo(() => {
    if (pinTopicsToTop) {
      return [...assistant.topics].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return 0
      })
    }
    return assistant.topics
  }, [assistant.topics, pinTopicsToTop])

  // Filter topics based on search text (only in manage mode)
  // Supports: case-insensitive, space-separated keywords (all must match)
  const deferredSearchText = useDeferredValue(searchText)
  const filteredTopics = useMemo(() => {
    if (!isManageMode || !deferredSearchText.trim()) {
      return sortedTopics
    }
    // Split by spaces and filter out empty strings
    const keywords = deferredSearchText
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 0)
    if (keywords.length === 0) {
      return sortedTopics
    }
    // All keywords must match (AND logic)
    return sortedTopics.filter((topic) => {
      const lowerName = topic.name.toLowerCase()
      return keywords.every((keyword) => lowerName.includes(keyword))
    })
  }, [sortedTopics, deferredSearchText, isManageMode])

  const singlealone = topicPosition === 'right' && position === 'right'

  return (
    <>
      <DraggableVirtualList
        ref={listRef}
        className="topics-tab"
        list={filteredTopics}
        onUpdate={updateTopics}
        style={{ height: '100%', padding: '8px 0 10px 10px', paddingBottom: isManageMode ? 70 : 10 }}
        itemContainerStyle={{ paddingBottom: '8px' }}
        header={
          <HeaderRow>
            <AddButton onClick={() => EventEmitter.emit(EVENT_NAMES.ADD_NEW_TOPIC)}>{'新建话题'}</AddButton>
            <Tooltip title={'管理话题'} mouseEnterDelay={0.5}>
              <HeaderIconButton
                onClick={isManageMode ? exitManageMode : enterManageMode}
                className={isManageMode ? 'active' : ''}>
                <ListChecks size={14} />
              </HeaderIconButton>
            </Tooltip>
          </HeaderRow>
        }
        disabled={isManageMode}>
        {(topic) => {
          const isActive = topic.id === activeTopic?.id
          const topicName = topic.name.replace('`', '')
          const topicPrompt = topic.prompt
          const fullTopicPrompt = '提示词' + ': ' + topicPrompt
          const isSelected = selectedIds.has(topic.id)
          const canSelect = !topic.pinned

          const getTopicNameClassName = () => {
            if (isRenaming(topic.id)) return 'animation-shimmer'
            if (isNewlyRenamed(topic.id)) return 'animation-reveal'
            return ''
          }

          const handleItemClick = () => {
            if (isManageMode) {
              if (canSelect) {
                toggleSelectTopic(topic.id)
              }
            } else {
              void onSwitchTopic(topic)
            }
          }

          return (
            <Dropdown menu={{ items: getTopicMenuItems }} trigger={['contextMenu']} disabled={isManageMode}>
              <TopicListItem
                onContextMenu={() => setTargetTopic(topic)}
                className={classNames(
                  isActive && !isManageMode ? 'active' : '',
                  singlealone ? 'singlealone' : '',
                  isManageMode && isSelected ? 'selected' : '',
                  isManageMode && !canSelect ? 'disabled' : ''
                )}
                onClick={editingTopicId === topic.id && isEditing ? undefined : handleItemClick}
                style={{
                  borderRadius,
                  cursor:
                    editingTopicId === topic.id && isEditing
                      ? 'default'
                      : isManageMode && !canSelect
                        ? 'not-allowed'
                        : 'pointer'
                }}>
                {isPending(topic.id) && !isActive && <PendingIndicator />}
                {isFulfilled(topic.id) && !isActive && <FulfilledIndicator />}
                <TopicNameContainer>
                  {isManageMode && (
                    <SelectIcon className={!canSelect ? 'disabled' : ''}>
                      {isSelected ? (
                        <CheckSquare size={16} color="var(--color-primary)" />
                      ) : (
                        <Square size={16} color="var(--color-text-3)" />
                      )}
                    </SelectIcon>
                  )}
                  {editingTopicId === topic.id && isEditing ? (
                    <TopicEditInput {...inputProps} onClick={(e) => e.stopPropagation()} />
                  ) : (
                    <TopicName
                      className={getTopicNameClassName()}
                      title={topicName}
                      onDoubleClick={
                        isManageMode
                          ? undefined
                          : () => {
                              setEditingTopicId(topic.id)
                              startEdit(topic.name)
                            }
                      }>
                      {topicName}
                    </TopicName>
                  )}
                  {!topic.pinned && (
                    <Tooltip
                      placement="bottom"
                      mouseEnterDelay={0.7}
                      mouseLeaveDelay={0}
                      title={
                        <div style={{ fontSize: '12px', opacity: 0.8, fontStyle: 'italic' }}>
                          {`按住 ${isMac ? '⌘' : 'Ctrl'} 可直接删除`}
                        </div>
                      }>
                      <MenuButton
                        className="menu"
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            void handleConfirmDelete(topic, e)
                          } else if (deletingTopicId === topic.id) {
                            void handleConfirmDelete(topic, e)
                          } else {
                            handleDeleteClick(topic.id, e)
                          }
                        }}>
                        {deletingTopicId === topic.id ? (
                          <DeleteIcon size={14} color="var(--color-error)" style={{ pointerEvents: 'none' }} />
                        ) : (
                          <XIcon size={14} color="var(--color-text-3)" style={{ pointerEvents: 'none' }} />
                        )}
                      </MenuButton>
                    </Tooltip>
                  )}
                  {topic.pinned && (
                    <MenuButton className="pin">
                      <PinIcon size={14} color="var(--color-text-3)" />
                    </MenuButton>
                  )}
                </TopicNameContainer>
                {topicPrompt && (
                  <TopicPromptText className="prompt" title={fullTopicPrompt}>
                    {fullTopicPrompt}
                  </TopicPromptText>
                )}
                {showTopicTime && (
                  <TopicTime className="time">{dayjs(topic.createdAt).format('YYYY/MM/DD HH:mm')}</TopicTime>
                )}
              </TopicListItem>
            </Dropdown>
          )
        }}
      </DraggableVirtualList>

      {/* 管理模式底部面板 */}
      <TopicManagePanel
        assistant={assistant}
        assistants={assistants}
        activeTopic={activeTopic}
        setActiveTopic={setActiveTopic}
        updateTopics={updateTopics}
        moveTopic={moveTopic}
        manageState={manageState}
        filteredTopics={filteredTopics}
      />
    </>
  )
}

const TopicListItem = styled.div`
  padding: 7px 12px;
  border-radius: var(--list-item-border-radius);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  width: calc(var(--assistants-width) - 20px);

  .menu {
    opacity: 0;
    color: var(--color-text-3);
  }

  &:hover {
    background-color: var(--color-list-item-hover);
    transition: background-color 0.1s;

    .menu {
      opacity: 1;
    }
  }

  &.active {
    background-color: var(--color-list-item);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    .menu {
      opacity: 1;

      &:hover {
        color: var(--color-text-2);
      }
    }
  }
  &.singlealone {
    &:hover {
      background-color: var(--color-background-soft);
    }
    &.active {
      background-color: var(--color-background-mute);
      box-shadow: none;
    }
  }

  &.selected {
    background-color: var(--color-primary-bg);
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }

  &.disabled {
    opacity: 0.5;
  }
`

const TopicNameContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  height: 20px;
`

const TopicName = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  position: relative;
  flex: 1;
  text-align: left;

  &.animation-reveal {
    -webkit-line-clamp: unset;
    -webkit-box-orient: unset;
  }
`

const TopicEditInput = styled.input`
  background: var(--color-background);
  border: none;
  color: var(--color-text-1);
  font-size: 13px;
  font-family: inherit;
  padding: 2px 6px;
  width: 100%;
  outline: none;
  padding: 0;
`

const PendingIndicator = styled.div.attrs({
  className: 'animation-pulse'
})`
  --pulse-size: 5px;
  width: 5px;
  height: 5px;
  position: absolute;
  left: 3px;
  top: 15px;
  border-radius: 50%;
  background-color: var(--color-status-warning);
`

const FulfilledIndicator = styled.div.attrs({
  className: 'animation-pulse'
})`
  --pulse-size: 5px;
  width: 5px;
  height: 5px;
  position: absolute;
  left: 3px;
  top: 15px;
  border-radius: 50%;
  background-color: var(--color-status-success);
`

const TopicPromptText = styled.div`
  color: var(--color-text-2);
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  ~ .prompt-text {
    margin-top: 10px;
  }
`

const TopicTime = styled.div`
  color: var(--color-text-3);
  font-size: 11px;
`

const MenuButton = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
  .anticon {
    font-size: 12px;
  }
`

const HeaderRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-right: 10px;
  margin-bottom: 8px;
  margin-top: 2px;
`

const HeaderIconButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  border-radius: var(--list-item-border-radius);
  cursor: pointer;
  color: var(--color-text-2);
  transition: all 0.2s;

  &:hover {
    background-color: var(--color-background-mute);
    color: var(--color-text-1);
  }

  &.active {
    color: var(--color-primary);

    &:hover {
      background-color: var(--color-background-mute);
    }
  }
`

const SelectIcon = styled.div`
  display: flex;
  align-items: center;
  margin-right: 4px;

  &.disabled {
    opacity: 0.5;
  }
`
