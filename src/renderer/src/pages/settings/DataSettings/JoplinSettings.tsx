import { InfoCircleOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { AppLogo } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import { setJoplinExportReasoning, setJoplinToken, setJoplinUrl } from '@renderer/store/settings'
import { Button, Space, Switch, Tooltip } from 'antd'
import { Input } from 'antd'
import type { FC } from 'react'
import { useSelector } from 'react-redux'

import { SettingDivider, SettingGroup, SettingHelpText, SettingRow, SettingRowTitle, SettingTitle } from '..'

const JoplinSettings: FC = () => {
  const { theme } = useTheme()
  const dispatch = useAppDispatch()
  const { openSmartMinapp } = useMinappPopup()

  const joplinToken = useSelector((state: RootState) => state.settings.joplinToken)
  const joplinUrl = useSelector((state: RootState) => state.settings.joplinUrl)
  const joplinExportReasoning = useSelector((state: RootState) => state.settings.joplinExportReasoning)

  const handleJoplinTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setJoplinToken(e.target.value))
  }

  const handleJoplinUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setJoplinUrl(e.target.value))
  }

  const handleJoplinUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let url = e.target.value
    // 确保URL以/结尾，但只在失去焦点时执行
    if (url && !url.endsWith('/')) {
      url = `${url}/`
      dispatch(setJoplinUrl(url))
    }
  }

  const handleJoplinConnectionCheck = async () => {
    try {
      if (!joplinToken) {
        window.toast.error('请先输入 Joplin 授权令牌')
        return
      }
      if (!joplinUrl) {
        window.toast.error('请先输入 Joplin 剪裁服务监听 URL')
        return
      }

      const response = await fetch(`${joplinUrl}notes?limit=1&token=${joplinToken}`)

      const data = await response.json()

      if (!response.ok || data?.error) {
        window.toast.error('Joplin 连接验证失败')
        return
      }

      window.toast.success('Joplin 连接验证成功')
    } catch (e) {
      window.toast.error('Joplin 连接验证失败')
    }
  }

  const handleJoplinHelpClick = () => {
    openSmartMinapp({
      id: 'joplin-help',
      name: 'Joplin Help',
      url: 'https://joplinapp.org/help/apps/clipper',
      logo: AppLogo
    })
  }

  const handleToggleJoplinExportReasoning = (checked: boolean) => {
    dispatch(setJoplinExportReasoning(checked))
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle>{'Joplin 配置'}</SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'Joplin 剪裁服务监听 URL'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={joplinUrl || ''}
            onChange={handleJoplinUrlChange}
            onBlur={handleJoplinUrlBlur}
            style={{ width: 315 }}
            placeholder={'http://127.0.0.1:41184/'}
          />
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle style={{ display: 'flex', alignItems: 'center' }}>
          <span>{'Joplin 授权令牌'}</span>
          <Tooltip
            title={'在 Joplin 选项中，启用网页剪裁服务（无需安装浏览器插件），确认端口号，并复制授权令牌'}
            placement="left">
            <InfoCircleOutlined
              style={{ color: 'var(--color-text-2)', cursor: 'pointer', marginLeft: 4 }}
              onClick={handleJoplinHelpClick}
            />
          </Tooltip>
        </SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              value={joplinToken || ''}
              onChange={handleJoplinTokenChange}
              onBlur={handleJoplinTokenChange}
              placeholder={'请输入 Joplin 授权令牌'}
              style={{ width: '100%' }}
            />
            <Button onClick={handleJoplinConnectionCheck}>{'检测'}</Button>
          </Space.Compact>
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'导出时包含思维链'}</SettingRowTitle>
        <Switch checked={joplinExportReasoning} onChange={handleToggleJoplinExportReasoning} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>{'开启后，导出到 Joplin 时会包含思维链内容。'}</SettingHelpText>
      </SettingRow>
    </SettingGroup>
  )
}

export default JoplinSettings
