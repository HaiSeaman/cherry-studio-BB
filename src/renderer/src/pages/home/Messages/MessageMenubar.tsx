// import { InfoCircleOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { CopyIcon, DeleteIcon, EditIcon, RefreshIcon } from '@renderer/components/Icons'
import ObsidianExportPopup from '@renderer/components/Popups/ObsidianExportPopup'
import { SelectChatModelPopup } from '@renderer/components/Popups/SelectModelPopup'
import { isEmbeddingModel, isRerankModel, isVisionModel } from '@renderer/config/models'
import type { MessageMenubarButtonId, MessageMenubarScope } from '@renderer/config/registry/messageMenubar'
import { DEFAULT_MESSAGE_MENUBAR_SCOPE, getMessageMenubarConfig } from '@renderer/config/registry/messageMenubar'
import { useMessageEditing } from '@renderer/context/MessageEditingContext'
import { useChatContext } from '@renderer/hooks/useChatContext'
import { useMessageOperations } from '@renderer/hooks/useMessageOperations'
import { useEnableDeveloperMode, useMessageStyle, useSettings } from '@renderer/hooks/useSettings'
import { useTemporaryValue } from '@renderer/hooks/useTemporaryValue'
import useTranslate from '@renderer/hooks/useTranslate'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { getMessageTitle } from '@renderer/services/MessagesService'
import { translateText } from '@renderer/services/TranslateService'
import type { RootState } from '@renderer/store'
import store, { useAppDispatch } from '@renderer/store'
import { messageBlocksSelectors } from '@renderer/store/messageBlock'
import { selectMessagesForTopic } from '@renderer/store/newMessage'
import { removeBlocksThunk } from '@renderer/store/thunk/messageThunk'
import type { Assistant, Model, Topic, TranslateLanguage } from '@renderer/types'
import { type Message, type MessageBlock, MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { captureScrollableAsBlob, captureScrollableAsDataURL, classNames } from '@renderer/utils'
import { abortCompletion } from '@renderer/utils/abortController'
import { copyMessageAsPlainText } from '@renderer/utils/copy'
import { isAbortError } from '@renderer/utils/error'
import {
  exportMarkdownToJoplin,
  exportMarkdownToSiyuan,
  exportMarkdownToYuque,
  exportMessageAsMarkdown,
  exportMessageToNotion,
  messageToMarkdown
} from '@renderer/utils/export'
// import { withMessageThought } from '@renderer/utils/formats'
import { removeTrailingDoubleSpaces } from '@renderer/utils/markdown'
import {
  findMainTextBlocks,
  findTranslationBlocks,
  findTranslationBlocksById,
  getMainTextContent
} from '@renderer/utils/messageUtils/find'
import type { MenuProps } from 'antd'
import { Dropdown, Popconfirm, Tooltip } from 'antd'
import dayjs from 'dayjs'
import {
  AtSign,
  Check,
  CirclePause,
  FilePenLine,
  Languages,
  ListChecks,
  Menu,
  Save,
  Split,
  ThumbsUp,
  Upload
} from 'lucide-react'
import type { Dispatch, FC, ReactNode, SetStateAction } from 'react'
import { Fragment, memo, useCallback, useMemo, useState } from 'react'
import { shallowEqual, useSelector } from 'react-redux'
import styled from 'styled-components'

import MessageTokens from './MessageTokens'

const createTranslationAbortKey = (messageId: string) => `translation-abort-key:${messageId}`

const abortTranslation = (messageId: string) => {
  abortCompletion(createTranslationAbortKey(messageId))
}

interface Props {
  message: Message
  assistant: Assistant
  topic: Topic
  model?: Model
  index?: number
  isGrouped?: boolean
  isLastMessage: boolean
  isAssistantMessage: boolean
  messageContainerRef: React.RefObject<HTMLDivElement>
  setModel: (model: Model) => void
  onUpdateUseful?: (msgId: string) => void
}

const logger = loggerService.withContext('MessageMenubar')

type MessageOperationsHandlers = ReturnType<typeof useMessageOperations>

type MessageMenubarButtonContext = {
  assistant: Assistant
  blockEntities: ReturnType<typeof messageBlocksSelectors.selectEntities>
  confirmDeleteMessage: boolean
  confirmRegenerateMessage: boolean
  copied: boolean
  deleteMessage: MessageOperationsHandlers['deleteMessage']
  dropdownItems: MenuProps['items']
  enableDeveloperMode: boolean
  handleResendUserMessage: (messageUpdate?: Message) => Promise<void>
  handleTranslate: (language: TranslateLanguage) => Promise<void>
  hasTranslationBlocks: boolean
  isAssistantMessage: boolean
  isBubbleStyle: boolean
  isGrouped?: boolean
  isLastMessage: boolean
  isTranslating: boolean
  isUserMessage: boolean
  message: Message
  onCopy: (e: React.MouseEvent) => void
  onEdit: () => void | Promise<void>
  onMentionModel: (e: React.MouseEvent) => void | Promise<void>
  onRegenerate: (e?: React.MouseEvent) => void | Promise<void>
  onUseful: (e: React.MouseEvent) => void
  removeMessageBlock: MessageOperationsHandlers['removeMessageBlock']
  setShowDeleteTooltip: Dispatch<SetStateAction<boolean>>
  showDeleteTooltip: boolean
  softHoverBg: boolean
  translateLanguages: TranslateLanguage[]
}

type MessageMenubarButtonRenderer = (ctx: MessageMenubarButtonContext) => ReactNode | null

const MessageMenubar: FC<Props> = (props) => {
  const {
    message,
    index,
    isGrouped,
    isLastMessage,
    isAssistantMessage,
    assistant,
    topic,
    model,
    messageContainerRef,
    onUpdateUseful
  } = props
  const { toggleMultiSelectMode } = useChatContext(props.topic)
  const [copied, setCopied] = useTemporaryValue(false, 2000)
  const translationAbortKey = createTranslationAbortKey(message.id)
  // remove confirm for regenerate; tooltip stays simple
  const [showDeleteTooltip, setShowDeleteTooltip] = useState(false)
  const { translateLanguages } = useTranslate()
  // const assistantModel = assistant?.model
  const {
    deleteMessage,
    resendMessage,
    regenerateAssistantMessage,
    getTranslationUpdater,
    appendAssistantResponse,
    removeMessageBlock
  } = useMessageOperations(topic)

  const { isBubbleStyle } = useMessageStyle()
  const { enableDeveloperMode } = useEnableDeveloperMode()
  const { confirmDeleteMessage, confirmRegenerateMessage } = useSettings()

  // const loading = useTopicLoading(topic)

  const isUserMessage = message.role === 'user'

  const exportMenuOptions = useSelector((state: RootState) => state.settings.exportMenuOptions)
  const dispatch = useAppDispatch()
  // const processedMessage = useMemo(() => {
  //   if (message.role === 'assistant' && message.model && isReasoningModel(message.model)) {
  //     return withMessageThought(message)
  //   }
  //   return message
  // }, [message])

  const mainTextContent = useMemo(() => {
    // 只处理助手消息和来自推理模型的消息
    // if (message.role === 'assistant' && message.model && isReasoningModel(message.model)) {
    // return getMainTextContent(withMessageThought(message))
    // }
    return getMainTextContent(message)
  }, [message])

  const onCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      const currentMessageId = message.id // from props
      const latestMessageEntity = store.getState().messages.entities[currentMessageId]

      let contentToCopy = ''
      if (latestMessageEntity) {
        contentToCopy = getMainTextContent(latestMessageEntity)
      } else {
        contentToCopy = getMainTextContent(message)
      }

      void navigator.clipboard.writeText(removeTrailingDoubleSpaces(contentToCopy.trimStart()))

      window.toast.success('已复制')
      setCopied(true)
    },
    [message, setCopied]
  )

  const onNewBranch = useCallback(async () => {
    void EventEmitter.emit(EVENT_NAMES.NEW_BRANCH, index)
    window.toast.success('新分支已创建')
  }, [index])

  const handleResendUserMessage = useCallback(
    async (messageUpdate?: Message) => {
      await resendMessage(messageUpdate ?? message, assistant)
    },
    [assistant, message, resendMessage]
  )

  const { startEditing } = useMessageEditing()

  const onEdit = useCallback(async () => {
    startEditing(message.id)
  }, [message.id, startEditing])

  // 按本消息的块订阅：整表订阅会让任意块的流式更新重渲染全部消息的菜单栏
  const blockEntities = useSelector((state: RootState) => {
    const entities = messageBlocksSelectors.selectEntities(state)
    const subset: Record<string, MessageBlock> = {}
    for (const id of message.blocks) {
      const block = entities[id]
      if (block) subset[id] = block
    }
    return subset
  }, shallowEqual)

  const isTranslating = useMemo(() => {
    const translationBlock = message.blocks
      .map((blockId) => blockEntities[blockId])
      .find((block) => block?.type === MessageBlockType.TRANSLATION)
    return (
      translationBlock?.status === MessageBlockStatus.STREAMING ||
      translationBlock?.status === MessageBlockStatus.PROCESSING
    )
  }, [message.blocks, blockEntities])

  const handleTranslate = useCallback(
    async (language: TranslateLanguage) => {
      if (isTranslating) return

      const messageId = message.id
      const translationUpdater = await getTranslationUpdater(messageId, language.langCode)
      if (!translationUpdater) return

      try {
        await translateText(mainTextContent, language, translationUpdater, translationAbortKey)
      } catch (error) {
        if (!isAbortError(error)) {
          window.toast.error('翻译失败')
        }
        const translationBlocks = findTranslationBlocksById(message.id)
        logger.silly(`there are ${translationBlocks.length} translation blocks`)
        if (translationBlocks.length > 0) {
          const block = translationBlocks[0]
          logger.silly(`block`, block)
          if (!block.content) {
            void dispatch(removeBlocksThunk(message.topicId, message.id, [block.id]))
          }
        }
      }
    },
    [isTranslating, message.topicId, message.id, getTranslationUpdater, mainTextContent, translationAbortKey, dispatch]
  )

  const menubarScope: MessageMenubarScope = topic?.type ?? DEFAULT_MESSAGE_MENUBAR_SCOPE
  const { buttonIds, dropdownRootAllowKeys } = getMessageMenubarConfig(menubarScope)

  const isEditable = useMemo(() => {
    return findMainTextBlocks(message).length > 0 // 使用 MCP Server 后会有大于一段 MatinTextBlock
  }, [message])

  const dropdownItems = useMemo(() => {
    const items: MenuProps['items'] = [
      ...(isEditable
        ? [
            {
              label: '编辑',
              key: 'edit',
              icon: <FilePenLine size={15} />,
              onClick: onEdit
            }
          ]
        : []),
      {
        label: '分支',
        key: 'new-branch',
        icon: <Split size={15} />,
        onClick: onNewBranch
      },
      {
        label: '多选',
        key: 'multi-select',
        icon: <ListChecks size={15} />,
        onClick: () => {
          toggleMultiSelectMode(true)
        }
      },
      {
        label: '保存',
        key: 'save',
        icon: <Save size={15} />,
        children: [
          {
            label: '保存到本地文件',
            key: 'file',
            onClick: () => {
              const fileName = dayjs(message.createdAt).format('YYYYMMDDHHmm') + '.md'
              void window.api.file.save(fileName, mainTextContent)
            }
          }
        ]
      },
      {
        label: '导出',
        key: 'export',
        icon: <Upload size={15} />,
        children: [
          exportMenuOptions.plain_text && {
            label: '复制为纯文本（去除 Markdown）',
            key: 'copy_message_plain_text',
            onClick: () => copyMessageAsPlainText(message)
          },
          exportMenuOptions.image && {
            label: '复制为图片',
            key: 'img',
            onClick: async () => {
              await captureScrollableAsBlob(messageContainerRef, async (blob) => {
                if (blob) {
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                }
              })
            }
          },
          exportMenuOptions.image && {
            label: '导出为图片',
            key: 'image',
            onClick: async () => {
              const imageData = await captureScrollableAsDataURL(messageContainerRef)
              const title = await getMessageTitle(message)
              if (title && imageData) {
                const success = await window.api.file.saveImage(title, imageData)
                if (success) window.toast.success('图片保存成功')
              }
            }
          },
          exportMenuOptions.markdown && {
            label: '导出为 Markdown',
            key: 'markdown',
            onClick: () => exportMessageAsMarkdown(message)
          },
          exportMenuOptions.markdown_reason && {
            label: '导出为 Markdown (包含思考)',
            key: 'markdown_reason',
            onClick: () => exportMessageAsMarkdown(message, true)
          },
          exportMenuOptions.docx && {
            label: '导出为 Word',
            key: 'word',
            onClick: async () => {
              const markdown = messageToMarkdown(message)
              const title = await getMessageTitle(message)
              void window.api.export.toWord(markdown, title)
            }
          },
          exportMenuOptions.notion && {
            label: '导出到 Notion',
            key: 'notion',
            onClick: async () => {
              const title = await getMessageTitle(message)
              const markdown = messageToMarkdown(message)
              void exportMessageToNotion(title, markdown, message)
            }
          },
          exportMenuOptions.yuque && {
            label: '导出到语雀',
            key: 'yuque',
            onClick: async () => {
              const title = await getMessageTitle(message)
              const markdown = messageToMarkdown(message)
              void exportMarkdownToYuque(title, markdown)
            }
          },
          exportMenuOptions.obsidian && {
            label: '导出到 Obsidian',
            key: 'obsidian',
            onClick: async () => {
              const title = topic.name?.replace(/\\/g, '_') || 'Untitled'
              await ObsidianExportPopup.show({ title, message, processingMethod: '1' })
            }
          },
          exportMenuOptions.joplin && {
            label: '导出到 Joplin',
            key: 'joplin',
            onClick: async () => {
              const title = await getMessageTitle(message)
              void exportMarkdownToJoplin(title, message)
            }
          },
          exportMenuOptions.siyuan && {
            label: '导出到思源笔记',
            key: 'siyuan',
            onClick: async () => {
              const title = await getMessageTitle(message)
              const markdown = messageToMarkdown(message)
              void exportMarkdownToSiyuan(title, markdown)
            }
          }
        ].filter(Boolean)
      }
    ].filter(Boolean)

    if (!dropdownRootAllowKeys || dropdownRootAllowKeys.length === 0) {
      return items
    }

    const allowSet = new Set(dropdownRootAllowKeys)
    return items.filter((item) => {
      if (!item || typeof item !== 'object') {
        return false
      }
      if ('type' in item && item.type === 'divider') {
        return false
      }
      if ('key' in item && item.key) {
        return allowSet.has(String(item.key))
      }
      return false
    })
  }, [
    dropdownRootAllowKeys,
    exportMenuOptions.docx,
    exportMenuOptions.image,
    exportMenuOptions.joplin,
    exportMenuOptions.markdown,
    exportMenuOptions.markdown_reason,
    exportMenuOptions.notion,
    exportMenuOptions.obsidian,
    exportMenuOptions.plain_text,
    exportMenuOptions.siyuan,
    exportMenuOptions.yuque,
    isEditable,
    mainTextContent,
    message,
    messageContainerRef,
    onEdit,
    onNewBranch,
    toggleMultiSelectMode,
    topic.name
  ])

  const onRegenerate = async (e: React.MouseEvent | undefined) => {
    e?.stopPropagation?.()
    // No need to reset or edit the message anymore
    // const selectedModel = isGrouped ? model : assistantModel
    // const _message = resetAssistantMessage(message, selectedModel)
    // editMessage(message.id, { ..._message }) // REMOVED

    // Call the function from the hook
    void regenerateAssistantMessage(message, assistant)
  }

  // 按条件筛选能够提及的模型，该函数仅在isAssistantMessage时会用到
  const mentionModelFilter = useMemo(() => {
    const defaultFilter = (model: Model) => !isEmbeddingModel(model) && !isRerankModel(model)

    if (!isAssistantMessage) {
      return defaultFilter
    }
    const state = store.getState()
    const topicMessages: Message[] = selectMessagesForTopic(state, topic.id)
    // 理论上助手消息只会关联一条用户消息
    const relatedUserMessage = topicMessages.find((msg) => {
      return msg.role === 'user' && message.askId === msg.id
    })
    // 无关联用户消息时，默认返回所有模型
    if (!relatedUserMessage) {
      return defaultFilter
    }

    const relatedUserMessageBlocks = relatedUserMessage.blocks.map((msgBlockId) =>
      messageBlocksSelectors.selectById(store.getState(), msgBlockId)
    )

    if (!relatedUserMessageBlocks) {
      return defaultFilter
    }

    if (relatedUserMessageBlocks.some((block) => block && block.type === MessageBlockType.IMAGE)) {
      return (m: Model) => isVisionModel(m) && defaultFilter(m)
    } else {
      return defaultFilter
    }
  }, [isAssistantMessage, message.askId, topic.id])

  const onMentionModel = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const selectedModel = await SelectChatModelPopup.show({ model, filter: mentionModelFilter })
      if (!selectedModel) return
      void appendAssistantResponse(message, selectedModel, { ...assistant, model: selectedModel })
    },
    [appendAssistantResponse, assistant, mentionModelFilter, message, model]
  )

  const onUseful = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onUpdateUseful?.(message.id)
    },
    [message.id, onUpdateUseful]
  )

  const hasTranslationBlocks = useMemo(() => {
    const translationBlocks = findTranslationBlocks(message)
    return translationBlocks.length > 0
  }, [message])

  const softHoverBg = isBubbleStyle && isUserMessage && !isLastMessage
  const isUserBubbleStyleMessage = isBubbleStyle && isUserMessage
  const showMessageTokens = !isBubbleStyle || isAssistantMessage || isUserBubbleStyleMessage

  const buttonContext: MessageMenubarButtonContext = {
    assistant,
    blockEntities,
    confirmDeleteMessage,
    confirmRegenerateMessage,
    copied,
    deleteMessage,
    dropdownItems,
    enableDeveloperMode,
    handleResendUserMessage,
    handleTranslate,
    hasTranslationBlocks,
    isAssistantMessage,
    isBubbleStyle,
    isGrouped,
    isLastMessage,
    isTranslating,
    isUserMessage,
    message,
    onCopy,
    onEdit,
    onMentionModel,
    onRegenerate,
    onUseful,
    removeMessageBlock,
    setShowDeleteTooltip,
    showDeleteTooltip,
    softHoverBg,
    translateLanguages
  }

  return (
    <>
      {showMessageTokens && (
        <FooterMetadata className="message-footer-metadata">
          {isUserBubbleStyleMessage && (
            <MessageTime>{dayjs(message?.updatedAt ?? message.createdAt).format('MM/DD HH:mm')}</MessageTime>
          )}
          <MessageTokens message={message} />
        </FooterMetadata>
      )}
      <MenusBar
        className={classNames({ menubar: true, show: isLastMessage, 'user-bubble-style': isUserBubbleStyleMessage })}>
        {buttonIds.map((buttonId) => {
          const renderFn = buttonRenderers[buttonId]
          if (!renderFn) {
            logger.warn(`No renderer registered for MessageMenubar button id: ${buttonId}`)
            return null
          }
          const element = renderFn(buttonContext)
          if (!element) {
            return null
          }
          return <Fragment key={buttonId}>{element}</Fragment>
        })}
      </MenusBar>
    </>
  )
}

const FooterMetadata = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  line-height: 26px;
  min-width: 0;

  .message-tokens {
    display: flex;
    align-items: center;
    height: 26px;
    line-height: 26px;
  }
`

const MessageTime = styled.div`
  flex-shrink: 0;
  font-size: 10px;
  height: 26px;
  line-height: 26px;
  color: var(--color-text-3);
`

const MenusBar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
`

const ActionButton = styled.div<{ $softHoverBg?: boolean }>`
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 26px;
  height: 26px;
  transition: all 0.2s ease;
  &:hover {
    background-color: ${(props) =>
      props.$softHoverBg ? 'var(--color-background-soft)' : 'var(--color-background-mute)'};
    color: var(--color-text-1);
    .anticon,
    .lucide {
      color: var(--color-text-1);
    }
  }
  .anticon,
  .iconfont {
    cursor: pointer;
    font-size: 14px;
    color: var(--color-icon);
  }
  .icon-at {
    font-size: 16px;
  }
`

const buttonRenderers: Record<MessageMenubarButtonId, MessageMenubarButtonRenderer> = {
  'user-regenerate': ({
    message,
    confirmRegenerateMessage,
    handleResendUserMessage,
    setShowDeleteTooltip,
    isBubbleStyle
  }) => {
    if (message.role !== 'user') {
      return null
    }

    if (confirmRegenerateMessage) {
      return (
        <Popconfirm
          title={'重新生成会覆盖当前消息'}
          okButtonProps={{ danger: true }}
          onConfirm={() => handleResendUserMessage()}
          onOpenChange={(open) => open && setShowDeleteTooltip(false)}>
          <Tooltip title={'重新生成'} mouseEnterDelay={0.8}>
            <ActionButton
              className="message-action-button"
              onClick={(e) => e.stopPropagation()}
              $softHoverBg={isBubbleStyle}>
              <RefreshIcon size={15} />
            </ActionButton>
          </Tooltip>
        </Popconfirm>
      )
    }

    return (
      <Tooltip title={'重新生成'} mouseEnterDelay={0.8}>
        <ActionButton
          className="message-action-button"
          onClick={() => handleResendUserMessage()}
          $softHoverBg={isBubbleStyle}>
          <RefreshIcon size={15} />
        </ActionButton>
      </Tooltip>
    )
  },
  'user-edit': ({ message, onEdit, softHoverBg }) => {
    if (message.role !== 'user') {
      return null
    }

    return (
      <Tooltip title={'编辑'} mouseEnterDelay={0.8}>
        <ActionButton className="message-action-button" onClick={onEdit} $softHoverBg={softHoverBg}>
          <EditIcon size={15} />
        </ActionButton>
      </Tooltip>
    )
  },
  copy: ({ onCopy, softHoverBg, copied }) => (
    <Tooltip title={'复制'} mouseEnterDelay={0.8}>
      <ActionButton className="message-action-button" onClick={onCopy} $softHoverBg={softHoverBg}>
        {!copied && <CopyIcon size={15} />}
        {copied && <Check size={15} color="var(--color-primary)" />}
      </ActionButton>
    </Tooltip>
  ),
  'assistant-regenerate': ({
    isAssistantMessage,
    confirmRegenerateMessage,
    onRegenerate,
    setShowDeleteTooltip,
    softHoverBg
  }) => {
    if (!isAssistantMessage) {
      return null
    }

    if (confirmRegenerateMessage) {
      return (
        <Popconfirm
          title={'重新生成会覆盖当前消息'}
          okButtonProps={{ danger: true }}
          onConfirm={() => onRegenerate()}
          onOpenChange={(open) => open && setShowDeleteTooltip(false)}>
          <Tooltip title={'重新生成'} mouseEnterDelay={0.8}>
            <ActionButton
              className="message-action-button"
              onClick={(e) => e.stopPropagation()}
              $softHoverBg={softHoverBg}>
              <RefreshIcon size={15} />
            </ActionButton>
          </Tooltip>
        </Popconfirm>
      )
    }

    return (
      <Tooltip title={'重新生成'} mouseEnterDelay={0.8}>
        <ActionButton className="message-action-button" onClick={onRegenerate} $softHoverBg={softHoverBg}>
          <RefreshIcon size={15} />
        </ActionButton>
      </Tooltip>
    )
  },
  'assistant-mention-model': ({ isAssistantMessage, onMentionModel, softHoverBg }) => {
    if (!isAssistantMessage) {
      return null
    }

    return (
      <Tooltip title={'切换模型回答'} mouseEnterDelay={0.8}>
        <ActionButton className="message-action-button" onClick={onMentionModel} $softHoverBg={softHoverBg}>
          <AtSign size={15} />
        </ActionButton>
      </Tooltip>
    )
  },
  translate: ({
    isUserMessage,
    isTranslating,
    translateLanguages,
    handleTranslate,
    hasTranslationBlocks,
    message,
    blockEntities,
    removeMessageBlock,
    softHoverBg
  }) => {
    if (isUserMessage) {
      return null
    }

    if (isTranslating) {
      return (
        <Tooltip title={'停止翻译'} mouseEnterDelay={0.8}>
          <ActionButton
            className="message-action-button"
            onClick={(e) => {
              e.stopPropagation()
              abortTranslation(message.id)
            }}
            $softHoverBg={softHoverBg}>
            <CirclePause size={15} />
          </ActionButton>
        </Tooltip>
      )
    }

    const items: MenuProps['items'] = [
      ...translateLanguages.map((item) => ({
        label: item.emoji + ' ' + item.label(),
        key: item.langCode,
        onClick: () => handleTranslate(item)
      })),
      ...(hasTranslationBlocks
        ? [
            { type: 'divider' as const },
            {
              label: '📋 ' + '复制',
              key: 'translate-copy',
              onClick: () => {
                const translationBlocks = message.blocks
                  .map((blockId) => blockEntities[blockId])
                  .filter((block) => block?.type === 'translation')

                if (translationBlocks.length > 0) {
                  const translationContent = translationBlocks
                    .map((block) => block?.content || '')
                    .join('\n\n')
                    .trim()

                  if (translationContent) {
                    void navigator.clipboard.writeText(translationContent)
                    window.toast.success('翻译内容已复制')
                  } else {
                    window.toast.warning('翻译内容为空')
                  }
                }
              }
            },
            {
              label: '✖ ' + '关闭',
              key: 'translate-close',
              onClick: () => {
                const translationBlocks = message.blocks
                  .map((blockId) => blockEntities[blockId])
                  .filter((block) => block?.type === 'translation')
                  .map((block) => block?.id)

                if (translationBlocks.length > 0) {
                  translationBlocks.forEach((blockId) => {
                    if (blockId) {
                      void removeMessageBlock(message.id, blockId)
                    }
                  })
                  window.toast.success('翻译已关闭')
                }
              }
            }
          ]
        : [])
    ]

    return (
      <Dropdown
        menu={{
          style: {
            maxHeight: 250,
            overflowY: 'auto',
            backgroundClip: 'border-box'
          },
          items,
          onClick: (e) => e.domEvent.stopPropagation()
        }}
        trigger={['click']}
        placement="top"
        arrow>
        <Tooltip title={'翻译'} mouseEnterDelay={1.2}>
          <ActionButton
            className="message-action-button"
            onClick={(e) => e.stopPropagation()}
            $softHoverBg={softHoverBg}>
            <Languages size={15} />
          </ActionButton>
        </Tooltip>
      </Dropdown>
    )
  },
  useful: ({ isAssistantMessage, isGrouped, onUseful, softHoverBg, message }) => {
    if (!isAssistantMessage || !isGrouped) {
      return null
    }

    return (
      <Tooltip title={'设置为上下文'} mouseEnterDelay={0.8}>
        <ActionButton className="message-action-button" onClick={onUseful} $softHoverBg={softHoverBg}>
          {message.useful ? (
            <ThumbsUp size={17.5} fill="var(--color-primary)" strokeWidth={0} />
          ) : (
            <ThumbsUp size={15} />
          )}
        </ActionButton>
      </Tooltip>
    )
  },
  delete: ({ confirmDeleteMessage, deleteMessage, message, setShowDeleteTooltip, showDeleteTooltip, softHoverBg }) => {
    const deleteTooltip = (
      <Tooltip title={'删除'} mouseEnterDelay={1} open={showDeleteTooltip} onOpenChange={setShowDeleteTooltip}>
        <DeleteIcon size={15} />
      </Tooltip>
    )

    const handleDeleteMessage = async () => {
      abortTranslation(message.id)
      await deleteMessage(message.id)
    }

    if (confirmDeleteMessage) {
      return (
        <Popconfirm
          title={'确定要删除此消息吗？'}
          okButtonProps={{ danger: true }}
          onConfirm={async () => await handleDeleteMessage()}
          onOpenChange={(open) => open && setShowDeleteTooltip(false)}>
          <ActionButton
            className="message-action-button"
            onClick={(e) => e.stopPropagation()}
            $softHoverBg={softHoverBg}>
            {deleteTooltip}
          </ActionButton>
        </Popconfirm>
      )
    }

    return (
      <ActionButton
        className="message-action-button"
        onClick={async (e) => {
          e.stopPropagation()
          await handleDeleteMessage()
        }}
        $softHoverBg={softHoverBg}>
        {deleteTooltip}
      </ActionButton>
    )
  },
  'more-menu': ({ isUserMessage, dropdownItems, softHoverBg }) => {
    if (isUserMessage) {
      return null
    }

    return (
      <Dropdown
        menu={{ items: dropdownItems, onClick: (e) => e.domEvent.stopPropagation() }}
        trigger={['click']}
        placement="topRight">
        <ActionButton className="message-action-button" onClick={(e) => e.stopPropagation()} $softHoverBg={softHoverBg}>
          <Menu size={19} />
        </ActionButton>
      </Dropdown>
    )
  }
}

export default memo(MessageMenubar)
