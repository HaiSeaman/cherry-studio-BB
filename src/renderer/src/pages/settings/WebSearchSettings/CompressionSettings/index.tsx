import { useWebSearchSettings } from '@renderer/hooks/useWebSearchProviders'
import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '@renderer/pages/settings'
import { Select } from 'antd'

import CutoffSettings from './CutoffSettings'

const INPUT_BOX_WIDTH_CUTOFF = '200px'

const CompressionSettings = () => {
  const { compressionConfig, updateCompressionConfig } = useWebSearchSettings()

  const compressionMethodOptions = [
    { value: 'none', label: '不压缩' },
    { value: 'cutoff', label: '截断' }
  ]

  const handleCompressionMethodChange = (method: 'none' | 'cutoff') => {
    updateCompressionConfig({ method })
  }

  return (
    <SettingGroup>
      <SettingTitle>{'搜索结果压缩'}</SettingTitle>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'压缩方法'}</SettingRowTitle>
        <Select
          value={compressionConfig?.method || 'none'}
          style={{ width: INPUT_BOX_WIDTH_CUTOFF }}
          onChange={handleCompressionMethodChange}
          options={compressionMethodOptions}
        />
      </SettingRow>
      <SettingDivider />

      {compressionConfig?.method === 'cutoff' && <CutoffSettings />}
    </SettingGroup>
  )
}

export default CompressionSettings
