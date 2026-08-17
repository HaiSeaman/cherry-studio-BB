import { useAssistant } from '@renderer/hooks/useAssistant'
import { useTimer } from '@renderer/hooks/useTimer'
import { getEffectiveMcpMode } from '@renderer/types'
import { isToolUseModeFunction } from '@renderer/utils/assistant'
import { Link } from 'lucide-react'
import type { FC } from 'react'
import { memo, useCallback } from 'react'

import ToolActionIconButton from './ToolActionIconButton'

export interface UrlContextButtonRef {
  openQuickPanel: () => void
}

interface Props {
  ref?: React.RefObject<UrlContextButtonRef | null>
  assistantId: string
}

const UrlContextButton: FC<Props> = ({ assistantId }) => {
  const { assistant, updateAssistant } = useAssistant(assistantId)
  const { setTimeoutTimer } = useTimer()

  const urlContentNewState = !assistant.enableUrlContext

  const handleToggle = useCallback(() => {
    setTimeoutTimer(
      'handleToggle',
      () => {
        const update = { ...assistant }
        if (
          getEffectiveMcpMode(assistant) !== 'disabled' &&
          urlContentNewState === true &&
          isToolUseModeFunction(assistant)
        ) {
          update.enableUrlContext = false
          window.toast.warning('Gemini 不支持同时使用网页上下文与函数调用')
        } else {
          update.enableUrlContext = urlContentNewState
        }
        updateAssistant(update)
      },
      100
    )
  }, [setTimeoutTimer, assistant, urlContentNewState, updateAssistant])

  return (
    <ToolActionIconButton
      tooltip="网页上下文"
      onClick={handleToggle}
      active={assistant.enableUrlContext}
      aria-pressed={assistant.enableUrlContext}>
      <Link size={18} />
    </ToolActionIconButton>
  )
}

export default memo(UrlContextButton)
