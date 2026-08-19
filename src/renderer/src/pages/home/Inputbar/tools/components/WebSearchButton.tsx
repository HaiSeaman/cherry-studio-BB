import type { ToolQuickPanelController } from '@renderer/pages/home/Inputbar/types'
import type { FC } from 'react'
import { memo, useCallback } from 'react'

import ToolActionIconButton from './ToolActionIconButton'
import { useWebSearchPanelController, WebSearchProviderIcon } from './WebSearchQuickPanelManager'

interface Props {
  quickPanelController: ToolQuickPanelController
  assistantId: string
}

const WebSearchButton: FC<Props> = ({ quickPanelController, assistantId }) => {
  const { enableWebSearch, toggleQuickPanel, updateWebSearchProvider, selectedProviderId } =
    useWebSearchPanelController(assistantId, quickPanelController)

  const onClick = useCallback(() => {
    if (enableWebSearch) {
      void updateWebSearchProvider(undefined)
    } else {
      toggleQuickPanel()
    }
  }, [enableWebSearch, toggleQuickPanel, updateWebSearchProvider])

  const ariaLabel = enableWebSearch ? '关闭' : '网络搜索'

  return (
    <ToolActionIconButton
      tooltip={ariaLabel}
      onClick={onClick}
      active={!!enableWebSearch}
      aria-pressed={!!enableWebSearch}>
      <WebSearchProviderIcon pid={selectedProviderId} />
    </ToolActionIconButton>
  )
}

export default memo(WebSearchButton)
