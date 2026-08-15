import { ActionIconButton } from '@renderer/components/Buttons'
import { QuickPanelReservedSymbol, useQuickPanel } from '@renderer/components/QuickPanel'
import type { ToolQuickPanelApi } from '@renderer/pages/home/Inputbar/types'
import type { FileMetadata } from '@renderer/types'
import { filterSupportedFiles } from '@renderer/utils/file'
import { Tooltip } from 'antd'
import { Paperclip, Upload } from 'lucide-react'
import type { Dispatch, FC, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
interface Props {
  quickPanel: ToolQuickPanelApi
  couldAddImageFile: boolean
  extensions: string[]
  files: FileMetadata[]
  setFiles: Dispatch<SetStateAction<FileMetadata[]>>
  disabled?: boolean
}

const AttachmentButton: FC<Props> = ({ quickPanel, couldAddImageFile, extensions, files, setFiles, disabled }) => {
  const quickPanelHook = useQuickPanel()
  const [selecting, setSelecting] = useState<boolean>(false)

  const openFileSelectDialog = useCallback(async () => {
    if (selecting) {
      return
    }
    // when the number of extensions is greater than 20, use *.* to avoid selecting window lag
    const useAllFiles = extensions.length > 20

    setSelecting(true)
    const _files = await window.api.file.select({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Files',
          extensions: useAllFiles ? ['*'] : extensions.map((i) => i.replace('.', ''))
        }
      ]
    })
    setSelecting(false)

    if (_files) {
      if (!useAllFiles) {
        setFiles([...files, ..._files])
        return
      }
      const supportedFiles = await filterSupportedFiles(_files, extensions)
      if (supportedFiles.length > 0) {
        setFiles([...files, ...supportedFiles])
      }

      if (supportedFiles.length !== _files.length) {
        window.toast.info(`${_files.length - supportedFiles.length} 个文件不被支持`)
      }
    }
  }, [extensions, files, selecting, setFiles])

  const items = useMemo(() => {
    return [
      {
        label: '上传本地文件...',
        description: '',
        icon: <Upload />,
        action: () => openFileSelectDialog()
      }
    ]
  }, [openFileSelectDialog])

  const openQuickPanel = useCallback(() => {
    quickPanelHook.open({
      title: '上传附件',
      list: items,
      symbol: QuickPanelReservedSymbol.File
    })
  }, [items, quickPanelHook])

  useEffect(() => {
    const disposeRootMenu = quickPanel.registerRootMenu([
      {
        label: couldAddImageFile ? '上传附件' : '上传文档（模型不支持图片）',
        description: '',
        icon: <Paperclip />,
        isMenu: true,
        action: () => openQuickPanel()
      }
    ])

    const disposeTrigger = quickPanel.registerTrigger(QuickPanelReservedSymbol.File, () => openQuickPanel())

    return () => {
      disposeRootMenu()
      disposeTrigger()
    }
  }, [couldAddImageFile, openQuickPanel, quickPanel])

  const ariaLabel = couldAddImageFile ? '上传图片或文档' : '上传文档（模型不支持图片）'

  return (
    <Tooltip placement="top" title={ariaLabel} mouseLeaveDelay={0} arrow>
      <ActionIconButton
        onClick={openFileSelectDialog}
        active={files.length > 0}
        disabled={disabled}
        aria-label={ariaLabel}>
        <Paperclip size={18} />
      </ActionIconButton>
    </Tooltip>
  )
}

export default AttachmentButton
