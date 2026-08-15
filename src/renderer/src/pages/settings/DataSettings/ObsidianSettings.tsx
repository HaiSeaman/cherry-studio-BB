import { loggerService } from '@logger'
import { HStack } from '@renderer/components/Layout'
import { useSettings } from '@renderer/hooks/useSettings'
import { useAppDispatch } from '@renderer/store'
import { setDefaultObsidianVault } from '@renderer/store/settings'
import { Empty, Select, Spin } from 'antd'
import type { FC } from 'react'
import { useEffect, useState } from 'react'

import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

const logger = loggerService.withContext('ObsidianSettings')

const { Option } = Select

const ObsidianSettings: FC = () => {
  const { defaultObsidianVault } = useSettings()
  const dispatch = useAppDispatch()

  const [vaults, setVaults] = useState<Array<{ path: string; name: string }>>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // 组件加载时获取Vault列表
  useEffect(() => {
    const fetchVaults = async () => {
      try {
        setLoading(true)
        setError(null)
        const vaultsData = await window.api.obsidian.getVaults()

        if (vaultsData.length === 0) {
          setError('未找到 Obsidian 仓库')
          setLoading(false)
          return
        }

        setVaults(vaultsData)

        // 如果没有设置默认vault，则选择第一个
        if (!defaultObsidianVault && vaultsData.length > 0) {
          dispatch(setDefaultObsidianVault(vaultsData[0].name))
        }
      } catch (error) {
        logger.error('获取Obsidian Vault失败:', error as Error)
        setError('获取 Obsidian 仓库失败')
      } finally {
        setLoading(false)
      }
    }

    void fetchVaults()
  }, [dispatch, defaultObsidianVault])

  const handleChange = (value: string) => {
    dispatch(setDefaultObsidianVault(value))
  }

  return (
    <SettingGroup>
      <SettingTitle>{'Obsidian 配置'}</SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'默认 Obsidian 仓库'}</SettingRowTitle>
        <HStack gap="5px">
          <Spin spinning={loading} size="small">
            {vaults.length > 0 ? (
              <Select
                value={defaultObsidianVault || undefined}
                onChange={handleChange}
                placeholder={'请选择默认 Obsidian 仓库'}
                style={{ width: 300 }}>
                {vaults.map((vault) => (
                  <Option key={vault.name} value={vault.name}>
                    {vault.name}
                  </Option>
                ))}
              </Select>
            ) : (
              <Empty
                description={loading ? '正在获取 Obsidian 仓库...' : error || '未找到 Obsidian 仓库'}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </Spin>
        </HStack>
      </SettingRow>
    </SettingGroup>
  )
}

export default ObsidianSettings
