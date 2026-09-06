import { loggerService } from '@logger'
import { db } from '@renderer/databases'
import { useLiveAssistant } from '@renderer/hooks/useAssistant'
import { useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { TopicManager } from '@renderer/hooks/useTopic'
import { removeTopic } from '@renderer/store/assistants'
import { newMessagesActions } from '@renderer/store/newMessage'
import type { Assistant, Topic } from '@renderer/types'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { getErrorMessage } from '@renderer/utils/error'
import { Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clapperboard, Film, History, Plus, Trash2 } from 'lucide-react'
import { type FC, useCallback, useState } from 'react'
import { useDispatch } from 'react-redux'
import styled from 'styled-components'

import { createVideoTopic } from './services/videoService'

const logger = loggerService.withContext('VideoHistoryList')

interface Props {
  assistant: Assistant
  activeTopicId: string | null
  /** 是否正在生成（生成期间禁止新建会话，避免在途结果"消失"） */
  isGenerating: boolean
  /** 选中历史会话（切换当前视频话题） */
  onSelect: (topic: Topic) => void
}

type HistoryItem = {
  topic: Topic
  /** 已成功生成的视频总数 */
  videoCount: number
}

/**
 * 视频历史列表：左侧栏展示本助手的全部视频会话，
 * 每项含话题名（提示词摘要）、视频数与更新时间；点击切换，可删除。
 */
const VideoHistoryList: FC<Props> = ({ assistant, activeTopicId, isGenerating, onSelect }) => {
  const dispatch = useDispatch()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 用 Redux 最新助手兜底：父组件传来的 assistant 可能是挂载时的快照，删除/新增 topic 后
  // props 引用不变化，导致下方 useLiveQuery 的 [assistant] 依赖不更新、列表不刷新
  const liveAssistant = useLiveAssistant(assistant)

  const items = useLiveQuery(async (): Promise<HistoryItem[]> => {
    const topics = liveAssistant.topics ?? []
    if (topics.length === 0) return []
    const rows = await db.topics.bulkGet(topics.map((t) => t.id))
    // 收集所有消息块 id 后一次查询，避免逐话题 N+1
    const blockIdsByTopic = new Map<string, string[]>()
    for (const row of rows) {
      if (!row) continue
      blockIdsByTopic.set(
        row.id,
        (row.messages ?? []).flatMap((m: { blocks?: string[] }) => m.blocks ?? [])
      )
    }
    const allIds = [...new Set([...blockIdsByTopic.values()].flat())]
    const blocks = allIds.length > 0 ? await db.message_blocks.where('id').anyOf(allIds).toArray() : []
    const blockMap = new Map(blocks.map((b) => [b.id, b]))

    return topics.map((topic) => {
      const ids = blockIdsByTopic.get(topic.id) ?? []
      const videoCount = ids.filter((id) => {
        const b = blockMap.get(id)
        return b?.type === MessageBlockType.VIDEO && b.status === MessageBlockStatus.SUCCESS
      }).length
      return { topic, videoCount }
    })
  }, [liveAssistant])

  const newTopicShortcut = useShortcutDisplay('new_topic')

  const handleCreateNewTopic = useCallback(async () => {
    // 生成期间禁止新建：切走到新会话后，在途生成的结果仍写回旧会话，
    // 用户眼前却是全新的空会话，表现为「生成了但看不见」
    if (isGenerating) {
      return
    }
    // 立即新建空白话题并挂载，旧话题保留在历史中
    const newTopic = await createVideoTopic(assistant.id)
    onSelect(newTopic)
  }, [assistant.id, isGenerating, onSelect])

  const handleDelete = useCallback(
    async (topic: Topic) => {
      setDeletingId(topic.id)
      try {
        // 1. 从 Dexie 数据库中物理删除该 topic 的所有 message 与 messageBlock，以及 topic 记录
        await TopicManager.removeTopic(topic.id)
        // 2. 清除 Redux 内存中的消息缓存（newMessage slice）
        dispatch(newMessagesActions.clearTopicMessages(topic.id))
        // 3. 从助手 topics 列表中移除该 topic
        dispatch(removeTopic({ assistantId: assistant.id, topic }))
        // 4. 删掉的正是当前会话时切到剩下的第一个；没有剩余会话就不动 activeTopic，
        //    由 Workspace 的归属守卫判为空态。此前这里用 getDefaultTopic 造了一个
        //    随机 id 的幽灵话题（不在 db 也不在 Redux），会往 newMessage slice 写入
        //    永远清不掉的 topicId。
        if (activeTopicId === topic.id) {
          const nextTopic = (liveAssistant.topics ?? []).find((t) => t.id !== topic.id)
          if (nextTopic) {
            onSelect(nextTopic)
          }
        }
      } catch (error) {
        logger.error('删除视频会话失败:', error as Error)
        window.toast.error({ title: '删除会话失败', description: getErrorMessage(error), timeout: 5000 })
      } finally {
        setDeletingId(null)
      }
    },
    [assistant.id, dispatch, activeTopicId, liveAssistant.topics, onSelect]
  )

  const sorted = (items ?? []).slice().sort((a, b) => (b.topic.updatedAt || '').localeCompare(a.topic.updatedAt || ''))

  return (
    <Sidebar data-no-dnd>
      <Header>
        <History size={14} />
        <span>生成历史</span>
        <CountChip>{sorted.length}</CountChip>
        <Tooltip
          title={
            isGenerating ? '生成中，暂不能新建会话' : newTopicShortcut ? `新建话题 (${newTopicShortcut})` : '新建话题'
          }
          placement="bottom">
          <NewTopicBtn onClick={() => void handleCreateNewTopic()} disabled={isGenerating} aria-label="新建话题">
            <Plus size={15} />
          </NewTopicBtn>
        </Tooltip>
      </Header>
      <List>
        {sorted.length === 0 ? (
          <Empty>
            <EmptyIcon>
              <Clapperboard size={24} />
            </EmptyIcon>
            <EmptyText>还没有生成记录，输入提示词开始创作</EmptyText>
          </Empty>
        ) : (
          sorted.map(({ topic, videoCount }) => (
            <Item key={topic.id} className={topic.id === activeTopicId ? 'active' : ''} onClick={() => onSelect(topic)}>
              <Thumb>
                <Film size={16} />
              </Thumb>
              <Info>
                <Name>{topic.name || '未命名会话'}</Name>
                <Meta>
                  {videoCount > 0 && <span>{videoCount} 条</span>}
                  <span>{dayjs(topic.updatedAt).format('YYYY-MM-DD HH:mm')}</span>
                </Meta>
              </Info>
              <DeleteBtn
                className="del-btn"
                title="删除此会话"
                $busy={deletingId === topic.id}
                onClick={(e) => {
                  e.stopPropagation()
                  void handleDelete(topic)
                }}>
                <Trash2 size={12} />
              </DeleteBtn>
            </Item>
          ))
        )}
      </List>
    </Sidebar>
  )
}

const Sidebar = styled.div`
  flex: 0 0 232px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 0.5px solid var(--color-border);
  background: var(--color-background);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-2);
  flex-shrink: 0;
`

const CountChip = styled.span`
  font-size: 10.5px;
  font-weight: 500;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-radius: 999px;
  padding: 1px 7px;
`

const NewTopicBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: auto;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-2);
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
  &:hover:not(:disabled) {
    color: var(--color-text-1);
    background: var(--color-background-soft);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 4px 8px 12px;
`

const Empty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-3);
  padding: 20px;
`

const EmptyIcon = styled.div`
  opacity: 0.5;
`

const EmptyText = styled.div`
  font-size: 12px;
  text-align: center;
  line-height: 1.6;
`

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-top: 4px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--color-background-soft);
    .del-btn {
      opacity: 1;
    }
  }

  &.active {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }
`

const Thumb = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-soft);
  color: var(--color-text-3);
  flex-shrink: 0;
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const Name = styled.div`
  font-size: 12.5px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Meta = styled.div`
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-3);
  margin-top: 2px;
`

const DeleteBtn = styled.button<{ $busy: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;

  ${({ $busy }) => $busy && 'opacity: 0.4; pointer-events: none;'}

  &:hover {
    color: var(--color-error, #d93026);
    background: var(--color-background);
  }
`

export default VideoHistoryList
