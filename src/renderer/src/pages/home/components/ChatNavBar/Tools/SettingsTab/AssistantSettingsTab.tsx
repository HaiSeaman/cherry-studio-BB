import EditableNumber from '@renderer/components/EditableNumber'
import Scrollbar from '@renderer/components/Scrollbar'
import Selector from '@renderer/components/Selector'
import { HelpTooltip } from '@renderer/components/TooltipIcons'
import { isOpenAIModel, isSupportVerbosityModel } from '@renderer/config/models'
import { UNKNOWN } from '@renderer/config/translate'
import { useCodeStyle } from '@renderer/context/CodeStyleProvider'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useProvider } from '@renderer/hooks/useProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import useTranslate from '@renderer/hooks/useTranslate'
import { SettingDivider, SettingRow, SettingRowTitle } from '@renderer/pages/settings'
import { CollapsibleSettingGroup } from '@renderer/pages/settings/SettingGroup'
import { getDefaultModel } from '@renderer/services/AssistantService'
import { useAppDispatch } from '@renderer/store'
import type { SendMessageShortcut } from '@renderer/store/settings'
import {
  setAutoTranslateWithSpace,
  setCodeCollapsible,
  setCodeEditor,
  setCodeFancyBlock,
  setCodeImageTools,
  setCodeShowLineNumbers,
  setCodeViewer,
  setCodeWrappable,
  setConfirmDeleteMessage,
  setConfirmRegenerateMessage,
  setEnableQuickPanelTriggers,
  setFontSize,
  setMathEnableSingleDollar,
  setMathEngine,
  setMessageFont,
  setMessageNavigation,
  setMessageStyle,
  setMultiModelMessageStyle,
  setPasteLongTextAsFile,
  setPasteLongTextThreshold,
  setRenderInputMessageAsMarkdown,
  setShowInputEstimatedTokens,
  setShowMessageOutline,
  setShowPrompt,
  setShowTranslateConfirm,
  setThoughtAutoCollapse
} from '@renderer/store/settings'
import type { Assistant, CodeStyleVarious, MathEngine } from '@renderer/types'
import { isGroqSystemProvider, ThemeMode } from '@renderer/types'
import { getSendMessageShortcutLabel } from '@renderer/utils/input'
import {
  isOpenAICompatibleProvider,
  isSupportServiceTierProvider,
  isSupportVerbosityProvider
} from '@renderer/utils/provider'
import { Col, Row, Slider, Switch } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import GroqSettingsGroup from './GroqSettingsGroup'
import OpenAISettingsGroup from './OpenAISettingsGroup'

interface Props {
  assistant: Assistant
}

const AssistantSettingsTab = (props: Props) => {
  const { assistant } = useAssistant(props.assistant.id)
  const { provider } = useProvider(assistant.model.provider)

  const { messageStyle, fontSize, language } = useSettings()
  const { theme } = useTheme()
  const { themeNames } = useCodeStyle()

  const [fontSizeValue, setFontSizeValue] = useState(fontSize)
  const { translateLanguages } = useTranslate()

  const dispatch = useAppDispatch()

  const {
    showPrompt,
    messageFont,
    showInputEstimatedTokens,
    sendMessageShortcut,
    setSendMessageShortcut,
    targetLanguage,
    setTargetLanguage,
    pasteLongTextAsFile,
    renderInputMessageAsMarkdown,
    codeShowLineNumbers,
    codeCollapsible,
    codeWrappable,
    codeEditor,
    codeViewer,
    codeImageTools,
    codeFancyBlock,
    mathEngine,
    mathEnableSingleDollar,
    autoTranslateWithSpace,
    pasteLongTextThreshold,
    multiModelMessageStyle,
    thoughtAutoCollapse,
    messageNavigation,
    enableQuickPanelTriggers,
    showTranslateConfirm,
    showMessageOutline,
    confirmDeleteMessage,
    confirmRegenerateMessage
  } = useSettings()

  const codeStyle = useMemo(() => {
    return codeEditor.enabled
      ? theme === ThemeMode.light
        ? codeEditor.themeLight
        : codeEditor.themeDark
      : theme === ThemeMode.light
        ? codeViewer.themeLight
        : codeViewer.themeDark
  }, [
    codeEditor.enabled,
    codeEditor.themeLight,
    codeEditor.themeDark,
    theme,
    codeViewer.themeLight,
    codeViewer.themeDark
  ])

  const onCodeStyleChange = useCallback(
    (value: CodeStyleVarious) => {
      const field = theme === ThemeMode.light ? 'themeLight' : 'themeDark'
      const action = codeEditor.enabled ? setCodeEditor : setCodeViewer
      dispatch(action({ [field]: value }))
    },
    [dispatch, theme, codeEditor.enabled]
  )

  const model = assistant.model || getDefaultModel()

  const showOpenAiSettings =
    isOpenAICompatibleProvider(provider) ||
    isOpenAIModel(model) ||
    isSupportServiceTierProvider(provider) ||
    (isSupportVerbosityModel(model) && isSupportVerbosityProvider(provider))

  return (
    <Container className="settings-tab">
      {showOpenAiSettings && (
        <OpenAISettingsGroup
          model={model}
          providerId={provider.id}
          SettingGroup={SettingGroup}
          SettingRowTitleSmall={SettingRowTitleSmall}
        />
      )}
      {isGroqSystemProvider(provider) && (
        <GroqSettingsGroup SettingGroup={SettingGroup} SettingRowTitleSmall={SettingRowTitleSmall} />
      )}
      <CollapsibleSettingGroup title={'消息设置'} defaultExpanded={true}>
        <SettingGroup>
          <SettingRow>
            <SettingRowTitleSmall>{'显示提示词'}</SettingRowTitleSmall>
            <Switch size="small" checked={showPrompt} onChange={(checked) => dispatch(setShowPrompt(checked))} />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'使用衬线字体'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={messageFont === 'serif'}
              onChange={(checked) => dispatch(setMessageFont(checked ? 'serif' : 'system'))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>
              {'思考内容自动折叠'}
              <HelpTooltip title={'思考结束后思考内容自动折叠'} />
            </SettingRowTitleSmall>
            <Switch
              size="small"
              checked={thoughtAutoCollapse}
              onChange={(checked) => dispatch(setThoughtAutoCollapse(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'显示消息大纲'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={showMessageOutline}
              onChange={(checked) => dispatch(setShowMessageOutline(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'消息样式'}</SettingRowTitleSmall>
            <Selector
              value={messageStyle}
              onChange={(value) => dispatch(setMessageStyle(value))}
              options={[
                { value: 'plain', label: '简洁' },
                { value: 'bubble', label: '气泡' }
              ]}
            />
          </SettingRow>
          <SettingDivider />

          <SettingRow>
            <SettingRowTitleSmall>{'多模型回答样式'}</SettingRowTitleSmall>
            <Selector
              value={multiModelMessageStyle}
              onChange={(value) => dispatch(setMultiModelMessageStyle(value))}
              options={[
                { value: 'fold', label: '标签模式' },
                { value: 'vertical', label: '纵向堆叠' },
                { value: 'horizontal', label: '横向排列' },
                { value: 'grid', label: '卡片布局' }
              ]}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'对话导航按钮'}</SettingRowTitleSmall>
            <Selector
              value={messageNavigation}
              onChange={(value) => dispatch(setMessageNavigation(value))}
              options={[
                { value: 'none', label: '不显示' },
                { value: 'buttons', label: '上下按钮' },
                { value: 'anchor', label: '对话锚点' }
              ]}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'消息字体大小'}</SettingRowTitleSmall>
          </SettingRow>
          <Row align="middle" gutter={10}>
            <Col span={24}>
              <Slider
                value={fontSizeValue}
                onChange={(value) => setFontSizeValue(value)}
                onChangeComplete={(value) => dispatch(setFontSize(value))}
                min={12}
                max={22}
                step={1}
                marks={{
                  12: <span style={{ fontSize: '12px' }}>A</span>,
                  14: <span style={{ fontSize: '14px' }}>{'默认'}</span>,
                  22: <span style={{ fontSize: '18px' }}>A</span>
                }}
              />
            </Col>
          </Row>
          <SettingDivider />
        </SettingGroup>
      </CollapsibleSettingGroup>
      <CollapsibleSettingGroup title={'数学公式设置'} defaultExpanded={false}>
        <SettingGroup>
          <SettingRow>
            <SettingRowTitleSmall>{'数学公式引擎'}</SettingRowTitleSmall>
            <Selector
              value={mathEngine}
              onChange={(value) => dispatch(setMathEngine(value as MathEngine))}
              options={[
                { value: 'KaTeX', label: 'KaTeX' },
                { value: 'MathJax', label: 'MathJax' },
                { value: 'none', label: '无' }
              ]}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>
              {'启用 $...$'}
              <HelpTooltip title={'渲染单个美元符号 $...$ 包裹的数学公式，默认启用。'} />
            </SettingRowTitleSmall>
            <Switch
              size="small"
              checked={mathEnableSingleDollar}
              onChange={(checked) => dispatch(setMathEnableSingleDollar(checked))}
            />
          </SettingRow>
          <SettingDivider />
        </SettingGroup>
      </CollapsibleSettingGroup>
      <CollapsibleSettingGroup title={'代码块设置'} defaultExpanded={false}>
        <SettingGroup>
          <SettingRow>
            <SettingRowTitleSmall>{'代码风格'}</SettingRowTitleSmall>
            <Selector
              value={codeStyle}
              onChange={(value) => onCodeStyleChange(value)}
              options={themeNames.map((theme) => ({
                value: theme,
                label: theme
              }))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>
              {'花式代码块'}
              <HelpTooltip title={'使用更美观的代码块样式，例如 HTML 卡片'} />
            </SettingRowTitleSmall>
            <Switch
              size="small"
              checked={codeFancyBlock}
              onChange={(checked) => dispatch(setCodeFancyBlock(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'代码编辑器'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={codeEditor.enabled}
              onChange={(checked) => dispatch(setCodeEditor({ enabled: checked }))}
            />
          </SettingRow>
          {codeEditor.enabled && (
            <>
              <SettingDivider />
              <SettingRow style={{ paddingLeft: 8 }}>
                <SettingRowTitleSmall>{'高亮当前行'}</SettingRowTitleSmall>
                <Switch
                  size="small"
                  checked={codeEditor.highlightActiveLine}
                  onChange={(checked) => dispatch(setCodeEditor({ highlightActiveLine: checked }))}
                />
              </SettingRow>
              <SettingDivider />
              <SettingRow style={{ paddingLeft: 8 }}>
                <SettingRowTitleSmall>{'折叠控件'}</SettingRowTitleSmall>
                <Switch
                  size="small"
                  checked={codeEditor.foldGutter}
                  onChange={(checked) => dispatch(setCodeEditor({ foldGutter: checked }))}
                />
              </SettingRow>
              <SettingDivider />
              <SettingRow style={{ paddingLeft: 8 }}>
                <SettingRowTitleSmall>{'自动补全'}</SettingRowTitleSmall>
                <Switch
                  size="small"
                  checked={codeEditor.autocompletion}
                  onChange={(checked) => dispatch(setCodeEditor({ autocompletion: checked }))}
                />
              </SettingRow>
              <SettingDivider />
              <SettingRow style={{ paddingLeft: 8 }}>
                <SettingRowTitleSmall>{'快捷键'}</SettingRowTitleSmall>
                <Switch
                  size="small"
                  checked={codeEditor.keymap}
                  onChange={(checked) => dispatch(setCodeEditor({ keymap: checked }))}
                />
              </SettingRow>
            </>
          )}
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'代码显示行号'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={codeShowLineNumbers}
              onChange={(checked) => dispatch(setCodeShowLineNumbers(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'代码块可折叠'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={codeCollapsible}
              onChange={(checked) => dispatch(setCodeCollapsible(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'代码块可换行'}</SettingRowTitleSmall>
            <Switch size="small" checked={codeWrappable} onChange={(checked) => dispatch(setCodeWrappable(checked))} />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>
              {'启用预览工具'}
              <HelpTooltip title={'为 mermaid 等代码块渲染后的图像启用预览工具'} />
            </SettingRowTitleSmall>
            <Switch
              size="small"
              checked={codeImageTools}
              onChange={(checked) => dispatch(setCodeImageTools(checked))}
            />
          </SettingRow>
        </SettingGroup>
        <SettingDivider />
      </CollapsibleSettingGroup>
      <CollapsibleSettingGroup title={'输入设置'} defaultExpanded={false}>
        <SettingGroup>
          <SettingRow>
            <SettingRowTitleSmall>{'显示预估 Token 数'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={showInputEstimatedTokens}
              onChange={(checked) => dispatch(setShowInputEstimatedTokens(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'长文本粘贴为文件'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={pasteLongTextAsFile}
              onChange={(checked) => dispatch(setPasteLongTextAsFile(checked))}
            />
          </SettingRow>
          {pasteLongTextAsFile && (
            <>
              <SettingDivider />
              <SettingRow>
                <SettingRowTitleSmall>{'长文本长度'}</SettingRowTitleSmall>
                <EditableNumber
                  size="small"
                  min={500}
                  max={10000}
                  step={100}
                  value={pasteLongTextThreshold}
                  onChange={(value) => dispatch(setPasteLongTextThreshold(value ?? 500))}
                  style={{ width: 80 }}
                />
              </SettingRow>
            </>
          )}
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'Markdown 渲染输入消息'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={renderInputMessageAsMarkdown}
              onChange={(checked) => dispatch(setRenderInputMessageAsMarkdown(checked))}
            />
          </SettingRow>
          <SettingDivider />
          {!language.startsWith('en') && (
            <>
              <SettingRow>
                <SettingRowTitleSmall>{'3 个空格快速翻译'}</SettingRowTitleSmall>
                <Switch
                  size="small"
                  checked={autoTranslateWithSpace}
                  onChange={(checked) => dispatch(setAutoTranslateWithSpace(checked))}
                />
              </SettingRow>
              <SettingDivider />
            </>
          )}
          <SettingRow>
            <SettingRowTitleSmall>{'显示翻译确认对话框'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={showTranslateConfirm}
              onChange={(checked) => dispatch(setShowTranslateConfirm(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'启用 / 和 @ 触发快捷菜单'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={enableQuickPanelTriggers}
              onChange={(checked) => dispatch(setEnableQuickPanelTriggers(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'删除消息前确认'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={confirmDeleteMessage}
              onChange={(checked) => dispatch(setConfirmDeleteMessage(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'重新生成消息前确认'}</SettingRowTitleSmall>
            <Switch
              size="small"
              checked={confirmRegenerateMessage}
              onChange={(checked) => dispatch(setConfirmRegenerateMessage(checked))}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'目标语言'}</SettingRowTitleSmall>
            <Selector
              value={targetLanguage}
              onChange={(value) => setTargetLanguage(value)}
              placeholder={UNKNOWN.emoji + ' ' + UNKNOWN.label()}
              options={translateLanguages.map((item) => {
                return { value: item.langCode, label: item.emoji + ' ' + item.label() }
              })}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitleSmall>{'发送快捷键'}</SettingRowTitleSmall>
            <Selector
              value={sendMessageShortcut}
              onChange={(value) => setSendMessageShortcut(value as SendMessageShortcut)}
              options={[
                { value: 'Enter', label: getSendMessageShortcutLabel('Enter') },
                { value: 'Ctrl+Enter', label: getSendMessageShortcutLabel('Ctrl+Enter') },
                { value: 'Alt+Enter', label: getSendMessageShortcutLabel('Alt+Enter') },
                { value: 'Command+Enter', label: getSendMessageShortcutLabel('Command+Enter') },
                { value: 'Shift+Enter', label: getSendMessageShortcutLabel('Shift+Enter') }
              ]}
            />
          </SettingRow>
        </SettingGroup>
      </CollapsibleSettingGroup>
    </Container>
  )
}

const Container = styled(Scrollbar)`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 8px;
  padding-right: 0;
  padding-top: 2px;
  padding-bottom: 10px;
  margin-top: 3px;
`

const SettingRowTitleSmall = styled(SettingRowTitle)`
  font-size: 13px;
  gap: 4px;
`

const SettingGroup = styled.div<{ theme?: ThemeMode }>`
  padding: 0 5px;
  width: 100%;
  margin-top: 0;
  border-radius: 8px;
  margin-bottom: 10px;
`

export default AssistantSettingsTab
