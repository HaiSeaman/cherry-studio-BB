import { HStack } from '@renderer/components/Layout'
import ImportPopup from '@renderer/components/Popups/ImportPopup'
import { useTheme } from '@renderer/context/ThemeProvider'
import { Button } from 'antd'
import type { FC } from 'react'

import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

const ImportMenuOptions: FC = () => {
  const { theme } = useTheme()
  return (
    <SettingGroup theme={theme}>
      <SettingRow>
        <SettingTitle>{'导入外部应用数据'}</SettingTitle>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'导入 ChatGPT 数据'}</SettingRowTitle>
        <HStack gap="5px" justifyContent="space-between">
          <Button onClick={ImportPopup.show}>{'导入文件'}</Button>
        </HStack>
      </SettingRow>
    </SettingGroup>
  )
}

export default ImportMenuOptions
