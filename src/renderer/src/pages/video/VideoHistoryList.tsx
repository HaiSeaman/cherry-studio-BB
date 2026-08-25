import { db } from '@renderer/databases'
import { useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { TopicManager } from '@renderer/hooks/useTopic'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { useAppSelector } from '@renderer/store'
import { removeTopic } from '@renderer/store/assistants'
import { newMessagesActions } from '@renderer/store/newMessage'
import type { Assistant, Topic } from '@renderer/types'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { Tooltip } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clapperboard, Film, History, Plus, Trash2 } from 'lucide-react'
import { type FC, useCallback, useState } from 'react'
import { useDispatch } from 'react-redux'
import styled from 'styled-components'

import { createVideoTopic } from './services/videoService'

interface Props {
  assistant: Assistant
  activeTopicId: string | null
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
const VideoHistoryList: FC<Props> = ({ assistant, activeTopicId, onSelect }) => {
  const dispatch = useDispatch()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 用 Redux 最新助手兜底：HomePage 的 activeAssistant 是稳定引用，删除 topic 后 props 引用不变化，
  // 导致下方 useLiveQuery 的 [assistant] 依赖不更新、列表不刷新；这里从 store 取最新 topics 解决。
  const liveAssistant = useAppSelector(
    (state) => state.assistants.assistants.find((a) => a.id === assistant.id) ?? assistant
  )

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
    // 立即新建空白话题并挂载，旧话题保留在历史中
    const newTopic = await createVideoTopic(assistant.id)
    onSelect(newTopic)
  }, [assistant.id, onSelect])

  const handleDelete = useCallback(
    async (topic: Topic) => {
      setDeletingId(topic.id)
      try {
        // 1. 从 Dexie 数据库中物理删除该 topic 的所有 message 与 messageBlock，以及 topic 记录
        await TopicManager.removeTopic(topic.id)
        // 2. 清除 Redux 内存中的消息缓存（newMessage slice）
        dispatch(newMessagesActions.clearTopicMessages(topic.id))
        // 3. 从助手 topics 列表中移除该 topic（若为当前激活 topic 会在 useActiveTopic 自动置空或切回第一项）
        dispatch(removeTopic({ assistantId: assistant.id, topic }))
        // 4. 若当前激活的正是被删除的话题，切换回默认话题
        if (activeTopicId === topic.id) {
          onSelect(getDefaultTopic(assistant.id))
        }
      } finally {
        setDeletingId(null)
      }
    },
    [assistant.id, dispatch, activeTopicId, onSelect]
  )

  const sorted = (items ?? []).slice().sort((a, b) => (b.topic.updatedAt || '').localeCompare(a.topic.updatedAt || ''))

  return (
    <Sidebar data-no-dnd>
      <Header>
        <History size={14} />
        <span>生成历史</span>
        <CountChip>{sorted.length}</CountChip>
        <Tooltip title={newTopicShortcut ? `新建话题 (${newTopicShortcut})` : '新建话题'} placement="bottom">
          <NewTopicBtn onClick={() => void handleCreateNewTopic()} aria-label="新建话题">
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
                  <span>{fmtTime(topic.updatedAt)}</span>
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

function fmtTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  &:hover {
    color: var(--color-text-1);
    background: var(--color-background-soft);
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
