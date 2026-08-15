import {
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  DeleteOutlined,
  FolderOutlined,
  NumberOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useMessageOperations } from '@renderer/hooks/useMessageOperations'
import type { MultiModelMessageStyle } from '@renderer/store/settings'
import type { Topic } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'
import { AssistantMessageStatus } from '@renderer/types/newMessage'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'
import { Button, Tooltip } from 'antd'
import type { FC } from 'react'
import { memo } from 'react'
import styled from 'styled-components'

import MessageGroupModelList from './MessageGroupModelList'
import MessageGroupSettings from './MessageGroupSettings'

interface Props {
  multiModelMessageStyle: MultiModelMessageStyle
  setMultiModelMessageStyle: (style: MultiModelMessageStyle) => void
  messages: Message[]
  selectMessageId: string
  setSelectedMessage: (message: Message) => void
  topic: Topic
}

const MessageGroupMenuBar: FC<Props> = ({
  multiModelMessageStyle,
  setMultiModelMessageStyle,
  messages,
  selectMessageId,
  setSelectedMessage,
  topic
}) => {
  const { deleteGroupMessages, regenerateAssistantMessage } = useMessageOperations(topic)
  const { assistant } = useAssistant(messages[0]?.assistantId)

  const handleDeleteGroup = async () => {
    const askId = messages[0]?.askId
    if (!askId) return

    window.modal.confirm({
      title: '删除分组消息',
      content: '删除分组消息会删除用户提问和所有助手的回答',
      centered: true,
      okButtonProps: {
        danger: true
      },
      okText: '删除',
      onOk: () => deleteGroupMessages(askId)
    })
  }

  const isFailedMessage = (m: Message) => {
    if (m.role !== 'assistant') return false
    const isError = (m.status || '').toLowerCase() === 'error'
    const content = getMainTextContent(m)
    const noContent = !content || content.trim().length === 0
    const noBlocks = !m.blocks || m.blocks.length === 0
    return isError || noContent || noBlocks
  }

  const isTransmittingMessage = (m: Message) => {
    if (m.role !== 'assistant') return false
    const status = m.status as AssistantMessageStatus
    return (
      status === AssistantMessageStatus.PROCESSING ||
      status === AssistantMessageStatus.PENDING ||
      status === AssistantMessageStatus.SEARCHING
    )
  }

  const hasFailedMessages = messages.some((m) => isFailedMessage(m) && !isTransmittingMessage(m))

  const handleRetryAll = async () => {
    const candidates = messages.filter((m) => isFailedMessage(m) && !isTransmittingMessage(m))

    for (const msg of candidates) {
      try {
        await regenerateAssistantMessage(msg, assistant)
      } catch (e) {
        // swallow per-item errors to continue others
      }
    }
  }

  const multiModelMessageStyleTextByLayout = {
    fold: '标签模式',
    vertical: '纵向堆叠',
    horizontal: '横向排列',
    grid: '卡片布局'
  } as const

  return (
    <GroupMenuBar $layout={multiModelMessageStyle} className="group-menu-bar">
      <HStack style={{ alignItems: 'center', flex: 1, overflow: 'hidden' }}>
        <LayoutContainer>
          {(['fold', 'vertical', 'horizontal', 'grid'] as const).map((layout) => (
            <Tooltip
              mouseEnterDelay={0.5}
              key={layout}
              title={'多模型回答样式' + ': ' + multiModelMessageStyleTextByLayout[layout]}>
              <LayoutOption
                $active={multiModelMessageStyle === layout}
                onClick={() => setMultiModelMessageStyle(layout)}>
                {layout === 'fold' ? (
                  <FolderOutlined />
                ) : layout === 'horizontal' ? (
                  <ColumnWidthOutlined />
                ) : layout === 'vertical' ? (
                  <ColumnHeightOutlined />
                ) : (
                  <NumberOutlined />
                )}
              </LayoutOption>
            </Tooltip>
          ))}
        </LayoutContainer>
        {multiModelMessageStyle === 'fold' && (
          <MessageGroupModelList
            messages={messages}
            selectMessageId={selectMessageId}
            setSelectedMessage={setSelectedMessage}
          />
        )}
        {multiModelMessageStyle === 'grid' && <MessageGroupSettings />}
      </HStack>
      {hasFailedMessages && (
        <Tooltip title={'重试出错的消息'} mouseEnterDelay={0.6}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleRetryAll}
            style={{ marginRight: 4 }}
          />
        </Tooltip>
      )}
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined style={{ color: 'var(--color-error)' }} />}
        onClick={handleDeleteGroup}
      />
    </GroupMenuBar>
  )
}

const GroupMenuBar = styled.div<{ $layout: MultiModelMessageStyle }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  margin: 8px 10px 16px;
  justify-content: space-between;
  overflow: hidden;
  border: 0.5px solid var(--color-border);
  height: 40px;
`

const LayoutContainer = styled.div`
  display: flex;
  gap: 4px;
  flex-direction: row;
`

const LayoutOption = styled.div<{ $active: boolean }>`
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: ${({ $active }) => ($active ? 'var(--color-background-soft)' : 'transparent')};

  &:hover {
    background-color: ${({ $active }) => ($active ? 'var(--color-background-soft)' : 'var(--color-hover)')};
  }
`

export default memo(MessageGroupMenuBar)
