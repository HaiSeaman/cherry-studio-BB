import { InfoCircleOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { AppLogo } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import { setYuqueRepoId, setYuqueToken, setYuqueUrl } from '@renderer/store/settings'
import { Button, Space, Tooltip } from 'antd'
import { Input } from 'antd'
import type { FC } from 'react'
import { useSelector } from 'react-redux'

import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

const YuqueSettings: FC = () => {
  const { theme } = useTheme()
  const dispatch = useAppDispatch()
  const { openSmartMinapp } = useMinappPopup()

  const yuqueToken = useSelector((state: RootState) => state.settings.yuqueToken)
  const yuqueUrl = useSelector((state: RootState) => state.settings.yuqueUrl)

  const handleYuqueTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setYuqueToken(e.target.value))
  }

  const handleYuqueRepoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setYuqueUrl(e.target.value))
  }

  const handleYuqueConnectionCheck = async () => {
    if (!yuqueToken) {
      window.toast.error('请先输入语雀 Token')
      return
    }
    if (!yuqueUrl) {
      window.toast.error('.key请先输入知识库 URL')
      return
    }

    const response = await fetch('https://www.yuque.com/api/v2/hello', {
      headers: {
        'X-Auth-Token': yuqueToken
      }
    })

    if (!response.ok) {
      window.toast.error('语雀连接验证失败')
      return
    }
    const yuqueSlug = yuqueUrl.replace('https://www.yuque.com/', '')
    const repoIDResponse = await fetch(`https://www.yuque.com/api/v2/repos/${yuqueSlug}`, {
      headers: {
        'X-Auth-Token': yuqueToken
      }
    })
    if (!repoIDResponse.ok) {
      window.toast.error('语雀连接验证失败')
      return
    }
    const data = await repoIDResponse.json()
    dispatch(setYuqueRepoId(data.data.id))
    window.toast.success('语雀连接验证成功')
  }

  const handleYuqueHelpClick = () => {
    openSmartMinapp({
      id: 'yuque-help',
      name: 'Yuque Help',
      url: 'https://www.yuque.com/settings/tokens',
      logo: AppLogo
    })
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle>{'语雀配置'}</SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'知识库 URL'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={yuqueUrl || ''}
            onChange={handleYuqueRepoUrlChange}
            style={{ width: 315 }}
            placeholder={'https://www.yuque.com/username/xxx'}
          />
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>
          {'语雀 Token'}
          <Tooltip title={'获取语雀 Token'} placement="left">
            <InfoCircleOutlined
              style={{ color: 'var(--color-text-2)', cursor: 'pointer', marginLeft: 4 }}
              onClick={handleYuqueHelpClick}
            />
          </Tooltip>
        </SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              value={yuqueToken || ''}
              onChange={handleYuqueTokenChange}
              onBlur={handleYuqueTokenChange}
              placeholder={'请输入语雀 Token'}
              style={{ width: '100%' }}
            />
            <Button onClick={handleYuqueConnectionCheck}>{'检测'}</Button>
          </Space.Compact>
        </HStack>
      </SettingRow>
    </SettingGroup>
  )
}

export default YuqueSettings
