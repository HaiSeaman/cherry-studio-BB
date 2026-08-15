import { Navbar, NavbarCenter, NavbarLeft, NavbarRight } from '@renderer/components/app/Navbar'
import { HStack } from '@renderer/components/Layout'
import SearchPopup from '@renderer/components/Popups/SearchPopup'
import { modelGenerating } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { useShortcut } from '@renderer/hooks/useShortcuts'
import { useShowAssistants, useShowTopics } from '@renderer/hooks/useStore'
import { useAppDispatch } from '@renderer/store'
import { setNarrowMode } from '@renderer/store/settings'
import type { Assistant, Topic } from '@renderer/types'
import { Tooltip } from 'antd'
import { Menu, PanelLeftClose, PanelRightClose, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { FC } from 'react'
import styled from 'styled-components'

import NavbarIcon from '../../components/NavbarIcon'
import AssistantsDrawer from './components/AssistantsDrawer'

interface Props {
  activeAssistant: Assistant
  activeTopic: Topic
  setActiveTopic: (topic: Topic) => void
  setActiveAssistant: (assistant: Assistant) => void
  position: 'left' | 'right'
}

const HeaderNavbar: FC<Props> = ({ activeAssistant, setActiveAssistant, activeTopic, setActiveTopic }) => {
  const { showAssistants, toggleShowAssistants } = useShowAssistants()
  const { topicPosition, narrowMode } = useSettings()
  const { showTopics, toggleShowTopics } = useShowTopics()
  const dispatch = useAppDispatch()

  useShortcut('search_message', () => {
    void SearchPopup.show()
  })

  const handleNarrowModeToggle = async () => {
    await modelGenerating()
    dispatch(setNarrowMode(!narrowMode))
  }

  const onShowAssistantsDrawer = () => {
    void AssistantsDrawer.show({
      activeAssistant,
      setActiveAssistant,
      activeTopic,
      setActiveTopic
    })
  }

  return (
    <Navbar className="home-navbar">
      <AnimatePresence initial={false}>
        {showAssistants && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
            <NavbarLeft style={{ justifyContent: 'space-between', borderRight: 'none', padding: 0 }}>
              <Tooltip title={'隐藏侧边栏'} mouseEnterDelay={0.8}>
                <NavbarIcon onClick={toggleShowAssistants}>
                  <PanelLeftClose size={18} />
                </NavbarIcon>
              </Tooltip>
            </NavbarLeft>
          </motion.div>
        )}
      </AnimatePresence>
      {!showAssistants && (
        <NavbarLeft
          style={{
            justifyContent: 'flex-start',
            borderRight: 'none',
            paddingLeft: 0,
            paddingRight: 0,
            minWidth: 'auto'
          }}>
          <Tooltip title={'显示侧边栏'} mouseEnterDelay={0.8} placement="right">
            <NavbarIcon onClick={() => toggleShowAssistants()}>
              <PanelRightClose size={18} />
            </NavbarIcon>
          </Tooltip>
          <AnimatePresence initial={false}>
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}>
              <NavbarIcon onClick={onShowAssistantsDrawer} style={{ marginLeft: 8 }}>
                <Menu size={18} />
              </NavbarIcon>
            </motion.div>
          </AnimatePresence>
        </NavbarLeft>
      )}
      <NavbarCenter></NavbarCenter>
      <NavbarRight
        style={{
          justifyContent: 'flex-end',
          flex: 1,
          position: 'relative',
          paddingRight: '15px'
        }}
        className="home-navbar-right">
        <HStack alignItems="center" gap={6}>
          <Tooltip title={'搜索'} mouseEnterDelay={0.8}>
            <NarrowIcon onClick={() => SearchPopup.show()}>
              <Search size={18} />
            </NarrowIcon>
          </Tooltip>
          <Tooltip title={'伸缩对话框'} mouseEnterDelay={0.8}>
            <NarrowIcon onClick={handleNarrowModeToggle}>
              <i className="iconfont icon-icon-adaptive-width"></i>
            </NarrowIcon>
          </Tooltip>
          {topicPosition === 'right' && !showTopics && (
            <Tooltip title={'显示侧边栏'} mouseEnterDelay={2}>
              <NavbarIcon onClick={toggleShowTopics}>
                <PanelLeftClose size={18} />
              </NavbarIcon>
            </Tooltip>
          )}
          {topicPosition === 'right' && showTopics && (
            <Tooltip title={'隐藏侧边栏'} mouseEnterDelay={2}>
              <NavbarIcon onClick={toggleShowTopics}>
                <PanelRightClose size={18} />
              </NavbarIcon>
            </Tooltip>
          )}
        </HStack>
      </NavbarRight>
    </Navbar>
  )
}

const NarrowIcon = styled(NavbarIcon)`
  @media (max-width: 1000px) {
    display: none;
  }
`

export default HeaderNavbar
