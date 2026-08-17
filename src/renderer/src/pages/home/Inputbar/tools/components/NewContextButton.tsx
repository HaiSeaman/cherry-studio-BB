import { useShortcut, useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { Eraser } from 'lucide-react'
import type { FC } from 'react'

import ToolActionIconButton from './ToolActionIconButton'

interface Props {
  onNewContext: () => void
}

const NewContextButton: FC<Props> = ({ onNewContext }) => {
  useShortcut('toggle_new_context', onNewContext)
  const newContextShortcut = useShortcutDisplay('toggle_new_context')

  return (
    <ToolActionIconButton tooltip={`清除上下文 ${newContextShortcut}`} onClick={onNewContext}>
      <Eraser size={18} />
    </ToolActionIconButton>
  )
}

export default NewContextButton
