import { RedoOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import ModelSelector from '@renderer/components/ModelSelector'
import { InfoTooltip } from '@renderer/components/TooltipIcons'
import { isEmbeddingModel, isRerankModel, isTextToImageModel } from '@renderer/config/models'
import { TRANSLATE_PROMPT } from '@renderer/config/prompts'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useDefaultModel } from '@renderer/hooks/useAssistant'
import { useProviders } from '@renderer/hooks/useProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { getModelUniqId, hasModel } from '@renderer/services/ModelService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setTranslateModelPrompt } from '@renderer/store/settings'
import { selectVoiceInputEnabled, toggleShortcut } from '@renderer/store/shortcuts'
import type { Model } from '@renderer/types'
import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig, VoiceInputProvider } from '@shared/config/types'
import { Button, Select, Switch, Tooltip } from 'antd'
import { find } from 'lodash'
import { Languages, MessageSquareMore, Mic, Rocket, Settings2 } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SettingContainer, SettingDescription, SettingGroup, SettingTitle } from '..'
import DefaultAssistantSettings from './DefaultAssistantSettings'
import TopicNamingModalPopup from './QuickModelPopup'
import { VOICE_INPUT_PROVIDER_OPTIONS } from './voiceInputFields'
import VoiceInputSettingsPopup from './VoiceInputSettingsPopup'

interface ModelSettingsProps {
  showSettingsButton?: boolean
  showDescription?: boolean
  compact?: boolean
}

const ModelSettings: FC<ModelSettingsProps> = ({
  showSettingsButton = true,
  showDescription = true,
  compact = false
}) => {
  const { defaultModel, quickModel, translateModel, setDefaultModel, setQuickModel, setTranslateModel } =
    useDefaultModel()
  const { providers } = useProviders()
  const allModels = providers.map((p) => p.models).flat()
  const { theme } = useTheme()
  const { translateModelPrompt } = useSettings()

  const dispatch = useAppDispatch()

  // 语音输入总开关：复用快捷键表 voice_input 的 enabled（与快捷键设置页同一份状态）
  const voiceInputEnabled = useAppSelector(selectVoiceInputEnabled)

  const modelPredicate = useCallback(
    (m: Model) => !isEmbeddingModel(m) && !isRerankModel(m) && !isTextToImageModel(m),
    []
  )

  const defaultModelValue = useMemo(
    () => (hasModel(defaultModel) ? getModelUniqId(defaultModel) : undefined),
    [defaultModel]
  )

  const defaultQuickModel = useMemo(() => (hasModel(quickModel) ? getModelUniqId(quickModel) : undefined), [quickModel])

  const defaultTranslateModel = useMemo(
    () => (hasModel(translateModel) ? getModelUniqId(translateModel) : undefined),
    [translateModel]
  )

  const onResetTranslatePrompt = () => {
    dispatch(setTranslateModelPrompt(TRANSLATE_PROMPT))
  }

  const containerStyle = compact ? { padding: 0, background: 'transparent' } : undefined
  const groupStyle = compact ? { padding: 0, border: 'none', background: 'transparent' } : undefined

  // 语音输入：服务商选择 + 设置弹窗（密钥/模型名在弹窗里填，存主进程配置）
  const [voiceInputProvider, setVoiceInputProvider] = useState<VoiceInputProvider>('qwen')

  const loadVoiceInputProvider = useCallback(() => {
    void window.api.config.get('voiceInput').then((c) => {
      const saved = c as Partial<VoiceInputConfig> | undefined
      if (saved?.provider) {
        setVoiceInputProvider(saved.provider)
      }
    })
  }, [])

  useEffect(() => {
    loadVoiceInputProvider()
  }, [loadVoiceInputProvider])

  const onVoiceInputProviderChange = (provider: VoiceInputProvider) => {
    setVoiceInputProvider(provider)
    void window.api.config.get('voiceInput').then((c) => {
      const saved = (c ?? structuredClone(DEFAULT_VOICE_INPUT_CONFIG)) as VoiceInputConfig
      void window.api.config.set('voiceInput', { ...saved, provider })
    })
  }

  const openVoiceInputSettings = () => {
    void VoiceInputSettingsPopup.show().then(() => loadVoiceInputProvider())
  }

  return (
    <SettingContainer theme={theme} style={containerStyle}>
      <SettingGroup theme={theme} style={groupStyle}>
        <SettingTitle style={{ marginBottom: 12 }}>
          <HStack alignItems="center" gap={10}>
            <MessageSquareMore size={18} color="var(--color-text)" />
            {'默认助手模型'}
          </HStack>
        </SettingTitle>
        <HStack alignItems="center">
          <ModelSelector
            providers={providers}
            predicate={modelPredicate}
            value={defaultModelValue}
            defaultValue={defaultModelValue}
            style={{ width: compact ? '100%' : 360 }}
            size={compact ? 'large' : 'middle'}
            onChange={(value) => setDefaultModel(find(allModels, JSON.parse(value)) as Model)}
            placeholder={'没有模型'}
          />
          {showSettingsButton && (
            <Button icon={<Settings2 size={16} />} style={{ marginLeft: 8 }} onClick={DefaultAssistantSettings.show} />
          )}
        </HStack>
        {showDescription && (
          <SettingDescription>{'创建新助手时使用的模型，如果助手未设置模型，则使用此模型'}</SettingDescription>
        )}
      </SettingGroup>
      <SettingGroup theme={theme} style={groupStyle}>
        <SettingTitle style={{ marginBottom: 12 }}>
          <HStack alignItems="center" gap={10}>
            <Rocket size={18} color="var(--color-text)" />
            {'快速模型'}
            <InfoTooltip title={'建议选择轻量模型，不建议选择思考模型'} />
          </HStack>
        </SettingTitle>
        <HStack alignItems="center">
          <ModelSelector
            providers={providers}
            predicate={modelPredicate}
            value={defaultQuickModel}
            defaultValue={defaultQuickModel}
            style={{ width: compact ? '100%' : 360 }}
            size={compact ? 'large' : 'middle'}
            onChange={(value) => setQuickModel(find(allModels, JSON.parse(value)) as Model)}
            placeholder={'没有模型'}
          />
          {showSettingsButton && (
            <Button icon={<Settings2 size={16} />} style={{ marginLeft: 8 }} onClick={TopicNamingModalPopup.show} />
          )}
        </HStack>
        {showDescription && (
          <SettingDescription>{'执行话题命名、搜索关键字提炼等简单任务时使用的模型'}</SettingDescription>
        )}
      </SettingGroup>
      <SettingGroup theme={theme} style={groupStyle}>
        <SettingTitle style={{ marginBottom: 12 }}>
          <HStack alignItems="center" gap={10}>
            <Languages size={18} color="var(--color-text)" />
            {'翻译模型'}
          </HStack>
        </SettingTitle>
        <HStack alignItems="center">
          <ModelSelector
            providers={providers}
            predicate={modelPredicate}
            value={defaultTranslateModel}
            defaultValue={defaultTranslateModel}
            style={{ width: compact ? '100%' : 360 }}
            size={compact ? 'large' : 'middle'}
            onChange={(value) => setTranslateModel(find(allModels, JSON.parse(value)) as Model)}
            placeholder={'没有模型'}
          />
          {showSettingsButton && translateModelPrompt !== TRANSLATE_PROMPT && (
            <Tooltip title={'重置'}>
              <Button icon={<RedoOutlined />} style={{ marginLeft: 8 }} onClick={onResetTranslatePrompt}></Button>
            </Tooltip>
          )}
        </HStack>
        {showDescription && <SettingDescription>{'翻译服务使用的模型'}</SettingDescription>}
      </SettingGroup>
      <SettingGroup theme={theme} style={groupStyle}>
        <SettingTitle style={{ marginBottom: 12 }}>
          <HStack alignItems="center" gap={10}>
            <Mic size={18} color="var(--color-text)" />
            {'语音输入模型'}
            <InfoTooltip
              title={
                voiceInputEnabled
                  ? '按住 Ctrl+` 说话，松开后识别文字并打字到鼠标光标处'
                  : '语音输入已关闭，打开右侧开关后按住 Ctrl+` 即可说话'
              }
            />
          </HStack>
        </SettingTitle>
        <HStack alignItems="center">
          <Select
            value={voiceInputProvider}
            style={{ width: compact ? '100%' : 360 }}
            options={VOICE_INPUT_PROVIDER_OPTIONS}
            onChange={(p) => onVoiceInputProviderChange(p)}
            placeholder={'选择语音识别服务商'}
          />
          {showSettingsButton && (
            <Button icon={<Settings2 size={16} />} style={{ marginLeft: 8 }} onClick={openVoiceInputSettings} />
          )}
          <Tooltip title={voiceInputEnabled ? '关闭后按住快捷键也不会录音' : '开启后按住快捷键即可说话'}>
            <Switch
              size="small"
              checked={voiceInputEnabled}
              onChange={() => dispatch(toggleShortcut('voice_input'))}
              style={{ marginLeft: 8 }}
            />
          </Tooltip>
        </HStack>
        {showDescription && (
          <SettingDescription>
            {'语音输入的识别服务商；API 地址固定，密钥与模型名称在右侧设置中填写'}
          </SettingDescription>
        )}
      </SettingGroup>
    </SettingContainer>
  )
}

export default ModelSettings
