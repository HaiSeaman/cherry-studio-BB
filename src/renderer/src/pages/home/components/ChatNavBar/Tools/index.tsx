import { HStack } from '@renderer/components/Layout'
import NavbarIcon from '@renderer/components/NavbarIcon'
import SearchPopup from '@renderer/components/Popups/SearchPopup'
import { modelGenerating } from '@renderer/hooks/useRuntime'
import { useNavbarPosition, useSettings } from '@renderer/hooks/useSettings'
import { useShowTopics } from '@renderer/hooks/useStore'
import { useAppDispatch } from '@renderer/store'
import { setNarrowMode } from '@renderer/store/settings'
import type { Assistant } from '@renderer/types'
import { Tooltip } from 'antd'
import { PanelLeftClose, PanelRightClose, Search } from 'lucide-react'
import { styled } from 'styled-components'

import SettingsButton from './SettingsButton'

interface ToolsProps {
  assistant?: Assistant
}

const Tools = ({ assistant }: ToolsProps) => {
  const { showTopics, toggleShowTopics } = useShowTopics()
  const { isTopNavbar } = useNavbarPosition()
  const { topicPosition, narrowMode } = useSettings()
  const dispatch = useAppDispatch()

  const handleNarrowModeToggle = async () => {
    await modelGenerating()
    dispatch(setNarrowMode(!narrowMode))
  }

  return (
    <HStack alignItems="center" gap={8}>
      <SettingsButton assistant={assistant} />
      {isTopNavbar && (
        <Tooltip title={'伸缩对话框'} mouseEnterDelay={0.8}>
          <NarrowIcon onClick={handleNarrowModeToggle}>
            <i className="iconfont icon-icon-adaptive-width"></i>
          </NarrowIcon>
        </Tooltip>
      )}
      {isTopNavbar && (
        <Tooltip title={'搜索'} mouseEnterDelay={0.8}>
          <NavbarIcon onClick={() => SearchPopup.show()}>
            <Search size={18} />
          </NavbarIcon>
        </Tooltip>
      )}
      {isTopNavbar && topicPosition === 'right' && !showTopics && (
        <Tooltip title={'显示侧边栏'} mouseEnterDelay={2}>
          <NavbarIcon onClick={toggleShowTopics}>
            <PanelLeftClose size={18} />
          </NavbarIcon>
        </Tooltip>
      )}
      {isTopNavbar && topicPosition === 'right' && showTopics && (
        <Tooltip title={'隐藏侧边栏'} mouseEnterDelay={2}>
          <NavbarIcon onClick={toggleShowTopics}>
            <PanelRightClose size={18} />
          </NavbarIcon>
        </Tooltip>
      )}
    </HStack>
  )
}

const NarrowIcon = styled(NavbarIcon)`
  @media (max-width: 1000px) {
    display: none;
  }
`

export default Tools
