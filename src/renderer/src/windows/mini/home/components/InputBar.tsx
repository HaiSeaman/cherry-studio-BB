import ModelAvatar from '@renderer/components/Avatar/ModelAvatar'
import { useTimer } from '@renderer/hooks/useTimer'
import FileManager from '@renderer/services/FileManager'
import type { Assistant, FileMetadata } from '@renderer/types'
import type { ScreenshotAction } from '@renderer/utils/screenshot'
import { Input as AntdInput } from 'antd'
import { FileText, Languages } from 'lucide-react'
import type { InputRef } from 'rc-input/lib/interface'
import React, { useRef } from 'react'
import styled from 'styled-components'

interface InputBarProps {
  text: string
  assistant: Assistant
  referenceText: string
  placeholder: string
  loading: boolean
  files: FileMetadata[]
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveFile: (fileId: string) => void
  onPasteImage?: () => Promise<boolean>
  onScreenshotAction?: (action: ScreenshotAction) => void
}

const InputBar = ({
  ref,
  text,
  assistant,
  placeholder,
  loading,
  files,
  handleKeyDown,
  handleChange,
  onRemoveFile,
  onPasteImage,
  onScreenshotAction
}: InputBarProps & { ref?: React.RefObject<HTMLDivElement | null> }) => {
  const inputRef = useRef<InputRef>(null)
  const { setTimeoutTimer } = useTimer()
  if (!loading) {
    setTimeoutTimer('focus', () => inputRef.current?.input?.focus(), 0)
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    // When the clipboard holds an image, insert it as an attachment and swallow the default paste.
    if (onPasteImage && (await onPasteImage())) {
      e.preventDefault()
    }
  }

  return (
    <InputWrapper ref={ref}>
      {files.length > 0 && (
        <FileList>
          {files.map((file) => (
            <FileItem key={file.id}>
              <FileImage src={'file://' + FileManager.getSafePath(file)} alt={file.name} />
              <RemoveButton onClick={() => onRemoveFile(file.id)} title="移除">
                ×
              </RemoveButton>
            </FileItem>
          ))}
        </FileList>
      )}
      {files.length > 0 && onScreenshotAction && (
        <QuickActions>
          <QuickButton onClick={() => onScreenshotAction('ocr')}>
            <FileText size={13} />
            <span>识别文字</span>
          </QuickButton>
          <QuickButton onClick={() => onScreenshotAction('translate')}>
            <Languages size={13} />
            <span>翻译图片</span>
          </QuickButton>
        </QuickActions>
      )}
      {assistant.model && <ModelAvatar model={assistant.model} size={30} />}
      <Input
        value={text}
        placeholder={placeholder}
        variant="borderless"
        autoFocus
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onPaste={handlePaste}
        ref={inputRef}
      />
    </InputWrapper>
  )
}
InputBar.displayName = 'InputBar'

const InputWrapper = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
`

const FileList = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
`

const FileItem = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--color-border);
`

const FileImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`

const RemoveButton = styled.button`
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
  padding: 0;

  &:hover {
    background: var(--color-error);
  }
`

const QuickActions = styled.div`
  display: flex;
  gap: 6px;
  width: 100%;
`

const QuickButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--color-text-2);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  -webkit-app-region: none;

  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
`

const Input = styled(AntdInput)`
  background: none;
  border: none;
  -webkit-app-region: none;
  font-size: 18px;
`

export default InputBar
