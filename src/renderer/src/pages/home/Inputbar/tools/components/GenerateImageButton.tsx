import { isGenerateImageModel } from '@renderer/config/models'
import type { Assistant, Model } from '@renderer/types'
import { Image } from 'lucide-react'
import type { FC } from 'react'

import ToolActionIconButton from './ToolActionIconButton'

interface Props {
  assistant: Assistant
  model: Model
  onEnableGenerateImage: () => void
}

const GenerateImageButton: FC<Props> = ({ model, assistant, onEnableGenerateImage }) => {
  const ariaLabel = isGenerateImageModel(model) ? '生成图片' : '模型不支持生成图片'

  return (
    <ToolActionIconButton
      tooltip={ariaLabel}
      onClick={onEnableGenerateImage}
      active={assistant.enableGenerateImage}
      disabled={!isGenerateImageModel(model)}
      aria-pressed={assistant.enableGenerateImage}>
      <Image size={18} />
    </ToolActionIconButton>
  )
}

export default GenerateImageButton
