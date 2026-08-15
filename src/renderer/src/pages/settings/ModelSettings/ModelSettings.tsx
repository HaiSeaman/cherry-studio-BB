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
import { useAppDispatch } from '@renderer/store'
import { setTranslateModelPrompt } from '@renderer/store/settings'
import type { Model } from '@renderer/types'
import { Button, Tooltip } from 'antd'
import { find } from 'lodash'
import { Languages, MessageSquareMore, Rocket, Settings2 } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo } from 'react'

import { SettingContainer, SettingDescription, SettingGroup, SettingTitle } from '..'
import DefaultAssistantSettings from './DefaultAssistantSettings'
import TopicNamingModalPopup from './QuickModelPopup'

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
    </SettingContainer>
  )
}

export default ModelSettings
