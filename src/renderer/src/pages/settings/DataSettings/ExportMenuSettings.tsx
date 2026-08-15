import { useTheme } from '@renderer/context/ThemeProvider'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import { setExportMenuOptions } from '@renderer/store/settings'
import { Switch } from 'antd'
import type { FC } from 'react'
import { useSelector } from 'react-redux'

import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

const ExportMenuOptions: FC = () => {
  const { theme } = useTheme()
  const dispatch = useAppDispatch()

  const exportMenuOptions = useSelector((state: RootState) => state.settings.exportMenuOptions)

  const handleToggleOption = (option: string, checked: boolean) => {
    dispatch(
      setExportMenuOptions({
        ...exportMenuOptions,
        [option]: checked
      })
    )
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle>{'导出菜单设置'}</SettingTitle>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出为图片'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.image} onChange={(checked) => handleToggleOption('image', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出为 Markdown'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.markdown} onChange={(checked) => handleToggleOption('markdown', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出为 Markdown（包含思考）'}</SettingRowTitle>
        <Switch
          checked={exportMenuOptions.markdown_reason}
          onChange={(checked) => handleToggleOption('markdown_reason', checked)}
        />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出到 Notion'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.notion} onChange={(checked) => handleToggleOption('notion', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出到语雀'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.yuque} onChange={(checked) => handleToggleOption('yuque', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出到 Joplin'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.joplin} onChange={(checked) => handleToggleOption('joplin', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出到 Obsidian'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.obsidian} onChange={(checked) => handleToggleOption('obsidian', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出到思源笔记'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.siyuan} onChange={(checked) => handleToggleOption('siyuan', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'导出为 Word'}</SettingRowTitle>
        <Switch checked={exportMenuOptions.docx} onChange={(checked) => handleToggleOption('docx', checked)} />
      </SettingRow>
      <SettingDivider />

      <SettingRow>
        <SettingRowTitle>{'复制为纯文本'}</SettingRowTitle>
        <Switch
          checked={exportMenuOptions.plain_text}
          onChange={(checked) => handleToggleOption('plain_text', checked)}
        />
      </SettingRow>
    </SettingGroup>
  )
}

export default ExportMenuOptions
