import { DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { useTheme } from '@renderer/context/ThemeProvider'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import {
  setExcludeCitationsInExport,
  setForceDollarMathInMarkdown,
  setmarkdownExportPath,
  setShowModelNameInMarkdown,
  setShowModelProviderInMarkdown,
  setStandardizeCitationsInExport,
  setUseTopicNamingForMessageTitle
} from '@renderer/store/settings'
import { Button, Switch } from 'antd'
import Input from 'antd/es/input/Input'
import type { FC } from 'react'
import { useSelector } from 'react-redux'

import { SettingDivider, SettingGroup, SettingHelpText, SettingRow, SettingRowTitle, SettingTitle } from '..'

const MarkdownExportSettings: FC = () => {
  const { theme } = useTheme()
  const dispatch = useAppDispatch()

  const markdownExportPath = useSelector((state: RootState) => state.settings.markdownExportPath)
  const forceDollarMathInMarkdown = useSelector((state: RootState) => state.settings.forceDollarMathInMarkdown)
  const useTopicNamingForMessageTitle = useSelector((state: RootState) => state.settings.useTopicNamingForMessageTitle)
  const showModelNameInExport = useSelector((state: RootState) => state.settings.showModelNameInMarkdown)
  const showModelProviderInMarkdown = useSelector((state: RootState) => state.settings.showModelProviderInMarkdown)
  const excludeCitationsInExport = useSelector((state: RootState) => state.settings.excludeCitationsInExport)
  const standardizeCitationsInExport = useSelector((state: RootState) => state.settings.standardizeCitationsInExport)

  const handleSelectFolder = async () => {
    const path = await window.api.file.selectFolder()
    if (path) {
      dispatch(setmarkdownExportPath(path))
    }
  }

  const handleClearPath = () => {
    dispatch(setmarkdownExportPath(null))
  }

  const handleToggleForceDollarMath = (checked: boolean) => {
    dispatch(setForceDollarMathInMarkdown(checked))
  }

  const handleToggleTopicNaming = (checked: boolean) => {
    dispatch(setUseTopicNamingForMessageTitle(checked))
  }

  const handleToggleShowModelName = (checked: boolean) => {
    dispatch(setShowModelNameInMarkdown(checked))
  }

  const handleToggleShowModelProvider = (checked: boolean) => {
    dispatch(setShowModelProviderInMarkdown(checked))
  }

  const handleToggleExcludeCitations = (checked: boolean) => {
    dispatch(setExcludeCitationsInExport(checked))
  }

  const handleToggleStandardizeCitations = (checked: boolean) => {
    dispatch(setStandardizeCitationsInExport(checked))
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle>{'Markdown 导出'}</SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'默认导出路径'}</SettingRowTitle>
        <HStack alignItems="center" gap="5px" style={{ width: 315 }}>
          <Input
            type="text"
            value={markdownExportPath || ''}
            readOnly
            style={{ width: 250 }}
            placeholder={'导出路径'}
            suffix={
              markdownExportPath ? (
                <DeleteOutlined onClick={handleClearPath} style={{ color: 'var(--color-error)', cursor: 'pointer' }} />
              ) : null
            }
          />
          <Button onClick={handleSelectFolder} icon={<FolderOpenOutlined />}>
            {'选择'}
          </Button>
        </HStack>
      </SettingRow>
      <SettingRow>
        <SettingHelpText>{'若填入，则每次导出时将自动保存到该路径；否则，将弹出保存对话框'}</SettingHelpText>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'强制使用 $$ 来标记 LaTeX 公式'}</SettingRowTitle>
        <Switch checked={forceDollarMathInMarkdown} onChange={handleToggleForceDollarMath} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>
          {
            '开启后，导出 Markdown 时会将强制使用 $$ 来标记 LaTeX 公式。注意：该项也会影响所有通过 Markdown 导出的方式，如 Notion、语雀等'
          }
        </SettingHelpText>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'使用快速模型为导出的消息命名标题'}</SettingRowTitle>
        <Switch checked={useTopicNamingForMessageTitle} onChange={handleToggleTopicNaming} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>
          {'开启后，使用快速模型为导出的消息命名标题。该项也会影响所有通过 Markdown 导出的方式'}
        </SettingHelpText>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'导出时使用模型名称'}</SettingRowTitle>
        <Switch checked={showModelNameInExport} onChange={handleToggleShowModelName} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>
          {
            '开启后，导出 Markdown 时会显示模型名称。注意：该项也会影响所有通过 Markdown 导出的方式，如 Notion、语雀等。'
          }
        </SettingHelpText>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'显示模型供应商'}</SettingRowTitle>
        <Switch checked={showModelProviderInMarkdown} onChange={handleToggleShowModelProvider} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>{'在导出 Markdown 时显示模型供应商，如 OpenAI、Gemini 等'}</SettingHelpText>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'不导出引用内容'}</SettingRowTitle>
        <Switch checked={excludeCitationsInExport} onChange={handleToggleExcludeCitations} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>{'导出 Markdown 时排除引用和参考文献，仅保留主要内容'}</SettingHelpText>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'标准化引用格式'}</SettingRowTitle>
        <Switch checked={standardizeCitationsInExport} onChange={handleToggleStandardizeCitations} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>
          {'开启后，导出 Markdown 时会将引用标记转换为标准 Markdown 脚注格式 [^1]，并格式化引用列表'}
        </SettingHelpText>
      </SettingRow>
    </SettingGroup>
  )
}

export default MarkdownExportSettings
