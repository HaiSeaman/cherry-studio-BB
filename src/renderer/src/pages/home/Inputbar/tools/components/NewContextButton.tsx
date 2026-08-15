import { ActionIconButton } from '@renderer/components/Buttons'
import { useShortcut, useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { Tooltip } from 'antd'
import { Eraser } from 'lucide-react'
import type { FC } from 'react'
interface Props {
  onNewContext: () => void
}

const NewContextButton: FC<Props> = ({ onNewContext }) => {
  useShortcut('toggle_new_context', onNewContext)
  const newContextShortcut = useShortcutDisplay('toggle_new_context')

  return (
    <Tooltip placement="top" title={`清除上下文 ${newContextShortcut}`} mouseLeaveDelay={0} arrow>
      <ActionIconButton onClick={onNewContext} aria-label={`清除上下文 ${newContextShortcut}`}>
        <Eraser size={18} />
      </ActionIconButton>
    </Tooltip>
  )
}

export default NewContextButton
