import { db } from '@renderer/databases'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { Spin, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, Download, FolderOpen } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

interface Props {
  topicId: string | null
}

type TopicRow = {
  id: string
  name?: string
  updatedAt?: string
  messages: { id: string; role: string; status?: string; createdAt?: string; blocks?: string[] }[]
}

/**
 * 视频展示区：按消息顺序渲染当前视频会话
 * - 顶部：会话信息（标题 / 已生成数量 / 更新时间）
 * - user 消息：提示词气泡（可复制）
 * - assistant 消息：视频播放卡 / 进度卡 / 错误卡 / 已停止占位
 */
const VideoContent: FC<Props> = ({ topicId }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸载时清理复制提示词的定时器
  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  const data = useLiveQuery(async () => {
    if (!topicId) return null
    const topic = (await db.topics.get(topicId)) as TopicRow | undefined
    if (!topic) return null

    const blockIds = topic.messages.flatMap((m) => m.blocks ?? [])
    const blocks = blockIds.length > 0 ? await db.message_blocks.where('id').anyOf(blockIds).toArray() : []
    return { topic, messages: topic.messages, blocks }
  }, [topicId])

  // 新消息/生成完成时自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [data])

  const handleCopy = useCallback(async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(messageId)
      // 先清掉上一个定时器：快速连续复制时对勾不被提前清掉
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => {
        copiedTimer.current = null
        setCopiedId(null)
      }, 1500)
    } catch {
      window.toast.error('复制失败')
    }
  }, [])

  /** 另存为：弹出系统保存对话框（复用图片保存通道，按字节写入用户选择的位置）。
   *  主进程按「目录 + id + 扩展名」定位文件：优先用 metadata.fileName（即 uuid+ext），
   *  旧消息没有该字段时从播放地址提取扩展名拼在 fileId 后；
   *  本地文件缺失（被清理/历史遗留）时，用远程链接经主进程重新下载兜底。 */
  const handleSaveAs = useCallback(async (fileKey?: string, fileName?: string, remoteUrl?: string) => {
    try {
      let data: string | undefined
      if (fileKey) {
        try {
          data = (await window.api.file.base64File(fileKey)).data
        } catch {
          // 本地文件不存在，走远程兜底
        }
      }
      if (!data && remoteUrl) {
        const file = await window.api.file.download(remoteUrl, true)
        data = (await window.api.file.base64File(file.id + file.ext)).data
        if (!fileName) {
          fileName = file.origin_name || file.name || `video_${Date.now()}.mp4`
        }
      }
      if (!data) {
        window.toast.error('该视频没有可用文件（本地文件缺失且远程链接不可用），无法另存')
        return
      }
      const success = await window.api.file.saveFileAs(fileName || `video_${Date.now()}.mp4`, data)
      if (success) {
        window.toast.success('视频已保存')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      window.toast.error(
        /ENOENT|403|404|Expired/i.test(msg)
          ? '另存失败: 远程链接可能已过期（约 24 小时），请重新生成或使用自动保存'
          : `另存失败: ${msg}`
      )
    }
  }, [])

  if (!topicId) {
    return <EmptyPlaceholder>{'选择或新建一个视频会话'}</EmptyPlaceholder>
  }

  // useLiveQuery 首屏返回 undefined（加载中）；null 表示库中已无此会话。
  // 旧实现把两者都当加载态，会话记录缺失时会永远转圈，这里区分出来给用户明确反馈
  if (data === undefined) {
    return (
      <EmptyPlaceholder>
        <Spin size="small" />
      </EmptyPlaceholder>
    )
  }

  if (data === null) {
    return <EmptyPlaceholder>{'会话不存在或已被删除'}</EmptyPlaceholder>
  }

  if (data.messages.length === 0) {
    return (
      <EmptyPlaceholder>
        <EmptyInner>
          <EmptyIcon>🎬</EmptyIcon>
          <EmptyTitle>{'开始你的第一条 AI 视频'}</EmptyTitle>
          <EmptyDesc>{'输入提示词，选择模型与时长，点击「生成视频」'}</EmptyDesc>
        </EmptyInner>
      </EmptyPlaceholder>
    )
  }

  const videoCount = data.blocks.filter(
    (b) => b.type === MessageBlockType.VIDEO && b.status === MessageBlockStatus.SUCCESS
  ).length

  return (
    <Container ref={scrollRef}>
      <MessageList>
        {/* 会话信息头 */}
        <SessionHeader>
          <SessionTitle>{data.topic.name || '未命名会话'}</SessionTitle>
          <SessionMeta>
            {videoCount > 0 && <span>{`已生成 ${videoCount} 条视频`}</span>}
            {data.topic.updatedAt && <span>{dayjs(data.topic.updatedAt).format('YYYY/MM/DD HH:mm')}</span>}
          </SessionMeta>
        </SessionHeader>

        {data.messages.map((message) => {
          const messageBlocks = (message.blocks ?? [])
            .map((id) => data.blocks.find((b) => b.id === id))
            .filter((b) => b !== undefined)

          const textBlock = messageBlocks.find((b) => b.type === MessageBlockType.MAIN_TEXT)
          const videoBlocks = messageBlocks.filter((b) => b.type === MessageBlockType.VIDEO)

          return (
            <MessageItem key={message.id} $isUser={message.role === 'user'}>
              {textBlock && textBlock.type === MessageBlockType.MAIN_TEXT && (
                <BubbleWrap $isUser={message.role === 'user'}>
                  <TextBubble>
                    <TextContent className="selectable">{textBlock.content}</TextContent>
                    <BubbleFooter>
                      <TextTime>{message.createdAt ? dayjs(message.createdAt).format('HH:mm') : ''}</TextTime>
                      <BubbleActions className="bubble-actions">
                        <Tooltip title={'复制提示词'} mouseEnterDelay={0.5}>
                          <ActionButton onClick={() => void handleCopy(textBlock.content, message.id)}>
                            {copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}
                          </ActionButton>
                        </Tooltip>
                      </BubbleActions>
                    </BubbleFooter>
                  </TextBubble>
                </BubbleWrap>
              )}
              {videoBlocks.map((block) => {
                if (block.status === MessageBlockStatus.ERROR) {
                  const error = block.error
                  return <ErrorCard key={block.id}>{`生成失败：${error?.message ?? '未知错误'}`}</ErrorCard>
                }
                if (block.status === MessageBlockStatus.PAUSED) {
                  return <PausedCard key={block.id}>{'已停止生成'}</PausedCard>
                }
                if (block.status !== MessageBlockStatus.SUCCESS) {
                  return (
                    <ProgressCard key={block.id}>
                      <Spin size="small" />
                      <ProgressText>{block.metadata?.progressText || '⏳ 排队中…'}</ProgressText>
                    </ProgressCard>
                  )
                }
                // SUCCESS：本地持久化地址优先，回退原始远程 URL
                const src = (block.metadata?.localUrl ?? block.metadata?.remoteUrl) as string | undefined
                if (!src) {
                  return <ErrorCard key={block.id}>{'视频地址缺失'}</ErrorCard>
                }
                const fileId = block.metadata?.fileId as string | undefined
                const fileName = block.metadata?.fileName as string | undefined
                const filePath = block.metadata?.filePath as string | undefined
                const linkToCopy = (block.metadata?.remoteUrl ?? src) as string
                // base64File 需要完整文件键（id+扩展名）：新消息直接用 fileName；旧消息从播放地址补扩展名
                const extFromSrc = src.match(/(\.[A-Za-z0-9]+)(?:\?|$)/)?.[1] ?? ''
                const fileKey = fileName ?? (fileId ? fileId + extFromSrc : undefined)
                return (
                  <VideoCard key={block.id}>
                    <VideoPlayer src={src} controls preload="metadata" />
                    <VideoActions className="video-actions">
                      <Tooltip title={'复制视频链接'} mouseEnterDelay={0.5}>
                        <ActionButton onClick={() => void handleCopy(linkToCopy, block.id)}>
                          {copiedId === block.id ? <Check size={14} /> : <Copy size={14} />}
                        </ActionButton>
                      </Tooltip>
                      <Tooltip title={'另存为…'} mouseEnterDelay={0.5}>
                        <ActionButton onClick={() => void handleSaveAs(fileKey, fileName, linkToCopy)}>
                          <Download size={14} />
                        </ActionButton>
                      </Tooltip>
                      {filePath && (
                        <Tooltip title={'打开所在文件夹'} mouseEnterDelay={0.5}>
                          <ActionButton onClick={() => void window.api.file.showInFolder(filePath)}>
                            <FolderOpen size={14} />
                          </ActionButton>
                        </Tooltip>
                      )}
                    </VideoActions>
                  </VideoCard>
                )
              })}
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

const VideoCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const VideoPlayer = styled.video`
  width: 100%;
  max-width: 640px;
  border-radius: 10px;
  background-color: #000;
  border: 0.5px solid var(--color-border);
`

const VideoActions = styled.div`
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;

  ${VideoCard}:hover & {
    opacity: 1;
  }
`

const ProgressCard = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-radius: 8px;
  border: 0.5px dashed var(--color-border);
  background-color: var(--color-background-soft);
  min-width: 260px;
`

const ProgressText = styled.span`
  font-size: 13px;
  color: var(--color-text-2);
`

const PausedCard = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  border: 0.5px solid var(--color-border);
  background-color: var(--color-background-soft);
  color: var(--color-text-3);
  font-size: 13px;
`

const ErrorCard = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  border: 0.5px solid var(--color-error, #d93026);
  background-color: var(--color-background-soft);
  color: var(--color-error, #d93026);
  font-size: 13px;
  max-width: 420px;
  word-break: break-word;
`

export default VideoContent
