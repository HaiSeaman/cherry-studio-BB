import 'emoji-picker-element'

import { CloseCircleFilled } from '@ant-design/icons'
import CodeEditor from '@renderer/components/CodeEditor'
import EmojiPicker from '@renderer/components/EmojiPicker'
import { Box, HSpaceBetweenStack, HStack } from '@renderer/components/Layout'
import { usePromptProcessor } from '@renderer/hooks/usePromptProcessor'
import { estimateTextTokens } from '@renderer/services/TokenService'
import type { Assistant, AssistantSettings } from '@renderer/types'
import { getLeadingEmoji } from '@renderer/utils'
import { Button, Input, Popover } from 'antd'
import { Edit, HelpCircle, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import styled from 'styled-components'

import { SettingDivider } from '..'

interface Props {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => void
  updateAssistantSettings?: (settings: AssistantSettings) => void
  onOk?: () => void
}

const AssistantPromptSettings: React.FC<Props> = ({ assistant, updateAssistant }) => {
  const [emoji, setEmoji] = useState(getLeadingEmoji(assistant.name) || assistant.emoji)
  const [name, setName] = useState(assistant.name.replace(getLeadingEmoji(assistant.name) || '', '').trim())
  const [prompt, setPrompt] = useState(assistant.prompt)
  const [showPreview, setShowPreview] = useState(assistant.prompt.length > 0)
  const [tokenCount, setTokenCount] = useState(0)
  useEffect(() => {
    setTokenCount(estimateTextTokens(prompt))
  }, [prompt])

  const processedPrompt = usePromptProcessor({
    prompt,
    modelName: assistant.model?.name
  })

  const onUpdate = () => {
    const _assistant = { ...assistant, name: name.trim(), emoji, prompt }
    updateAssistant(_assistant)
    window.toast.success('已保存')
  }

  const handleEmojiSelect = (selectedEmoji: string) => {
    setEmoji(selectedEmoji)
    const _assistant = { ...assistant, name: name.trim(), emoji: selectedEmoji, prompt }
    updateAssistant(_assistant)
  }

  const handleEmojiDelete = () => {
    setEmoji('')
    const _assistant = { ...assistant, name: name.trim(), prompt, emoji: '' }
    updateAssistant(_assistant)
  }

  const promptVarsContent = (
    <pre>
      {
        '{{date}}:\t日期\n{{time}}:\t时间\n{{datetime}}:\t日期和时间\n{{system}}:\t操作系统\n{{arch}}:\tCPU 架构\n{{language}}:\t语言\n{{model_name}}:\t模型名称\n{{username}}:\t用户名'
      }
    </pre>
  )

  return (
    <Container>
      <Box mb={8} style={{ fontWeight: 'bold' }}>
        {'名称'}
      </Box>
      <HStack gap={8} alignItems="center">
        <Popover content={<EmojiPicker onEmojiClick={handleEmojiSelect} />} arrow trigger="click">
          <EmojiButtonWrapper>
            <Button
              style={{
                fontSize: 18,
                padding: '4px',
                minWidth: '28px',
                height: '28px'
              }}>
              {emoji}
            </Button>
            {emoji && (
              <CloseCircleFilled
                className="delete-icon"
                onClick={(e) => {
                  e.stopPropagation()
                  handleEmojiDelete()
                }}
                style={{
                  display: 'none',
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  fontSize: '16px',
                  color: '#ff4d4f',
                  cursor: 'pointer'
                }}
              />
            )}
          </EmojiButtonWrapper>
        </Popover>
        <Input
          placeholder={'助手' + '名称'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={onUpdate}
          style={{ flex: 1 }}
        />
      </HStack>
      <SettingDivider />
      <HStack mb={8} alignItems="center" gap={4}>
        <Box style={{ fontWeight: 'bold' }}>{'提示词'}</Box>
        <Popover title={'可用的变量'} content={promptVarsContent}>
          <HelpCircle size={14} color="var(--color-text-2)" />
        </Popover>
      </HStack>
      <TextAreaContainer>
        <EditorContainer>
          {showPreview ? (
            <MarkdownContainer>
              <ReactMarkdown>{processedPrompt || prompt}</ReactMarkdown>
            </MarkdownContainer>
          ) : (
            <CodeEditor
              value={prompt}
              language="markdown"
              onChange={setPrompt}
              height="100%"
              expanded={false}
              style={{
                height: '100%'
              }}
            />
          )}
        </EditorContainer>
      </TextAreaContainer>
      <HSpaceBetweenStack width="100%" justifyContent="flex-end" mt="10px">
        <TokenCount>Tokens: {tokenCount}</TokenCount>
        <Button
          type="primary"
          icon={showPreview ? <Edit size={14} /> : <Save size={14} />}
          onClick={() => {
            if (showPreview) {
              setShowPreview(false)
            } else {
              onUpdate()
              setShowPreview(true)
            }
          }}>
          {showPreview ? '编辑' : '保存'}
        </Button>
      </HSpaceBetweenStack>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
`

const EmojiButtonWrapper = styled.div`
  position: relative;
  display: inline-block;

  &:hover .delete-icon {
    display: block !important;
  }
`

const TextAreaContainer = styled.div`
  position: relative;
  width: 100%;
`

const TokenCount = styled.div`
  padding: 2px 2px;
  border-radius: 4px;
  font-size: 14px;
  color: var(--color-text-2);
  user-select: none;
`

const EditorContainer = styled.div`
  height: calc(80vh - 202px);
  border: 0.5px solid var(--color-border);
  border-radius: 5px;
  overflow: hidden;
`

const MarkdownContainer = styled.div.attrs({ className: 'markdown' })`
  height: 100%;
  padding: 0.5em;
  overflow: auto;
`

export default AssistantPromptSettings
