import { InfoCircleOutlined } from '@ant-design/icons'
import { Client } from '@notionhq/client'
import { HStack } from '@renderer/components/Layout'
import { AppLogo } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import {
  setNotionApiKey,
  setNotionDatabaseID,
  setNotionExportReasoning,
  setNotionPageNameKey
} from '@renderer/store/settings'
import { Button, Space, Switch, Tooltip } from 'antd'
import { Input } from 'antd'
import type { FC } from 'react'
import { useSelector } from 'react-redux'

import { SettingDivider, SettingGroup, SettingHelpText, SettingRow, SettingRowTitle, SettingTitle } from '..'
const NotionSettings: FC = () => {
  const { theme } = useTheme()
  const dispatch = useAppDispatch()
  const { openSmartMinapp } = useMinappPopup()

  const notionApiKey = useSelector((state: RootState) => state.settings.notionApiKey)
  const notionDatabaseID = useSelector((state: RootState) => state.settings.notionDatabaseID)
  const notionPageNameKey = useSelector((state: RootState) => state.settings.notionPageNameKey)
  const notionExportReasoning = useSelector((state: RootState) => state.settings.notionExportReasoning)

  const handleNotionTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setNotionApiKey(e.target.value))
  }

  const handleNotionDatabaseIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setNotionDatabaseID(e.target.value))
  }

  const handleNotionPageNameKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setNotionPageNameKey(e.target.value))
  }

  const handleNotionConnectionCheck = () => {
    if (notionApiKey === null) {
      window.toast.error('未配置 API key')
      return
    }
    if (notionDatabaseID === null) {
      window.toast.error('未配置 Database ID')
      return
    }
    const notion = new Client({ auth: notionApiKey })
    notion.databases
      .retrieve({
        database_id: notionDatabaseID
      })
      .then((result) => {
        if (result) {
          window.toast.success('连接成功')
        } else {
          window.toast.error('连接失败，请检查网络及 API key 和 Database ID 是否正确')
        }
      })
      .catch(() => {
        window.toast.error('连接异常，请检查网络及 API key 和 Database ID 是否正确')
      })
  }

  const handleNotionTitleClick = () => {
    openSmartMinapp({
      id: 'notion-help',
      name: 'Notion Help',
      url: 'https://docs.cherry-ai.com/advanced-basic/notion',
      logo: AppLogo
    })
  }

  const handleNotionExportReasoningChange = (checked: boolean) => {
    dispatch(setNotionExportReasoning(checked))
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle style={{ justifyContent: 'flex-start', gap: 10 }}>
        {'Notion 设置'}
        <Tooltip title={'Notion 配置文档'} placement="right">
          <InfoCircleOutlined
            style={{ color: 'var(--color-text-2)', cursor: 'pointer' }}
            onClick={handleNotionTitleClick}
          />
        </Tooltip>
      </SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'Notion 数据库 ID'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={notionDatabaseID || ''}
            onChange={handleNotionDatabaseIdChange}
            onBlur={handleNotionDatabaseIdChange}
            style={{ width: 315 }}
            placeholder={'请输入 Notion 数据库 ID'}
          />
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'页面标题字段名'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={notionPageNameKey || ''}
            onChange={handleNotionPageNameKeyChange}
            onBlur={handleNotionPageNameKeyChange}
            style={{ width: 315 }}
            placeholder={'请输入页面标题字段名，默认为 Name'}
          />
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'Notion 密钥'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              value={notionApiKey || ''}
              onChange={handleNotionTokenChange}
              onBlur={handleNotionTokenChange}
              placeholder={'请输入 Notion 密钥'}
              style={{ width: '100%' }}
            />
            <Button onClick={handleNotionConnectionCheck}>{'检测'}</Button>
          </Space.Compact>
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'导出时包含思维链'}</SettingRowTitle>
        <Switch checked={notionExportReasoning} onChange={handleNotionExportReasoningChange} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>{'开启后，导出到 Notion 时会包含思维链内容。'}</SettingHelpText>
      </SettingRow>
    </SettingGroup>
  )
}

export default NotionSettings
