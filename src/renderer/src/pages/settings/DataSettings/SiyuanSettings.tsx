import { InfoCircleOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { HStack } from '@renderer/components/Layout'
import { AppLogo } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import { setSiyuanApiUrl, setSiyuanBoxId, setSiyuanRootPath, setSiyuanToken } from '@renderer/store/settings'
import { Button, Space, Tooltip } from 'antd'
import { Input } from 'antd'
import type { FC } from 'react'
import { useSelector } from 'react-redux'

import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

const logger = loggerService.withContext('SiyuanSettings')

const SiyuanSettings: FC = () => {
  const { openSmartMinapp } = useMinappPopup()
  const { theme } = useTheme()
  const dispatch = useAppDispatch()

  const siyuanApiUrl = useSelector((state: RootState) => state.settings.siyuanApiUrl)
  const siyuanToken = useSelector((state: RootState) => state.settings.siyuanToken)
  const siyuanBoxId = useSelector((state: RootState) => state.settings.siyuanBoxId)
  const siyuanRootPath = useSelector((state: RootState) => state.settings.siyuanRootPath)

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSiyuanApiUrl(e.target.value))
  }

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSiyuanToken(e.target.value))
  }

  const handleBoxIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSiyuanBoxId(e.target.value))
  }

  const handleRootPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSiyuanRootPath(e.target.value))
  }

  const handleSiyuanHelpClick = () => {
    openSmartMinapp({
      id: 'siyuan-help',
      name: 'Siyuan Help',
      url: 'https://docs.cherry-ai.com/advanced-basic/siyuan',
      logo: AppLogo
    })
  }

  const handleCheckConnection = async () => {
    try {
      if (!siyuanApiUrl || !siyuanToken) {
        window.toast.error('请填写 API 地址和令牌')
        return
      }

      const response = await fetch(`${siyuanApiUrl}/api/notebook/lsNotebooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${siyuanToken}`
        }
      })

      if (!response.ok) {
        window.toast.error('连接失败，请检查 API 地址和令牌')
        return
      }

      const data = await response.json()
      if (data.code !== 0) {
        window.toast.error('连接失败，请检查 API 地址和令牌')
        return
      }

      window.toast.success('连接成功')
    } catch (error) {
      logger.error('Check Siyuan connection failed:', error as Error)
      window.toast.error('连接异常，请检查网络连接')
    }
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle>{'思源笔记配置'}</SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'API 地址'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={siyuanApiUrl || ''}
            onChange={handleApiUrlChange}
            style={{ width: 315 }}
            placeholder={'例如：http://127.0.0.1:6806'}
          />
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle style={{ display: 'flex', alignItems: 'center' }}>
          <span>{'API 令牌'}</span>
          <Tooltip title={'在思源笔记 -> 设置 -> 关于中获取'} placement="left">
            <InfoCircleOutlined
              style={{ color: 'var(--color-text-2)', cursor: 'pointer', marginLeft: 4 }}
              onClick={handleSiyuanHelpClick}
            />
          </Tooltip>
        </SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              value={siyuanToken || ''}
              onChange={handleTokenChange}
              onBlur={handleTokenChange}
              placeholder={'请输入思源笔记令牌'}
              style={{ width: '100%' }}
            />
            <Button onClick={handleCheckConnection}>{'检测'}</Button>
          </Space.Compact>
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'笔记本 ID'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={siyuanBoxId || ''}
            onChange={handleBoxIdChange}
            style={{ width: 315 }}
            placeholder={'请输入笔记本 ID'}
          />
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'文档根路径'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={siyuanRootPath || ''}
            onChange={handleRootPathChange}
            style={{ width: 315 }}
            placeholder={'例如：/CherryStudio'}
          />
        </HStack>
      </SettingRow>
    </SettingGroup>
  )
}

export default SiyuanSettings
