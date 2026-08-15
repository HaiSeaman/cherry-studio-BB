import AddButton from '@renderer/components/AddButton'
import type { FC } from 'react'
interface AssistantAddButtonProps {
  onCreateAssistant: () => void
}

const AssistantAddButton: FC<AssistantAddButtonProps> = ({ onCreateAssistant }) => {
  return (
    <div className="-mt-0.5 mb-1.5">
      <AddButton onClick={onCreateAssistant}>{'添加助手'}</AddButton>
    </div>
  )
}

export default AssistantAddButton
