import { loggerService } from '@logger'
import { isMac } from '@renderer/config/constant'
import { isVisionModel } from '@renderer/config/models'
import { builtinLanguages } from '@renderer/config/translate'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useSettings } from '@renderer/hooks/useSettings'
import { fetchChatCompletion } from '@renderer/services/ApiService'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { ConversationService } from '@renderer/services/ConversationService'
import FileManager from '@renderer/services/FileManager'
import { getAssistantMessage, getUserMessage, safeDeleteFiles } from '@renderer/services/MessagesService'
import store, { useAppSelector } from '@renderer/store'
import {
  messageBlocksSelectors,
  removeAllBlocks,
  updateOneBlock,
  upsertManyBlocks,
  upsertOneBlock
} from '@renderer/store/messageBlock'
import { newMessagesActions, selectMessagesForTopic } from '@renderer/store/newMessage'
import { cancelThrottledBlockUpdate, throttledBlockUpdate } from '@renderer/store/thunk/messageThunk'
import type { FileMetadata, Topic } from '@renderer/types'
import { ThemeMode } from '@renderer/types'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'
import type { FileMessageBlock, ImageMessageBlock } from '@renderer/types/newMessage'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { abortCompletion } from '@renderer/utils/abortController'
import { isAbortError } from '@renderer/utils/error'
import { createMainTextBlock, createThinkingBlock } from '@renderer/utils/messageUtils/create'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'
import { replacePromptVariables } from '@renderer/utils/prompt'
import type { ScreenshotAction } from '@renderer/utils/screenshot'
import { DEFAULT_TARGET_LANGUAGE, getScreenshotActionPrompt } from '@renderer/utils/screenshot'
import { IpcChannel } from '@shared/IpcChannel'
import { Divider } from 'antd'
import { cloneDeep, isEmpty } from 'lodash'
import { last } from 'lodash'
import type { FC } from 'react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import ChatWindow from '../chat/ChatWindow'
import TranslateWindow from '../translate/TranslateWindow'
import ClipboardPreview from './components/ClipboardPreview'
import type { FeatureMenusRef } from './components/FeatureMenus'
import FeatureMenus from './components/FeatureMenus'
import Footer from './components/Footer'
import InputBar from './components/InputBar'

const logger = loggerService.withContext('HomeWindow')

/**
 * 收集某话题下所有消息引用的文件（图片/附件块 + 生成图），
 * 供 Esc 清空话题时一并回收，避免上传的截图在文件库与磁盘上永久残留。
 * 与主窗口删除话题时的文件回收逻辑（useTopic）保持一致。
 */
function collectTopicFiles(topicId: string): FileMetadata[] {
  const state = store.getState()
  const messages = selectMessagesForTopic(state, topicId)
  const blockIds = messages.flatMap((message) => message.blocks ?? [])

  return blockIds
    .map((blockId) => messageBlocksSelectors.selectById(state, blockId))
    .filter(
      (block): block is ImageMessageBlock | FileMessageBlock =>
        block !== undefined && (block.type === MessageBlockType.IMAGE || block.type === MessageBlockType.FILE)
    )
    .flatMap((block) => {
      const generatedFiles = block.type === MessageBlockType.IMAGE ? (block.metadata?.generatedFiles ?? []) : []
      return [block.file, ...generatedFiles]
    })
    .filter((file): file is FileMetadata => file !== undefined)
}

const HomeWindow: FC<{ draggable?: boolean }> = ({ draggable = true }) => {
  const { readClipboardAtStartup, windowStyle, language } = useSettings()
  const { theme } = useTheme()
  const [route, setRoute] = useState<'home' | 'chat' | 'translate' | 'summary' | 'explanation'>('home')
  const [isFirstMessage, setIsFirstMessage] = useState(true)

  const [userInputText, setUserInputText] = useState('')
  const [files, setFiles] = useState<FileMetadata[]>([])

  const [clipboardText, setClipboardText] = useState('')
  const lastClipboardTextRef = useRef<string | null>(null)

  const [isPinned, setIsPinned] = useState(false)

  // Indicator for loading(thinking/streaming)
  const [isLoading, setIsLoading] = useState(false)
  // Indicator for whether the first message is outputted
  const [isOutputted, setIsOutputted] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const { quickAssistantId } = useAppSelector((state) => state.llm)
  const { assistant: currentAssistant } = useAssistant(quickAssistantId)

  const currentTopic = useRef<Topic>(getDefaultTopic(currentAssistant.id))
  const currentAskId = useRef('')

  const inputBarRef = useRef<HTMLDivElement>(null)
  const featureMenusRef = useRef<FeatureMenusRef>(null)

  const referenceText = useMemo(() => clipboardText || userInputText, [clipboardText, userInputText])

  // 翻译目标语言中文名：优先用界面语言映射，取不到时回退默认
  const targetLanguage = useMemo(() => {
    const lang = builtinLanguages.find((l) => l.langCode === language.toLowerCase())
    return lang?.label() ?? DEFAULT_TARGET_LANGUAGE
  }, [language])

  const userContent = useMemo(() => {
    if (isFirstMessage) {
      return referenceText === userInputText ? userInputText : `${referenceText}\n\n${userInputText}`.trim()
    }
    return userInputText.trim()
  }, [isFirstMessage, referenceText, userInputText])

  // Reset state when switching to home route
  useEffect(() => {
    if (route === 'home') {
      setIsFirstMessage(true)
      setError(null)
    }
  }, [route])

  const focusInput = useCallback(() => {
    if (inputBarRef.current) {
      const input = inputBarRef.current.querySelector('input')
      if (input) {
        input.focus()
      }
    }
  }, [])

  // Use useCallback with stable dependencies to avoid infinite loops
  const readClipboard = useCallback(async () => {
    if (!readClipboardAtStartup || !document.hasFocus()) return

    try {
      const text = await navigator.clipboard.readText()
      if (text && text !== lastClipboardTextRef.current) {
        lastClipboardTextRef.current = text
        setClipboardText(text.trim())
      }
    } catch (error) {
      // Silently handle clipboard read errors (common in some environments)
      logger.warn('Failed to read clipboard:', error as Error)
    }
  }, [readClipboardAtStartup])

  const clearClipboard = useCallback(async () => {
    setClipboardText('')
    lastClipboardTextRef.current = null
    focusInput()
  }, [focusInput])

  // Bridge to handleSendMessage defined later in the component (avoids TDZ in useCallback deps).
  const handleSendMessageRef = useRef<((prompt?: string, filesOverride?: FileMetadata[]) => Promise<void>) | undefined>(
    undefined
  )

  // Pull a pending screenshot from main (set by ScreenshotService on capture confirm)
  // and insert it into the input bar as an image attachment. When the screenshot comes
  // from the toolbar "ocr/translate" buttons, auto-send to the AI without confirmation.
  const consumeScreenshot = useCallback(async () => {
    try {
      const result = await window.api.miniWindow.consumeScreenshot()
      if (!result) return

      const { buffer, action } = result as { buffer: Uint8Array; action: ScreenshotAction | null }

      const tempFilePath = await window.api.file.createTempFile('screenshot.png')
      await window.api.file.write(tempFilePath, new Uint8Array(buffer))
      const file = await window.api.file.get(tempFilePath)
      if (!file) return

      if (action) {
        if (isLoading) {
          // a reply is already streaming; keep the image in the input bar instead of queueing
          setFiles((prev) => [...prev, file])
          return
        }
        if (!isVisionModel(currentAssistant.model)) {
          // keep the image in the input bar so the user can act on it manually
          setFiles((prev) => [...prev, file])
          window.toast.error('当前模型不支持图片识别，请在设置中切换支持视觉的模型')
          return
        }
        // switch to chat route so the streaming reply is visible
        setRoute('chat')
        await handleSendMessageRef.current?.(getScreenshotActionPrompt(action, targetLanguage), [file])
      } else {
        setFiles((prev) => [...prev, file])
      }
    } catch (error) {
      logger.warn('Failed to consume screenshot:', error as Error)
    }
  }, [isLoading, targetLanguage, currentAssistant])

  // Paste an image from the clipboard into the input bar (e.g. copied from another app).
  // Returns true when an image was actually inserted (caller may preventDefault the paste).
  const handlePasteImage = useCallback(async (): Promise<boolean> => {
    try {
      const buffer = await window.api.miniWindow.readClipboardImage()
      if (!buffer || buffer.length === 0) return false

      const tempFilePath = await window.api.file.createTempFile('clipboard.png')
      await window.api.file.write(tempFilePath, new Uint8Array(buffer))
      const file = await window.api.file.get(tempFilePath)
      if (file) {
        setFiles((prev) => [...prev, file])
        return true
      }
      return false
    } catch (error) {
      logger.warn('Failed to paste image from clipboard:', error as Error)
      return false
    }
  }, [])

  // Screenshot quick actions in the input bar: auto-send the attached image to the AI.
  const handleScreenshotAction = useCallback(
    (action: ScreenshotAction) => {
      if (isLoading || files.length === 0) return
      if (!isVisionModel(currentAssistant.model)) {
        window.toast.error('当前模型不支持图片识别，请在设置中切换支持视觉的模型')
        return
      }
      // switch to chat route so the streaming reply is visible
      setRoute('chat')
      void handleSendMessageRef.current?.(getScreenshotActionPrompt(action, targetLanguage), files)
    },
    [isLoading, files, currentAssistant, targetLanguage]
  )

  const onWindowShow = useCallback(async () => {
    await readClipboard()
    await consumeScreenshot()
    focusInput()
  }, [readClipboard, consumeScreenshot, focusInput])

  useEffect(() => {
    void window.api.miniWindow.setPin(isPinned)
  }, [isPinned])

  useEffect(() => {
    const cleanup = window.electron.ipcRenderer.on(IpcChannel.ShowMiniWindow, onWindowShow)
    return () => {
      // 用 on() 返回的精准清理函数：removeAllListeners 会把该通道的所有监听一并摘除，
      // 会误伤同窗口其他模块注册的同通道监听
      cleanup()
    }
  }, [onWindowShow])

  useEffect(() => {
    void readClipboard()
  }, [readClipboard])

  const handleCloseWindow = useCallback(() => window.api.miniWindow.hide(), [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 使用非直接输入法时（例如中文、日文输入法），存在输入法键入过程
    // 键入过程不应有任何响应
    // 例子，中文输入法候选词过程使用`Enter`直接上屏字母，日文输入法候选词过程使用`Enter`输入假名
    // 输入法可以`Esc`终止候选词过程
    // 这两个例子的`Enter`和`Esc`快捷助手都不应该响应
    if (e.nativeEvent.isComposing || e.key === 'Process') {
      return
    }

    switch (e.code) {
      case 'Enter':
      case 'NumpadEnter':
        {
          if (isLoading) return

          e.preventDefault()
          if (userContent) {
            if (route === 'home') {
              featureMenusRef.current?.useFeature()
            } else {
              // Currently text input is only available in 'chat' mode
              setRoute('chat')
              void handleSendMessage()
              focusInput()
            }
          }
        }
        break
      case 'Backspace':
        {
          if (userInputText.length === 0) {
            void clearClipboard()
          }
        }
        break
      case 'ArrowUp':
        {
          if (route === 'home') {
            e.preventDefault()
            featureMenusRef.current?.prevFeature()
          }
        }
        break
      case 'ArrowDown':
        {
          if (route === 'home') {
            e.preventDefault()
            featureMenusRef.current?.nextFeature()
          }
        }
        break
      case 'Escape':
        {
          handleEsc()
        }
        break
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserInputText(e.target.value)
  }

  const handleError = (error: Error) => {
    setIsLoading(false)
    setError(error.message)
  }

  const handleSendMessage = useCallback(
    async (prompt?: string, filesOverride?: FileMetadata[]) => {
      if ((isEmpty(userContent) && !prompt) || !currentTopic.current) {
        return
      }

      try {
        const topicId = currentTopic.current.id
        const filesToSend = filesOverride ?? files

        // 与主窗口一致：发送前把附件上传进文件库（filesPath/<id><ext>）。
        // 截图/剪贴板图片原本只是临时文件（path 指向 tempDir），若直接作为消息附件，
        // 聊天里 ImageBlock 会按 `file://<filesPath>/<id><ext>` 渲染而找不到文件，
        // 导致图片无法显示。上传后 id/path 与磁盘实际文件一一对应。
        const uploadedFiles = filesToSend.length > 0 ? await FileManager.uploadFiles(filesToSend) : []

        const { message: userMessage, blocks } = getUserMessage({
          content: [prompt, userContent].filter(Boolean).join('\n\n'),
          assistant: currentAssistant,
          topic: currentTopic.current,
          files: uploadedFiles
        })

        store.dispatch(newMessagesActions.addMessage({ topicId, message: userMessage }))
        store.dispatch(upsertManyBlocks(blocks))

        const assistantMessage = getAssistantMessage({
          assistant: currentAssistant,
          topic: currentTopic.current
        })
        assistantMessage.askId = userMessage.id
        currentAskId.current = userMessage.id

        store.dispatch(newMessagesActions.addMessage({ topicId, message: assistantMessage }))

        const allMessagesForTopic = selectMessagesForTopic(store.getState(), topicId)
        const userMessageIndex = allMessagesForTopic.findIndex((m) => m?.id === userMessage.id)

        const messagesForContext = allMessagesForTopic
          .slice(0, userMessageIndex + 1)
          .filter((m) => m && !m.status?.includes('ing'))

        let blockId: string | null = null
        let thinkingBlockId: string | null = null
        let thinkingStartTime: number | null = null

        const resolveThinkingDuration = (duration?: number) => {
          if (typeof duration === 'number' && Number.isFinite(duration)) {
            return duration
          }
          if (thinkingStartTime !== null) {
            return Math.max(0, performance.now() - thinkingStartTime)
          }
          return 0
        }

        setIsLoading(true)
        setIsOutputted(false)
        setError(null)

        setIsFirstMessage(false)
        setUserInputText('')
        setFiles([])

        const newAssistant = cloneDeep(currentAssistant)
        if (!newAssistant.settings) {
          newAssistant.settings = {}
        }
        newAssistant.settings.streamOutput = true
        // 显式关闭这些功能
        newAssistant.webSearchProviderId = undefined
        newAssistant.mcpServers = undefined
        // replace prompt vars
        newAssistant.prompt = await replacePromptVariables(currentAssistant.prompt, currentAssistant?.model.name)
        // logger.debug('newAssistant', newAssistant)

        const { modelMessages, uiMessages } = await ConversationService.prepareMessagesForModel(
          messagesForContext,
          newAssistant
        )

        await fetchChatCompletion({
          messages: modelMessages,
          assistant: newAssistant,
          requestOptions: {},
          topicId,
          uiMessages: uiMessages,
          onChunkReceived: (chunk: Chunk) => {
            switch (chunk.type) {
              case ChunkType.THINKING_START:
                {
                  setIsOutputted(true)
                  thinkingStartTime = performance.now()
                  if (thinkingBlockId) {
                    store.dispatch(
                      updateOneBlock({ id: thinkingBlockId, changes: { status: MessageBlockStatus.STREAMING } })
                    )
                  } else {
                    const block = createThinkingBlock(assistantMessage.id, '', {
                      status: MessageBlockStatus.STREAMING
                    })
                    thinkingBlockId = block.id
                    store.dispatch(
                      newMessagesActions.updateMessage({
                        topicId,
                        messageId: assistantMessage.id,
                        updates: { blockInstruction: { id: block.id } }
                      })
                    )
                    store.dispatch(upsertOneBlock(block))
                  }
                }
                break
              case ChunkType.THINKING_DELTA:
                {
                  setIsOutputted(true)
                  if (thinkingBlockId) {
                    if (thinkingStartTime === null) {
                      thinkingStartTime = performance.now()
                    }
                    const thinkingDuration = resolveThinkingDuration(chunk.thinking_millsec)
                    throttledBlockUpdate(thinkingBlockId, {
                      content: chunk.text,
                      thinking_millsec: thinkingDuration
                    })
                  }
                }
                break
              case ChunkType.THINKING_COMPLETE:
                {
                  if (thinkingBlockId) {
                    const thinkingDuration = resolveThinkingDuration(chunk.thinking_millsec)
                    cancelThrottledBlockUpdate(thinkingBlockId)
                    store.dispatch(
                      updateOneBlock({
                        id: thinkingBlockId,
                        changes: { status: MessageBlockStatus.SUCCESS, thinking_millsec: thinkingDuration }
                      })
                    )
                  }
                  thinkingStartTime = null
                  thinkingBlockId = null
                }
                break
              case ChunkType.TEXT_START:
                {
                  setIsOutputted(true)
                  if (blockId) {
                    store.dispatch(updateOneBlock({ id: blockId, changes: { status: MessageBlockStatus.STREAMING } }))
                  } else {
                    const block = createMainTextBlock(assistantMessage.id, '', {
                      status: MessageBlockStatus.STREAMING
                    })
                    blockId = block.id
                    store.dispatch(
                      newMessagesActions.updateMessage({
                        topicId,
                        messageId: assistantMessage.id,
                        updates: { blockInstruction: { id: block.id } }
                      })
                    )
                    store.dispatch(upsertOneBlock(block))
                  }
                }
                break
              case ChunkType.TEXT_DELTA:
                {
                  setIsOutputted(true)
                  if (blockId) {
                    throttledBlockUpdate(blockId, { content: chunk.text })
                  }
                }
                break

              case ChunkType.TEXT_COMPLETE:
                {
                  if (blockId) {
                    cancelThrottledBlockUpdate(blockId)
                    store.dispatch(
                      updateOneBlock({
                        id: blockId,
                        changes: { content: chunk.text, status: MessageBlockStatus.SUCCESS }
                      })
                    )
                  }
                }
                break
              case ChunkType.ERROR: {
                //stop the thinking timer
                const isAborted = isAbortError(chunk.error)
                const possibleBlockId = thinkingBlockId || blockId
                if (possibleBlockId) {
                  store.dispatch(
                    updateOneBlock({
                      id: possibleBlockId,
                      changes: {
                        status: isAborted ? MessageBlockStatus.PAUSED : MessageBlockStatus.ERROR
                      }
                    })
                  )
                  store.dispatch(
                    newMessagesActions.updateMessage({
                      topicId,
                      messageId: assistantMessage.id,
                      updates: {
                        status: isAborted ? AssistantMessageStatus.PAUSED : AssistantMessageStatus.SUCCESS
                      }
                    })
                  )
                }
                if (!isAborted) {
                  throw new Error(chunk.error.message)
                }
                // 中止流：执行清理但保持 PAUSED 状态，不能落入 BLOCK_COMPLETE 把状态覆盖成 SUCCESS
                setIsLoading(false)
                setIsOutputted(true)
                currentAskId.current = ''
                thinkingStartTime = null
                thinkingBlockId = null
                break
              }
              //fall through
              case ChunkType.BLOCK_COMPLETE:
                setIsLoading(false)
                setIsOutputted(true)
                currentAskId.current = ''
                store.dispatch(
                  newMessagesActions.updateMessage({
                    topicId,
                    messageId: assistantMessage.id,
                    updates: { status: AssistantMessageStatus.SUCCESS }
                  })
                )
                break
            }
          }
        })
      } catch (err) {
        if (isAbortError(err)) return
        handleError(err instanceof Error ? err : new Error('An error occurred'))
        logger.error('Error fetching result:', err as Error)
      } finally {
        setIsLoading(false)
        setIsOutputted(true)
        currentAskId.current = ''
      }
    },
    [userContent, currentAssistant, files]
  )

  handleSendMessageRef.current = handleSendMessage

  const handlePause = useCallback(() => {
    if (currentAskId.current) {
      abortCompletion(currentAskId.current)
      setIsLoading(false)
      setIsOutputted(true)
      currentAskId.current = ''
    }
  }, [])

  const handleEsc = useCallback(() => {
    if (isLoading) {
      handlePause()
    } else {
      if (route === 'home') {
        void handleCloseWindow()
      } else {
        // Clear the topic messages to reduce memory usage
        if (currentTopic.current) {
          // 先收集消息引用的文件，再清空消息与块，最后回收文件，
          // 否则 removeAllBlocks 后块引用丢失，上传的截图会永久残留
          const filesToDelete = collectTopicFiles(currentTopic.current.id)
          store.dispatch(newMessagesActions.clearTopicMessages(currentTopic.current.id))
          // 块内容（markdown/工具输出/引用）同样驻留堆，一并清空
          store.dispatch(removeAllBlocks())
          if (filesToDelete.length > 0) {
            void safeDeleteFiles(filesToDelete)
          }
        }

        // Reset the topic
        currentTopic.current = getDefaultTopic(currentAssistant.id)

        // Reset selection only after using a feature and returning to home.
        featureMenusRef.current?.resetSelectedIndex()
        setError(null)
        setRoute('home')
        setUserInputText('')
        setFiles([])
      }
    }
  }, [isLoading, route, handleCloseWindow, currentAssistant.id, handlePause])

  const handleCopy = useCallback(() => {
    if (!currentTopic.current) return

    const messages = selectMessagesForTopic(store.getState(), currentTopic.current.id)
    const lastMessage = last(messages)

    if (lastMessage) {
      const content = getMainTextContent(lastMessage)
      void navigator.clipboard.writeText(content)
      window.toast.success('复制成功')
    }
  }, [currentTopic])

  const backgroundColor = useMemo(() => {
    // ONLY MAC: when transparent style + light theme: use vibrancy effect
    // because the dark style under mac's vibrancy effect has not been implemented
    if (isMac && windowStyle === 'transparent' && theme === ThemeMode.light) {
      return 'transparent'
    }
    return 'var(--color-background)'
  }, [windowStyle, theme])

  // Memoize placeholder text
  const inputPlaceholder = useMemo(() => {
    if (referenceText && route === 'home') {
      return '你想对下方文字做什么'
    }
    return `询问 ${quickAssistantId ? currentAssistant.name : currentAssistant.model.name} 获取帮助...`
  }, [referenceText, route, quickAssistantId, currentAssistant])

  // Memoize footer props
  const baseFooterProps = useMemo(
    () => ({
      route,
      loading: isLoading,
      onEsc: handleEsc,
      setIsPinned,
      isPinned
    }),
    [route, isLoading, handleEsc, isPinned]
  )

  switch (route) {
    case 'chat':
    case 'summary':
    case 'explanation':
      return (
        <Container style={{ backgroundColor }} $draggable={draggable}>
          {route === 'chat' && (
            <>
              <InputBar
                text={userInputText}
                assistant={currentAssistant}
                referenceText={referenceText}
                placeholder={inputPlaceholder}
                loading={isLoading}
                handleKeyDown={handleKeyDown}
                handleChange={handleChange}
                ref={inputBarRef}
                files={files}
                onRemoveFile={(fileId) => setFiles((prev) => prev.filter((f) => f.id !== fileId))}
                onPasteImage={handlePasteImage}
                onScreenshotAction={handleScreenshotAction}
              />
              <Divider style={{ margin: '10px 0' }} />
            </>
          )}
          {['summary', 'explanation'].includes(route) && (
            <div style={{ marginTop: 10 }}>
              <ClipboardPreview referenceText={referenceText} clearClipboard={clearClipboard} />
            </div>
          )}
          <ChatWindow
            route={route}
            assistant={currentAssistant}
            topic={currentTopic.current}
            isOutputted={isOutputted}
          />
          {error && <ErrorMsg>{error}</ErrorMsg>}

          <Divider style={{ margin: '10px 0' }} />
          <Footer key="footer" {...baseFooterProps} onCopy={handleCopy} />
        </Container>
      )

    case 'translate':
      return (
        <Container style={{ backgroundColor }} $draggable={draggable}>
          <TranslateWindow text={referenceText} />
          <Divider style={{ margin: '10px 0' }} />
          <Footer key="footer" {...baseFooterProps} />
        </Container>
      )

    // Home
    default:
      return (
        <Container style={{ backgroundColor }} $draggable={draggable}>
          <InputBar
            text={userInputText}
            assistant={currentAssistant}
            referenceText={referenceText}
            placeholder={inputPlaceholder}
            loading={isLoading}
            handleKeyDown={handleKeyDown}
            handleChange={handleChange}
            ref={inputBarRef}
            files={files}
            onRemoveFile={(fileId) => setFiles((prev) => prev.filter((f) => f.id !== fileId))}
            onPasteImage={handlePasteImage}
            onScreenshotAction={handleScreenshotAction}
          />
          <Divider style={{ margin: '10px 0' }} />
          <ClipboardPreview referenceText={referenceText} clearClipboard={clearClipboard} />
          <Main>
            <FeatureMenus
              setRoute={setRoute}
              onSendMessage={handleSendMessage}
              text={userContent}
              ref={featureMenusRef}
            />
          </Main>
          <Divider style={{ margin: '10px 0' }} />
          <Footer
            key="footer"
            {...baseFooterProps}
            canUseBackspace={userInputText.length > 0 || clipboardText.length === 0}
            clearClipboard={clearClipboard}
          />
        </Container>
      )
  }
}

const Container = styled.div<{ $draggable: boolean }>`
  display: flex;
  flex: 1;
  height: 100%;
  width: 100%;
  flex-direction: column;
  -webkit-app-region: ${({ $draggable }) => ($draggable ? 'drag' : 'no-drag')};
  padding: 8px 10px;
`

const Main = styled.main`
  display: flex;
  flex-direction: column;

  flex: 1;
  overflow: hidden;
`

const ErrorMsg = styled.div`
  color: var(--color-error);
  background: rgba(255, 0, 0, 0.15);
  border: 1px solid var(--color-error);
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 13px;
  word-break: break-all;
`

export default HomeWindow
