import type { ToolQuickPanelApi, ToolQuickPanelController } from '@renderer/pages/home/Inputbar/types'
import type { FileMetadata, Model } from '@renderer/types'
import { AtSign } from 'lucide-react'
import type { FC } from 'react'
import type React from 'react'
import { memo } from 'react'

import ToolActionIconButton from './ToolActionIconButton'
import { useMentionModelsPanel } from './useMentionModelsPanel'

interface Props {
  quickPanel: ToolQuickPanelApi
  quickPanelController: ToolQuickPanelController
  mentionedModels: Model[]
  setMentionedModels: React.Dispatch<React.SetStateAction<Model[]>>
  couldMentionNotVisionModel: boolean
  files: FileMetadata[]
  setText: React.Dispatch<React.SetStateAction<string>>
}

const MentionModelsButton: FC<Props> = ({
  quickPanel,
  quickPanelController,
  mentionedModels,
  setMentionedModels,
  couldMentionNotVisionModel,
  files,
  setText
}) => {
  const { handleOpenQuickPanel } = useMentionModelsPanel(
    {
      quickPanel,
      quickPanelController,
      mentionedModels,
      setMentionedModels,
      couldMentionNotVisionModel,
      files,
      setText
    },
    'button'
  )

  return (
    <ToolActionIconButton tooltip="选择模型" onClick={handleOpenQuickPanel} active={mentionedModels.length > 0}>
      <AtSign size={18} />
    </ToolActionIconButton>
  )
}

export default memo(MentionModelsButton)
