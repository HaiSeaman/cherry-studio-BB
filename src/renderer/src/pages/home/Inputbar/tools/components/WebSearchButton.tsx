import { ActionIconButton } from '@renderer/components/Buttons'
import type { ToolQuickPanelController } from '@renderer/pages/home/Inputbar/types'
import { Tooltip } from 'antd'
import type { FC } from 'react'
import { memo, useCallback } from 'react'

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
    <Tooltip placement="top" title={ariaLabel} mouseLeaveDelay={0} arrow>
      <ActionIconButton
        onClick={onClick}
        active={!!enableWebSearch}
        aria-label={ariaLabel}
        aria-pressed={!!enableWebSearch}>
        <WebSearchProviderIcon pid={selectedProviderId} />
      </ActionIconButton>
    </Tooltip>
  )
}

export default memo(WebSearchButton)
