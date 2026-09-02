import { CloudServerOutlined, CloudSyncOutlined, YuqueOutlined } from '@ant-design/icons'
import DividerWithText from '@renderer/components/DividerWithText'
import { JoplinIcon, SiyuanIcon } from '@renderer/components/Icons'
import { HStack } from '@renderer/components/Layout'
import ListItem from '@renderer/components/ListItem'
import { useTheme } from '@renderer/context/ThemeProvider'
import ImportMenuOptions from '@renderer/pages/settings/DataSettings/ImportMenuSettings'
import { FileText, FolderCog, FolderInput, FolderOpen } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import styled from 'styled-components'

import { SettingContainer } from '..'
import BasicDataSettings from './BasicDataSettings'
import CrossDeviceSyncSettings from './CrossDeviceSyncSettings'
import ExportMenuOptions from './ExportMenuSettings'
import JoplinSettings from './JoplinSettings'
import LocalBackupSettings from './LocalBackupSettings'
import MarkdownExportSettings from './MarkdownExportSettings'
import NotionSettings from './NotionSettings'
import ObsidianSettings from './ObsidianSettings'
import S3Settings from './S3Settings'
import SiyuanSettings from './SiyuanSettings'
import WebDavSettings from './WebDavSettings'
import YuqueSettings from './YuqueSettings'

const DataSettings: FC = () => {
  const { theme } = useTheme()
  const [menu, setMenu] = useState<string>('data')

  const menuItems = [
    { key: 'divider_0', isDivider: true, text: '基础数据设置' },
    { key: 'data', title: '数据目录', icon: <FolderCog size={16} /> },
    { key: 'divider_1', isDivider: true, text: '云备份设置' },
    { key: 'local_backup', title: '本地备份', icon: <FolderCog size={16} /> },
    { key: 'webdav', title: 'WebDAV', icon: <CloudSyncOutlined style={{ fontSize: 16 }} /> },
    { key: 's3', title: 'S3 兼容存储', icon: <CloudServerOutlined style={{ fontSize: 16 }} /> },
    { key: 'divider_1b', isDivider: true, text: '跨设备同步' },
    { key: 'cross_device', title: '跨设备同步（便签等）', icon: <CloudSyncOutlined style={{ fontSize: 16 }} /> },
    { key: 'divider_2', isDivider: true, text: '导入设置' },
    {
      key: 'import_settings',
      title: '导入外部应用数据',
      icon: <FolderOpen size={16} />
    },
    { key: 'divider_3', isDivider: true, text: '导出设置' },
    {
      key: 'export_menu',
      title: '导出菜单设置',
      icon: <FolderInput size={16} />
    },
    {
      key: 'markdown_export',
      title: 'Markdown 导出',
      icon: <FileText size={16} />
    },

    { key: 'divider_4', isDivider: true, text: '第三方连接' },
    { key: 'notion', title: 'Notion 设置', icon: <i className="iconfont icon-notion" /> },
    {
      key: 'yuque',
      title: '语雀配置',
      icon: <YuqueOutlined style={{ fontSize: 16 }} />
    },
    {
      key: 'joplin',
      title: 'Joplin 配置',
      icon: <JoplinIcon />
    },
    {
      key: 'obsidian',
      title: 'Obsidian 配置',
      icon: <i className="iconfont icon-obsidian" />
    },
    {
      key: 'siyuan',
      title: '思源笔记配置',
      icon: <SiyuanIcon />
    }
  ]

  return (
    <Container>
      <MenuList>
        {menuItems.map((item) =>
          item.isDivider ? (
            <DividerWithText key={item.key} text={item.text || ''} style={{ margin: '8px 0' }} /> // 动态传递分隔符文字
          ) : (
            <ListItem
              key={item.key}
              title={item.title}
              active={menu === item.key}
              onClick={() => setMenu(item.key)}
              titleStyle={{ fontWeight: 500 }}
              icon={item.icon}
            />
          )
        )}
      </MenuList>
      <SettingContainer theme={theme} style={{ display: 'flex', flex: 1, height: '100%' }}>
        {menu === 'data' && <BasicDataSettings />}
        {menu === 'webdav' && <WebDavSettings />}
        {menu === 's3' && <S3Settings />}
        {menu === 'import_settings' && <ImportMenuOptions />}
        {menu === 'export_menu' && <ExportMenuOptions />}
        {menu === 'markdown_export' && <MarkdownExportSettings />}
        {menu === 'notion' && <NotionSettings />}
        {menu === 'yuque' && <YuqueSettings />}
        {menu === 'joplin' && <JoplinSettings />}
        {menu === 'obsidian' && <ObsidianSettings />}
        {menu === 'siyuan' && <SiyuanSettings />}
        {menu === 'local_backup' && <LocalBackupSettings />}
        {menu === 'cross_device' && <CrossDeviceSyncSettings />}
      </SettingContainer>
    </Container>
  )
}

const Container = styled(HStack)`
  flex: 1;
`

const MenuList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: var(--settings-width);
  padding: 12px;
  padding-bottom: 48px;
  border-right: 0.5px solid var(--color-border);
  height: 100vh;
  overflow: auto;
  box-sizing: border-box;
  min-height: 0;
  .iconfont {
    color: var(--color-text-2);
    line-height: 16px;
  }
`

export default DataSettings
