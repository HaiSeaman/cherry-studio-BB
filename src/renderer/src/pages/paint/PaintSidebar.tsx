import { db } from '@renderer/databases'
import FileManager from '@renderer/services/FileManager'
import { useAppDispatch } from '@renderer/store'
import { MessageBlockType } from '@renderer/types/newMessage'
import type { InputRef } from 'antd'
import { Button, Empty, Input, Modal, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { createPaintTopic, deletePaintTopic, renamePaintTopic } from './services/paintService'
import { setActiveTopicId } from './store/paintSlice'

interface PaintTopicRow {
  id: string
  name?: string
  updatedAt?: string
  messages: { blocks?: string[] }[]
}

interface Props {
  topics: PaintTopicRow[]
  activeTopicId: string | null
}

/** 查询会话最后一张生成图作为缩略图 */
function useThumbnail(topicId: string): string | undefined {
  return useLiveQuery(async () => {
    const topic = await db.topics.get(topicId)
    if (!topic || !topic.messages?.length) return undefined

    for (const msg of [...topic.messages].reverse()) {
      const blockIds = msg.blocks ?? []
      if (blockIds.length === 0) continue
      const blocks = await db.message_blocks.where('id').anyOf(blockIds).toArray()
      const imgBlock = blocks.find((b) => b.type === MessageBlockType.IMAGE)
      if (imgBlock && imgBlock.type === MessageBlockType.IMAGE) {
        const resp = imgBlock.metadata?.generateImageResponse
        if (resp?.images?.length) return resp.images[resp.images.length - 1]
        if (imgBlock.file) return `file://${FileManager.getFilePath(imgBlock.file)}`
        if (imgBlock.url) return imgBlock.url
      }
    }
    return undefined
  }, [topicId])
}

const PaintSidebar: FC<Props> = ({ topics, activeTopicId }) => {
  const dispatch = useAppDispatch()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (renamingId) {
      inputRef.current?.focus()
    }
  }, [renamingId])

  const handleNewTopic = async () => {
    const id = await createPaintTopic()
    dispatch(setActiveTopicId(id))
  }

  const handleDelete = (topic: PaintTopicRow) => {
    Modal.confirm({
      title: '删除绘画会话',
      content: `确定要删除「${topic.name || '未命名会话'}」吗？删除后不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        await deletePaintTopic(topic.id)
        if (activeTopicId === topic.id) {
          const next = topics.find((t) => t.id !== topic.id)
          dispatch(setActiveTopicId(next?.id ?? null))
        }
      }
    })
  }

  const handleRename = (topic: PaintTopicRow) => {
    setRenamingId(topic.id)
    setRenameValue(topic.name || '')
  }

  const confirmRename = async (topicId: string) => {
    const name = renameValue.trim()
    if (name) {
      await renamePaintTopic(topicId, name)
    }
    setRenamingId(null)
  }

  return (
    <Container>
      <Header>
        <Title>{'绘画历史'}</Title>
        <Tooltip title={'新建会话'} mouseEnterDelay={0.5}>
          <Button type="text" size="small" icon={<Plus size={16} />} onClick={handleNewTopic} />
        </Tooltip>
      </Header>
      <List>
        {topics.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={'暂无绘画记录'} />}
        {topics.map((topic) => (
          <TopicItem
            key={topic.id}
            $active={topic.id === activeTopicId}
            onClick={() => dispatch(setActiveTopicId(topic.id))}>
            <Thumbnail topicId={topic.id} />
            <Info>
              {renamingId === topic.id ? (
                <Input
                  ref={inputRef}
                  size="small"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onPressEnter={() => confirmRename(topic.id)}
                  onBlur={() => confirmRename(topic.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <Name
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    handleRename(topic)
                  }}>
                  {topic.name || '未命名会话'}
                </Name>
              )}
              <Time>{topic.updatedAt ? dayjs(topic.updatedAt).format('MM-DD HH:mm') : ''}</Time>
            </Info>
            <Actions onClick={(e) => e.stopPropagation()}>
              <Tooltip title={'重命名'} mouseEnterDelay={0.5}>
                <ActionIcon onClick={() => handleRename(topic)}>
                  <RenameIcon />
                </ActionIcon>
              </Tooltip>
              <Tooltip title={'删除'} mouseEnterDelay={0.5}>
                <ActionIcon onClick={() => handleDelete(topic)}>
                  <Trash2 size={14} />
                </ActionIcon>
              </Tooltip>
            </Actions>
          </TopicItem>
        ))}
      </List>
    </Container>
  )
}

const Thumbnail: FC<{ topicId: string }> = ({ topicId }) => {
  const thumbnail = useThumbnail(topicId)
  if (!thumbnail) {
    return (
      <ThumbBox>
        <ImageIcon size={16} style={{ opacity: 0.35 }} />
      </ThumbBox>
    )
  }
  return <ThumbImg src={thumbnail} alt="" />
}

const RenameIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
)

const Container = styled.div`
  width: 220px;
  min-width: 220px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 0.5px solid var(--color-border);
  background-color: var(--color-background-soft);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px 16px;
`

const Title = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
`

const TopicItem = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  background-color: ${({ $active }) => ($active ? 'var(--color-background)' : 'transparent')};
  border: 0.5px solid ${({ $active }) => ($active ? 'var(--color-border)' : 'transparent')};

  &:hover {
    background-color: var(--color-background);
  }
`

const ThumbBox = styled.div`
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 6px;
  background-color: var(--color-background);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`

const ThumbImg = styled.img`
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 6px;
  object-fit: cover;
  background-color: var(--color-background);
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const Name = styled.div`
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Time = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
  margin-top: 2px;
`

const Actions = styled.div`
  display: none;
  flex-direction: column;
  gap: 2px;

  ${TopicItem}:hover & {
    display: flex;
  }
`

const ActionIcon = styled.div`
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--color-text-2);
  cursor: pointer;

  &:hover {
    color: var(--color-text);
    background-color: var(--color-background-soft);
  }
`

export default PaintSidebar
