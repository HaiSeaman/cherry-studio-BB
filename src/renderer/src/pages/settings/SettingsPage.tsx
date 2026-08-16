import { McpLogo } from '@renderer/components/Icons'
import Scrollbar from '@renderer/components/Scrollbar'
import ModelSettings from '@renderer/pages/settings/ModelSettings/ModelSettings'
import { Divider as AntDivider } from 'antd'
import {
  Cloud,
  Command,
  HardDrive,
  MonitorCog,
  Package,
  PictureInPicture2,
  Search,
  Settings2,
  TextCursorInput,
  Zap
} from 'lucide-react'
import type { FC } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import styled from 'styled-components'

import DataSettings from './DataSettings/DataSettings'
import DisplaySettings from './DisplaySettings/DisplaySettings'
import GeneralSettings from './GeneralSettings'
import MCPSettings from './MCPSettings'
import { ProviderList } from './ProviderSettings'
import QuickAssistantSettings from './QuickAssistantSettings'
import QuickPhraseSettings from './QuickPhraseSettings'
import SelectionAssistantSettings from './SelectionAssistantSettings/SelectionAssistantSettings'
import ShortcutSettings from './ShortcutSettings'
import WebSearchSettings from './WebSearchSettings'

const SettingsPage: FC = () => {
  const { pathname } = useLocation()
  const isRoute = (path: string): string => (pathname.startsWith(path) ? 'active' : '')

  return (
    <Container>
      <ContentContainer id="content-container">
        <SettingMenus>
          <MenuItemLink to="/settings/provider">
            <MenuItem className={isRoute('/settings/provider')}>
              <Cloud size={18} />
              {'模型服务'}
            </MenuItem>
          </MenuItemLink>
          <MenuItemLink to="/settings/model">
            <MenuItem className={isRoute('/settings/model')}>
              <Package size={18} />
              {'默认模型'}
            </MenuItem>
          </MenuItemLink>
          <Divider />
          <MenuItemLink to="/settings/general">
            <MenuItem className={isRoute('/settings/general')}>
              <Settings2 size={18} />
              {'常规设置'}
            </MenuItem>
          </MenuItemLink>
          <MenuItemLink to="/settings/display">
            <MenuItem className={isRoute('/settings/display')}>
              <MonitorCog size={18} />
              {'显示设置'}
            </MenuItem>
          </MenuItemLink>
          <MenuItemLink to="/settings/data">
            <MenuItem className={isRoute('/settings/data')}>
              <HardDrive size={18} />
              {'数据设置'}
            </MenuItem>
          </MenuItemLink>
          <Divider />
          <MenuItemLink to="/settings/mcp">
            <MenuItem className={isRoute('/settings/mcp')}>
              <McpLogo width={18} height={18} style={{ opacity: 0.8 }} />
              {'MCP 服务器'}
            </MenuItem>
          </MenuItemLink>
          <MenuItemLink to="/settings/websearch">
            <MenuItem className={isRoute('/settings/websearch')}>
              <Search size={18} />
              {'网络搜索'}
            </MenuItem>
          </MenuItemLink>
          <MenuItemLink to="/settings/quickphrase">
            <MenuItem className={isRoute('/settings/quickphrase')}>
              <Zap size={18} />
              {'快捷短语'}
            </MenuItem>
          </MenuItemLink>
          <MenuItemLink to="/settings/shortcut">
            <MenuItem className={isRoute('/settings/shortcut')}>
              <Command size={18} />
              {'快捷键'}
            </MenuItem>
          </MenuItemLink>
          <Divider />
          <MenuItemLink to="/settings/quickAssistant">
            <MenuItem className={isRoute('/settings/quickAssistant')}>
              <PictureInPicture2 size={18} />
              {'快捷助手'}
            </MenuItem>
          </MenuItemLink>
          <MenuItemLink to="/settings/selectionAssistant">
            <MenuItem className={isRoute('/settings/selectionAssistant')}>
              <TextCursorInput size={18} />
              {'划词助手'}
            </MenuItem>
          </MenuItemLink>
          <Divider />
        </SettingMenus>
        <SettingContent>
          <Routes>
            <Route path="provider" element={<ProviderList />} />
            <Route path="model" element={<ModelSettings />} />
            <Route path="websearch/*" element={<WebSearchSettings />} />
            <Route path="quickphrase" element={<QuickPhraseSettings />} />
            <Route path="mcp/*" element={<MCPSettings />} />
            <Route path="general/*" element={<GeneralSettings />} />
            <Route path="display" element={<DisplaySettings />} />
            <Route path="shortcut" element={<ShortcutSettings />} />
            <Route path="quickAssistant" element={<QuickAssistantSettings />} />
            <Route path="selectionAssistant" element={<SelectionAssistantSettings />} />
            <Route path="data" element={<DataSettings />} />
          </Routes>
        </SettingContent>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  height: calc(100vh - var(--navbar-height));
  padding: 1px 0;
`

const SettingMenus = styled(Scrollbar)`
  display: flex;
  flex-direction: column;
  min-width: var(--settings-width);
  border-right: 0.5px solid var(--color-border);
  padding: 10px;
  user-select: none;
  gap: 5px;
`

const MenuItemLink = styled(Link)`
  text-decoration: none;
  color: var(--color-text-1);
`

const MenuItem = styled.li`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  width: 100%;
  cursor: pointer;
  border-radius: var(--list-item-border-radius);
  font-weight: 500;
  transition: all 0.2s ease-in-out;
  border: 0.5px solid transparent;
  .anticon {
    font-size: 16px;
    opacity: 0.8;
  }
  &:hover {
    background: var(--color-background-soft);
  }
  &.active {
    background: var(--color-background-soft);
    border: 0.5px solid var(--color-border);
  }
`

const SettingContent = styled.div`
  display: flex;
  height: 100%;
  flex: 1;
`

const Divider = styled(AntDivider)`
  margin: 3px 0;
`

export default SettingsPage
