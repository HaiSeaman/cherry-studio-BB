import CodeEditor from '@renderer/components/CodeEditor'
import { ResetIcon } from '@renderer/components/Icons'
import TextBadge from '@renderer/components/TextBadge'
import { isLinux, isMac } from '@renderer/config/constant'
import { DEFAULT_SIDEBAR_ICONS } from '@renderer/config/sidebar'
import { THEMES } from '@renderer/config/themes'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTimer } from '@renderer/hooks/useTimer'
import useUserTheme from '@renderer/hooks/useUserTheme'
import { useAppDispatch } from '@renderer/store'
import type { AssistantIconType } from '@renderer/store/settings'
import {
  setAssistantIconType,
  setClickAssistantToShowTopic,
  setCustomCss,
  setPinTopicsToTop,
  setShowTopicTime,
  setSidebarIcons,
  setThemeId
} from '@renderer/store/settings'
import { Button, Segmented, Select, Switch, Tooltip } from 'antd'
import { Minus, Plus } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'
import SidebarIconsManager from './SidebarIconsManager'

/** 主题选择：胶囊色块 + 名称，选中描边高亮 */
const ThemePicker = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const ThemeOption = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid ${(p) => (p.$active ? 'var(--color-primary)' : 'var(--color-border)')};
  border-radius: 999px;
  padding: 4px 12px 4px 8px;
  font-size: 12px;
  color: ${(p) => (p.$active ? 'var(--color-text)' : 'var(--color-text-2)')};
  background: ${(p) => (p.$active ? 'var(--color-primary-mute)' : 'transparent')};
  cursor: pointer;
  transition: all 0.18s ease;
  &:hover {
    border-color: var(--color-primary);
    color: var(--color-text);
  }
`

const ThemeDot = styled.span`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
`

const DisplaySettings: FC = () => {
  const {
    windowStyle,
    setWindowStyle,
    topicPosition,
    setTopicPosition,
    clickAssistantToShowTopic,
    showTopicTime,
    pinTopicsToTop,
    customCss,
    sidebarIcons,
    themeId,
    assistantIconType,
    userTheme,
    useSystemTitleBar,
    setUseSystemTitleBar
  } = useSettings()
  const { theme } = useTheme()
  const dispatch = useAppDispatch()
  const { setTimeoutTimer } = useTimer()
  const [currentZoom, setCurrentZoom] = useState(1.0)
  const { setUserTheme } = useUserTheme()

  const [visibleIcons, setVisibleIcons] = useState(sidebarIcons?.visible || DEFAULT_SIDEBAR_ICONS)
  const [disabledIcons, setDisabledIcons] = useState(sidebarIcons?.disabled || [])
  const [fontList, setFontList] = useState<string[]>([])

  const handleWindowStyleChange = useCallback(
    (checked: boolean) => {
      setWindowStyle(checked ? 'transparent' : 'opaque')
    },
    [setWindowStyle]
  )

  const handleUseSystemTitleBarChange = (checked: boolean) => {
    window.modal.confirm({
      title: '需要重启应用',
      content: '更改标题栏样式需要重启应用才能生效，是否现在重启？',
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk() {
        setUseSystemTitleBar(checked)
        setTimeoutTimer(
          'handleUseSystemTitleBarChange',
          () => {
            void window.api.relaunchApp()
          },
          500
        )
      }
    })
  }

  const handleReset = useCallback(() => {
    setVisibleIcons([...DEFAULT_SIDEBAR_ICONS])
    setDisabledIcons([])
    dispatch(setSidebarIcons({ visible: DEFAULT_SIDEBAR_ICONS, disabled: [] }))
  }, [dispatch])

  useEffect(() => {
    // 初始化获取所有系统字体
    void window.api.getSystemFonts().then((fonts: string[]) => {
      setFontList(fonts)
    })

    // 初始化获取当前缩放值
    void window.api.handleZoomFactor(0).then((factor) => {
      setCurrentZoom(factor)
    })

    const handleResize = () => {
      void window.api.handleZoomFactor(0).then((factor) => {
        setCurrentZoom(factor)
      })
    }
    // 添加resize事件监听
    window.addEventListener('resize', handleResize)

    // 清理事件监听，防止内存泄漏
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const handleZoomFactor = async (delta: number, reset: boolean = false) => {
    const zoomFactor = await window.api.handleZoomFactor(delta, reset)
    setCurrentZoom(zoomFactor)
  }

  const handleUserFontChange = useCallback(
    (value: string) => {
      setUserTheme({
        ...userTheme,
        userFontFamily: value
      })
    },
    [setUserTheme, userTheme]
  )

  const handleUserCodeFontChange = useCallback(
    (value: string) => {
      setUserTheme({
        ...userTheme,
        userCodeFontFamily: value
      })
    },
    [setUserTheme, userTheme]
  )

  const assistantIconTypeOptions = useMemo(
    () => [
      { value: 'model', label: '模型图标' },
      { value: 'emoji', label: 'Emoji 表情' },
      { value: 'none', label: '不显示' }
    ],
    []
  )

  const renderFontOption = useCallback(
    (font: string) => (
      <Tooltip title={font} placement="left" mouseEnterDelay={0.5}>
        <div
          className="truncate"
          style={{
            fontFamily: font
          }}>
          {font}
        </div>
      </Tooltip>
    ),
    []
  )

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle>{'显示设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'主题'}</SettingRowTitle>
          <ThemePicker>
            {THEMES.map((t) => (
              <ThemeOption key={t.id} $active={themeId === t.id} onClick={() => dispatch(setThemeId(t.id))}>
                <ThemeDot style={{ background: t.gradient }} />
                {t.name}
              </ThemeOption>
            ))}
          </ThemePicker>
        </SettingRow>
        {isMac && (
          <>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{'透明窗口'}</SettingRowTitle>
              <Switch checked={windowStyle === 'transparent'} onChange={handleWindowStyleChange} />
            </SettingRow>
          </>
        )}
        {isLinux && (
          <>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{'使用系统标题栏 (Linux)'}</SettingRowTitle>
              <Switch checked={useSystemTitleBar} onChange={handleUseSystemTitleBarChange} />
            </SettingRow>
          </>
        )}
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'缩放设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'缩放'}</SettingRowTitle>
          <ZoomButtonGroup>
            <Button onClick={() => handleZoomFactor(-0.1)} icon={<Minus size="14" />} color="default" variant="text" />
            <ZoomValue>{Math.round(currentZoom * 100)}%</ZoomValue>
            <Button onClick={() => handleZoomFactor(0.1)} icon={<Plus size="14" />} color="default" variant="text" />
            <Button
              onClick={() => handleZoomFactor(0, true)}
              style={{ marginLeft: 8 }}
              icon={<ResetIcon size="14" />}
              color="default"
              variant="text"
            />
          </ZoomButtonGroup>
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle style={{ justifyContent: 'flex-start', gap: 5 }}>
          {'字体设置'} <TextBadge text="New" />
        </SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'全局字体'}</SettingRowTitle>
          <SelectRow>
            <Select
              style={{ width: 280 }}
              placeholder={'选择字体'}
              options={[
                {
                  label: (
                    <span style={{ fontFamily: 'Ubuntu, -apple-system, system-ui, Arial, sans-serif' }}>{'默认'}</span>
                  ),
                  value: ''
                },
                ...fontList.map((font) => ({ label: renderFontOption(font), value: font }))
              ]}
              value={userTheme.userFontFamily || ''}
              onChange={(font) => handleUserFontChange(font)}
              showSearch
              getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            />
            <Button
              onClick={() => handleUserFontChange('')}
              style={{ marginLeft: 8 }}
              icon={<ResetIcon size="14" />}
              color="default"
              variant="text"
            />
          </SelectRow>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'代码字体'}</SettingRowTitle>
          <SelectRow>
            <Select
              style={{ width: 280 }}
              placeholder={'选择字体'}
              options={[
                {
                  label: (
                    <span style={{ fontFamily: 'Ubuntu, -apple-system, system-ui, Arial, sans-serif' }}>{'默认'}</span>
                  ),
                  value: ''
                },
                ...fontList.map((font) => ({ label: renderFontOption(font), value: font }))
              ]}
              value={userTheme.userCodeFontFamily || ''}
              onChange={(font) => handleUserCodeFontChange(font)}
              showSearch
              getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            />
            <Button
              onClick={() => handleUserCodeFontChange('')}
              style={{ marginLeft: 8 }}
              icon={<ResetIcon size="14" />}
              color="default"
              variant="text"
            />
          </SelectRow>
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'话题设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'话题位置'}</SettingRowTitle>
          <Segmented
            value={topicPosition || 'right'}
            shape="round"
            onChange={setTopicPosition}
            options={[
              { value: 'left', label: '左侧' },
              { value: 'right', label: '右侧' }
            ]}
          />
        </SettingRow>
        <SettingDivider />
        {topicPosition === 'left' && (
          <>
            <SettingRow>
              <SettingRowTitle>{'自动切换到话题'}</SettingRowTitle>
              <Switch
                checked={clickAssistantToShowTopic}
                onChange={(checked) => dispatch(setClickAssistantToShowTopic(checked))}
              />
            </SettingRow>
            <SettingDivider />
          </>
        )}
        <SettingRow>
          <SettingRowTitle>{'显示话题时间'}</SettingRowTitle>
          <Switch checked={showTopicTime} onChange={(checked) => dispatch(setShowTopicTime(checked))} />
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'固定话题置顶'}</SettingRowTitle>
          <Switch checked={pinTopicsToTop} onChange={(checked) => dispatch(setPinTopicsToTop(checked))} />
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'助手设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'模型图标类型'}</SettingRowTitle>
          <Segmented
            value={assistantIconType}
            shape="round"
            onChange={(value) => dispatch(setAssistantIconType(value as AssistantIconType))}
            options={assistantIconTypeOptions}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle
          style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{'侧边栏设置'}</span>
          <ResetButtonWrapper>
            <Button onClick={handleReset}>{'重置'}</Button>
          </ResetButtonWrapper>
        </SettingTitle>
        <SettingDivider />
        <SidebarIconsManager
          visibleIcons={visibleIcons}
          disabledIcons={disabledIcons}
          setVisibleIcons={setVisibleIcons}
          setDisabledIcons={setDisabledIcons}
        />
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>
          {'自定义 CSS'}
          <TitleExtra onClick={() => window.api.openWebsite('https://cherrycss.com/')}>
            {'从 cherrycss.com 获取'}
          </TitleExtra>
        </SettingTitle>
        <SettingDivider />
        <CodeEditor
          value={customCss}
          language="css"
          placeholder={'/* 这里写自定义 CSS */'}
          onChange={(value) => dispatch(setCustomCss(value))}
          height="60vh"
          expanded={false}
          wrapped
          options={{
            autocompletion: true,
            lineNumbers: true,
            foldGutter: true,
            keymap: true
          }}
          style={{
            outline: '0.5px solid var(--color-border)',
            borderRadius: '5px'
          }}
        />
      </SettingGroup>
    </SettingContainer>
  )
}

const TitleExtra = styled.div`
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  opacity: 0.7;
`
const ResetButtonWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`
const ZoomButtonGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 210px;
`
const ZoomValue = styled.span`
  width: 40px;
  text-align: center;
  margin: 0 5px;
`

const SelectRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 380px;
`

export default DisplaySettings
