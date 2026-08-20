import { AppstoreOutlined, ExportOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import Selector from '@renderer/components/Selector'
import { InfoTooltip } from '@renderer/components/TooltipIcons'
import { isMac } from '@renderer/config/constant'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useEnableDeveloperMode, useSettings } from '@renderer/hooks/useSettings'
import { useTimer } from '@renderer/hooks/useTimer'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import {
  setEnableSpellCheck,
  setNotificationSettings,
  setProxyBypassRules as _setProxyBypassRules,
  setProxyMode,
  setProxyUrl as _setProxyUrl,
  setSpellCheckLanguages
} from '@renderer/store/settings'
import type { NotificationSource } from '@renderer/types/notification'
import { isValidProxyUrl } from '@renderer/utils'
import { formatErrorMessage } from '@renderer/utils/error'
import { defaultByPassRules } from '@shared/config/constant'
import { Avatar, Button, Flex, Input, Switch, Tooltip } from 'antd'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '.'
import NotificationSoundRow from './NotificationSoundRow'

type SpellCheckOption = { readonly value: string; readonly label: string; readonly flag: string }

// Define available spell check languages with display names (only commonly supported languages)
const spellCheckLanguageOptions: readonly SpellCheckOption[] = [
  { value: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'it', label: 'Italiano', flag: '🇮🇹' },
  { value: 'pt', label: 'Português', flag: '🇵🇹' },
  { value: 'ru', label: 'Русский', flag: '🇷🇺' },
  { value: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { value: 'pl', label: 'Polski', flag: '🇵🇱' },
  { value: 'sk', label: 'Slovenčina', flag: '🇸🇰' },
  { value: 'el', label: 'Ελληνικά', flag: '🇬🇷' }
]

const APP_NAME = 'cherry-studio-BB'
const RELEASE_URL = 'https://github.com/HaiSeaman/cherry-studio-BB'

const GeneralSettings: FC = () => {
  const {
    proxyUrl: storeProxyUrl,
    proxyBypassRules: storeProxyBypassRules,
    setLaunch,
    setTray,
    launchOnBoot,
    launchToTray,
    trayOnClose,
    tray,
    proxyMode: storeProxyMode,
    enableSpellCheck,
    disableHardwareAcceleration,
    setDisableHardwareAcceleration
  } = useSettings()
  const [proxyUrl, setProxyUrl] = useState<string | undefined>(storeProxyUrl)
  const [proxyBypassRules, setProxyBypassRules] = useState<string | undefined>(storeProxyBypassRules)
  const { theme } = useTheme()
  const { enableDeveloperMode, setEnableDeveloperMode } = useEnableDeveloperMode()
  const { setTimeoutTimer } = useTimer()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    void window.api.getAppInfo().then((info) => setAppVersion(info.version))
  }, [])

  const updateTray = (isShowTray: boolean) => {
    setTray(isShowTray)
    //only set tray on close/launch to tray when tray is enabled
    if (!isShowTray) {
      updateTrayOnClose(false)
      updateLaunchToTray(false)
    }
  }

  const updateTrayOnClose = (isTrayOnClose: boolean) => {
    setTray(undefined, isTrayOnClose)
    //in case tray is not enabled, enable it
    if (isTrayOnClose && !tray) {
      updateTray(true)
    }
  }

  const updateLaunchOnBoot = (isLaunchOnBoot: boolean) => {
    setLaunch(isLaunchOnBoot)
  }

  const updateLaunchToTray = (isLaunchToTray: boolean) => {
    setLaunch(undefined, isLaunchToTray)
    if (isLaunchToTray && !tray) {
      updateTray(true)
    }
  }

  const dispatch = useAppDispatch()

  const handleSpellCheckChange = (checked: boolean) => {
    dispatch(setEnableSpellCheck(checked))
    void window.api.setEnableSpellCheck(checked)
  }

  const onSetProxyUrl = () => {
    if (proxyUrl && !isValidProxyUrl(proxyUrl)) {
      window.toast.error('无效的代理地址')
      return
    }

    dispatch(_setProxyUrl(proxyUrl))
  }

  const onSetProxyBypassRules = () => {
    dispatch(_setProxyBypassRules(proxyBypassRules))
  }

  const proxyModeOptions: { value: 'system' | 'custom' | 'none'; label: string }[] = [
    { value: 'system', label: '系统代理' },
    { value: 'custom', label: '自定义代理' },
    { value: 'none', label: '不使用代理' }
  ]

  const onProxyModeChange = (mode: 'system' | 'custom' | 'none') => {
    dispatch(setProxyMode(mode))
  }

  const notificationSettings = useSelector((state: RootState) => state.settings.notification)
  const spellCheckLanguages = useSelector((state: RootState) => state.settings.spellCheckLanguages)

  // 兼容新旧结构：老布尔值视为 { enabled: 布尔, sound: 'default' }
  const getNotificationItem = (type: NotificationSource) => {
    const item = notificationSettings?.[type]
    if (item && typeof item === 'object') return item
    return { enabled: typeof item === 'boolean' ? item : false, sound: 'default' }
  }

  // 把所有来源规范化为新结构（避免老布尔数据与新增结构混写）
  const normalizeNotification = () => {
    const sources: NotificationSource[] = ['assistant', 'backup', 'update', 'automation', 'paint']
    return Object.fromEntries(sources.map((s) => [s, getNotificationItem(s)])) as typeof notificationSettings
  }

  const handleNotificationChange = (type: NotificationSource, value: boolean) => {
    const current = getNotificationItem(type)
    dispatch(setNotificationSettings({ ...normalizeNotification(), [type]: { ...current, enabled: value } }))
  }

  const handleNotificationSoundChange = (type: NotificationSource, sound: string) => {
    const current = getNotificationItem(type)
    dispatch(setNotificationSettings({ ...normalizeNotification(), [type]: { ...current, sound } }))
  }

  const handleSpellCheckLanguagesChange = (selectedLanguages: string[]) => {
    dispatch(setSpellCheckLanguages(selectedLanguages))
    void window.api.setSpellCheckLanguages(selectedLanguages)
  }

  const handleHardwareAccelerationChange = (checked: boolean) => {
    window.modal.confirm({
      title: '需要重启应用',
      content: '禁用硬件加速需要重启应用才能生效，是否现在重启？',
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk() {
        try {
          setDisableHardwareAcceleration(checked)
        } catch (error) {
          window.toast.error(formatErrorMessage(error))
          return
        }

        // 重启应用
        setTimeoutTimer(
          'handleHardwareAccelerationChange',
          () => {
            void window.api.relaunchApp()
          },
          500
        )
      }
    })
  }

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle>{'常规设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'代理模式'}</SettingRowTitle>
          <Selector value={storeProxyMode} onChange={onProxyModeChange} options={proxyModeOptions} />
        </SettingRow>
        {storeProxyMode === 'custom' && (
          <>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle>{'代理地址'}</SettingRowTitle>
              <Input
                spellCheck={false}
                placeholder="socks5://127.0.0.1:6153"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                style={{ width: 180 }}
                onBlur={() => onSetProxyUrl()}
                type="url"
              />
            </SettingRow>
          </>
        )}
        {storeProxyMode === 'custom' && (
          <>
            <SettingDivider />
            <SettingRow>
              <SettingRowTitle style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>{'代理绕过规则'}</span>
                <Tooltip title={'支持模糊匹配(*.test.com,192.168.0.0/16)'} placement="right">
                  <InfoCircleOutlined style={{ cursor: 'pointer' }} />
                </Tooltip>
              </SettingRowTitle>
              <Input
                spellCheck={false}
                placeholder={defaultByPassRules}
                value={proxyBypassRules}
                onChange={(e) => setProxyBypassRules(e.target.value)}
                style={{ width: 180 }}
                onBlur={() => onSetProxyBypassRules()}
              />
            </SettingRow>
          </>
        )}
        <SettingDivider />
        <SettingRow>
          <HStack justifyContent="space-between" alignItems="center" style={{ flex: 1, marginRight: 16 }}>
            <SettingRowTitle>{'拼写检查'}</SettingRowTitle>
            {enableSpellCheck && !isMac && (
              <Selector<string>
                size={14}
                multiple
                value={spellCheckLanguages}
                placeholder={'拼写检查语言'}
                onChange={handleSpellCheckLanguagesChange}
                options={spellCheckLanguageOptions.map((lang) => ({
                  value: lang.value,
                  label: (
                    <Flex align="center" gap={8}>
                      <span role="img" aria-label={lang.flag}>
                        {lang.flag}
                      </span>
                      {lang.label}
                    </Flex>
                  )
                }))}
              />
            )}
          </HStack>
          <Switch checked={enableSpellCheck} onChange={handleSpellCheckChange} />
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'禁用硬件加速'}</SettingRowTitle>
          <Switch checked={disableHardwareAcceleration} onChange={handleHardwareAccelerationChange} />
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'通知设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{'通用对话助手'}</span>
            <Tooltip title={'如果响应成功，则只针对超过30秒的消息进行提醒'} placement="right">
              <InfoCircleOutlined style={{ cursor: 'pointer' }} />
            </Tooltip>
          </SettingRowTitle>
          <RightGroup>
            <NotificationSoundRow
              source="assistant"
              sound={getNotificationItem('assistant').sound}
              onSoundChange={(s) => handleNotificationSoundChange('assistant', s)}
            />
            <Switch
              checked={getNotificationItem('assistant').enabled}
              onChange={(v) => handleNotificationChange('assistant', v)}
            />
          </RightGroup>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'备份'}</SettingRowTitle>
          <RightGroup>
            <NotificationSoundRow
              source="backup"
              sound={getNotificationItem('backup').sound}
              onSoundChange={(s) => handleNotificationSoundChange('backup', s)}
            />
            <Switch
              checked={getNotificationItem('backup').enabled}
              onChange={(v) => handleNotificationChange('backup', v)}
            />
          </RightGroup>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'自动化任务助手'}</SettingRowTitle>
          <RightGroup>
            <NotificationSoundRow
              source="automation"
              sound={getNotificationItem('automation').sound}
              onSoundChange={(s) => handleNotificationSoundChange('automation', s)}
            />
            <Switch
              checked={getNotificationItem('automation').enabled}
              onChange={(v) => handleNotificationChange('automation', v)}
            />
          </RightGroup>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'灵感生图助手'}</SettingRowTitle>
          <RightGroup>
            <NotificationSoundRow
              source="paint"
              sound={getNotificationItem('paint').sound}
              onSoundChange={(s) => handleNotificationSoundChange('paint', s)}
            />
            <Switch
              checked={getNotificationItem('paint').enabled}
              onChange={(v) => handleNotificationChange('paint', v)}
            />
          </RightGroup>
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'启动'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'开机自动启动'}</SettingRowTitle>
          <Switch checked={launchOnBoot} onChange={(checked) => updateLaunchOnBoot(checked)} />
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'启动时最小化到托盘'}</SettingRowTitle>
          <Switch checked={launchToTray} onChange={(checked) => updateLaunchToTray(checked)} />
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'托盘'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'显示托盘图标'}</SettingRowTitle>
          <Switch checked={tray} onChange={(checked) => updateTray(checked)} />
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'关闭时最小化到托盘'}</SettingRowTitle>
          <Switch checked={trayOnClose} onChange={(checked) => updateTrayOnClose(checked)} />
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'开发者模式'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <Flex align="center" gap={4}>
            <SettingRowTitle>{'启用开发者模式'}</SettingRowTitle>
            <InfoTooltip title={'启用开发者模式后，将可以使用调用链功能查看模型调用过程的数据流。'} />
          </Flex>
          <Switch checked={enableDeveloperMode} onChange={setEnableDeveloperMode} />
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'关于'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <Flex align="center" gap={8}>
            <Avatar size={22} shape="square" icon={<AppstoreOutlined />} />
            <SettingRowTitle>{`${APP_NAME}  ${appVersion ? `v${appVersion}` : ''}`}</SettingRowTitle>
          </Flex>
          <Button
            type="primary"
            ghost
            icon={<ExportOutlined />}
            onClick={() => {
              void window.api.shell.openExternal(RELEASE_URL)
            }}>
            发布地址
          </Button>
        </SettingRow>
      </SettingGroup>
    </SettingContainer>
  )
}

/** 通知行右侧组：声音选择按钮（左） + 开关（右），垂直居中对齐 */
const RightGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`

export default GeneralSettings
