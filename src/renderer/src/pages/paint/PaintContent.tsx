import { db } from '@renderer/databases'
import ImageBlock from '@renderer/pages/home/Messages/Blocks/ImageBlock'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { MessageBlockType } from '@renderer/types/newMessage'
import { getErrorMessage, isAbortError } from '@renderer/utils/error'
import { Button, Input, Spin, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, PencilLine, X } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { findModelByUniqId, generatePaintImage } from './services/paintService'
import { setIsGenerating, setLastGeneration } from './store/paintSlice'

interface Props {
  topicId: string | null
}

type TopicRow = {
  id: string
  name?: string
  updatedAt?: string
  messages: { id: string; role: string; status?: string; createdAt?: string; blocks?: string[]; modelId?: string }[]
}

/**
 * 图片展示区：按消息顺序渲染当前绘画会话
 * - 顶部：会话信息（标题 / 已生成数量 / 更新时间）
 * - user 消息：提示词气泡（可选中复制 / 复制按钮 / 编辑重生成）
 * - assistant 消息：图片卡片网格（左对齐，含 PENDING 骨架）
 */
const PaintContent: FC<Props> = ({ topicId }) => {
  const dispatch = useAppDispatch()
  const lastGeneration = useAppSelector((s) => s.paint.lastGeneration)
  const isGenerating = useAppSelector((s) => s.paint.isGenerating)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    if (!topicId) return null
    const topic = (await db.topics.get(topicId)) as TopicRow | undefined
    if (!topic) return null

    const blockIds = topic.messages.flatMap((m) => m.blocks ?? [])
    const blocks = blockIds.length > 0 ? await db.message_blocks.where('id').anyOf(blockIds).toArray() : []
    return { topic, messages: topic.messages, blocks }
  }, [topicId])

  // 新消息/图片生成完成时自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [data])

  /** 复制提示词到剪贴板 */
  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(messageId)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      window.toast.error('复制失败')
    }
  }

  /** 编辑提示词并重新生成（复用上一次生成参数） */
  const handleEditConfirm = async () => {
    const content = editValue.trim()
    if (!content || isGenerating) {
      return
    }
    const last = lastGeneration
    if (!last) {
      window.toast.warning('没有可用的生成参数，请先在输入框生成一次图片')
      return
    }
    const model = findModelByUniqId(last.modelId)
    if (!model) {
      window.toast.warning('上次使用的模型已不存在，请重新选择模型')
      return
    }

    setEditingId(null)
    dispatch(setIsGenerating(true))
    try {
      await generatePaintImage({
        model,
        prompt: content,
        inputImages: last.inputImages,
        imageSize: last.imageSize,
        aspectRatio: last.aspectRatio,
        personGeneration: last.personGeneration,
        batchSize: last.batchSize,
        topicId
      })
      dispatch(setLastGeneration({ ...last, prompt: content }))
    } catch (error) {
      if (!isAbortError(error)) {
        window.toast.error({ title: getErrorMessage(error), timeout: 5000 })
      }
    } finally {
      dispatch(setIsGenerating(false))
    }
  }

  if (!topicId) {
    return <EmptyPlaceholder>{'选择或新建一个绘画会话'}</EmptyPlaceholder>
  }

  if (!data) {
    return (
      <EmptyPlaceholder>
        <Spin size="small" />
      </EmptyPlaceholder>
    )
  }

  if (data.messages.length === 0) {
    return (
      <EmptyPlaceholder>
        <EmptyInner>
          <EmptyIcon>🎨</EmptyIcon>
          <EmptyTitle>{'开始你的第一张 AI 绘画'}</EmptyTitle>
          <EmptyDesc>{'输入提示词，选择模型与尺寸，点击「生成图片」'}</EmptyDesc>
        </EmptyInner>
      </EmptyPlaceholder>
    )
  }

  const assistantMessages = data.messages.filter((m) => m.role === 'assistant')

  return (
    <Container ref={scrollRef}>
      <MessageList>
        {/* 会话信息头 */}
        <SessionHeader>
          <SessionTitle>{data.topic.name || '未命名会话'}</SessionTitle>
          <SessionMeta>
            {assistantMessages.length > 0 && <span>{`已生成 ${assistantMessages.length} 张图片`}</span>}
            {data.topic.updatedAt && <span>{dayjs(data.topic.updatedAt).format('YYYY/MM/DD HH:mm')}</span>}
          </SessionMeta>
        </SessionHeader>

        {data.messages.map((message) => {
          const messageBlocks = (message.blocks ?? [])
            .map((id) => data.blocks.find((b) => b.id === id))
            .filter((b) => b !== undefined)

          const textBlock = messageBlocks.find((b) => b.type === MessageBlockType.MAIN_TEXT)
          const imageBlocks = messageBlocks.filter((b) => b.type === MessageBlockType.IMAGE)

          const isEditing = editingId === message.id

          return (
            <MessageItem key={message.id} $isUser={message.role === 'user'}>
              {textBlock && textBlock.type === MessageBlockType.MAIN_TEXT && (
                <BubbleWrap $isUser={message.role === 'user'}>
                  {isEditing ? (
                    <EditArea>
                      <Input.TextArea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        autoFocus
                      />
                      <EditButtons>
                        <Button
                          size="small"
                          type="primary"
                          icon={<Check size={14} />}
                          onClick={handleEditConfirm}
                          disabled={!editValue.trim() || isGenerating}>
                          {'确定'}
                        </Button>
                        <Button size="small" icon={<X size={14} />} onClick={() => setEditingId(null)}>
                          {'取消'}
                        </Button>
                      </EditButtons>
                    </EditArea>
                  ) : (
                    <TextBubble>
                      <TextContent className="selectable">{textBlock.content}</TextContent>
                      <BubbleFooter>
                        <TextTime>{message.createdAt ? dayjs(message.createdAt).format('HH:mm') : ''}</TextTime>
                        <BubbleActions className="bubble-actions">
                          <Tooltip title={'复制提示词'} mouseEnterDelay={0.5}>
                            <ActionButton onClick={() => handleCopy(textBlock.content, message.id)}>
                              {copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}
                            </ActionButton>
                          </Tooltip>
                          <Tooltip title={'编辑提示词并重新生成'} mouseEnterDelay={0.5}>
                            <ActionButton
                              onClick={() => {
                                setEditingId(message.id)
                                setEditValue(textBlock.content)
                              }}>
                              <PencilLine size={13} />
                            </ActionButton>
                          </Tooltip>
                        </BubbleActions>
                      </BubbleFooter>
                    </TextBubble>
                  )}
                </BubbleWrap>
              )}
              {imageBlocks.length > 0 && (
                <ImagesWrap>
                  {imageBlocks.map((block) => {
                    const images = block.metadata?.generateImageResponse?.images ?? []
                    return <ImageBlock key={block.id} block={block} isSingle={images.length <= 1} />
                  })}
                </ImagesWrap>
              )}
            </MessageItem>
          )
        })}
      </MessageList>
    </Container>
  )
}

const Container = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px 32px;
`

const EmptyPlaceholder = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  font-size: 14px;
`

const EmptyInner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`

const EmptyIcon = styled.div`
  font-size: 48px;
  margin-bottom: 8px;
  opacity: 0.8;
`

const EmptyTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
`

const EmptyDesc = styled.div`
  font-size: 13px;
  color: var(--color-text-3);
`

const MessageList = styled.div`
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const SessionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 0.5px solid var(--color-border);
  margin-bottom: 8px;
`

const SessionTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SessionMeta = styled.div`
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-3);
  white-space: nowrap;
  flex-shrink: 0;
`

const MessageItem = styled.div<{ $isUser: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
  gap: 10px;
`

const BubbleWrap = styled.div<{ $isUser: boolean }>`
  max-width: 80%;
  display: flex;
  flex-direction: column;
  align-items: ${({ $isUser }) => ($isUser ? 'flex-end' : 'flex-start')};
`

const TextBubble = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 14px;
  border-bottom-right-radius: 4px;
  background-color: var(--color-background-soft);
  border: 0.5px solid var(--color-border);

  &:hover .bubble-actions {
    opacity: 1;
  }
`

const TextContent = styled.div`
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
`

const BubbleFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

const TextTime = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
`

const BubbleActions = styled.div`
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
`

const ActionButton = styled.div`
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
    background-color: var(--color-background);
  }
`

const EditArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background-color: var(--color-background-soft);
  border: 0.5px solid var(--color-primary);
`

const EditButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

const ImagesWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`

export default PaintContent
