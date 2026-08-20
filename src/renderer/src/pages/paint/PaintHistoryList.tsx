import { db } from '@renderer/databases'
import { TopicManager } from '@renderer/hooks/useTopic'
import { removeTopic } from '@renderer/store/assistants'
import type { Assistant, Topic } from '@renderer/types'
import { MessageBlockType } from '@renderer/types/newMessage'
import { useLiveQuery } from 'dexie-react-hooks'
import { History, Image as ImageIcon, Trash2 } from 'lucide-react'
import { type FC, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import styled from 'styled-components'

interface Props {
  assistant: Assistant
  activeTopicId: string | null
  /** 选中历史会话（切换当前生图话题） */
  onSelect: (topic: Topic) => void
}

type HistoryItem = {
  topic: Topic
  /** 最新一次生成的缩略图（无则 null） */
  thumb: string | null
  /** 已成功生成的图片总数 */
  imageCount: number
}

/**
 * 生图历史列表：左侧栏展示本助手的全部绘画会话，
 * 每项含最新生成缩略图、话题名（提示词摘要）、图片数与更新时间；点击切换，可删除。
 */
const PaintHistoryList: FC<Props> = ({ assistant, activeTopicId, onSelect }) => {
  const dispatch = useDispatch()

  const items = useLiveQuery(async (): Promise<HistoryItem[]> => {
    const topics = assistant.topics ?? []
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
      const imageBlocks = ids.map((id) => blockMap.get(id)).filter((b) => b?.type === MessageBlockType.IMAGE)
      const imageCount = imageBlocks.reduce((total, b) => {
        const images = (b as { metadata?: { generateImageResponse?: { images?: string[] } } }).metadata
          ?.generateImageResponse?.images
        return total + (images?.length ?? 0)
      }, 0)
      // 最新一次生成的第一张图作为缩略
      const last = imageBlocks[imageBlocks.length - 1] as
        | { metadata?: { generateImageResponse?: { images?: string[] } } }
        | undefined
      const thumb = last?.metadata?.generateImageResponse?.images?.[0] ?? null
      return { topic, thumb, imageCount }
    })
  }, [assistant])

  const handleDelete = useCallback(
    async (topic: Topic) => {
      // db 行 + 消息块由 TopicManager 清理；redux 助手话题条目在此移除
      await TopicManager.removeTopic(topic.id)
      dispatch(removeTopic({ assistantId: assistant.id, topic }))
    },
    [assistant.id, dispatch]
  )

  const sorted = (items ?? []).slice().sort((a, b) => (b.topic.updatedAt || '').localeCompare(a.topic.updatedAt || ''))

  return (
    <Sidebar data-no-dnd>
      <Header>
        <History size={14} />
        生成历史
        <CountChip>{sorted.length}</CountChip>
      </Header>
      <List>
        {sorted.length === 0 ? (
          <Empty>
            <EmptyIcon>
              <ImageIcon size={24} />
            </EmptyIcon>
            <EmptyText>还没有生成记录，输入提示词开始创作</EmptyText>
          </Empty>
        ) : (
          sorted.map(({ topic, thumb, imageCount }) => (
            <Item key={topic.id} className={topic.id === activeTopicId ? 'active' : ''} onClick={() => onSelect(topic)}>
              <Thumb>{thumb ? <img src={thumb} alt="" loading="lazy" /> : <ImageIcon size={16} />}</Thumb>
              <Info>
                <Name>{topic.name || '未命名会话'}</Name>
                <Meta>
                  {imageCount > 0 && <span>{imageCount} 张</span>}
                  <span>{fmtTime(topic.updatedAt)}</span>
                </Meta>
              </Info>
              <DeleteBtn
                title="删除此会话"
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

function fmtTime(iso: string): string {
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

const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px 10px;
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }
`

const Item = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover {
    background: var(--color-background-soft);
    .del-btn {
      opacity: 1;
    }
  }
  &.active {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }
`

const Thumb = styled.div`
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 9px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const Name = styled.div`
  font-size: 12px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Meta = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--color-text-3);
  font-variant-numeric: tabular-nums;
`

const DeleteBtn = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  flex-shrink: 0;
  color: var(--color-text-3);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  &:hover {
    color: var(--color-error);
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
  }
`

const Empty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 12px;
`

const EmptyIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-background-soft);
  color: var(--color-text-3);
`

const EmptyText = styled.div`
  font-size: 11.5px;
  color: var(--color-text-3);
  text-align: center;
  line-height: 1.5;
`

export default PaintHistoryList
