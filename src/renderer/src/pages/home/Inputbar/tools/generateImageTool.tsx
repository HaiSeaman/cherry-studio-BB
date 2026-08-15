import { isGenerateImageModel } from '@renderer/config/models'
import { useAssistant } from '@renderer/hooks/useAssistant'
import GenerateImageButton from '@renderer/pages/home/Inputbar/tools/components/GenerateImageButton'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'
import { useCallback } from 'react'

const GenerateImageTool = ({ context }) => {
  const { assistant, model } = context
  const { updateAssistant } = useAssistant(assistant.id)

  const handleToggle = useCallback(() => {
    updateAssistant({ ...assistant, enableGenerateImage: !assistant.enableGenerateImage })
  }, [assistant, updateAssistant])

  return <GenerateImageButton assistant={assistant} model={model} onEnableGenerateImage={handleToggle} />
}

const generateImageTool = defineTool({
  key: 'generate_image',
  label: '生成图片',
  visibleInScopes: [TopicType.Chat],
  condition: ({ model }) => isGenerateImageModel(model),
  render: (context) => <GenerateImageTool context={context} />
})

registerTool(generateImageTool)

export default generateImageTool
