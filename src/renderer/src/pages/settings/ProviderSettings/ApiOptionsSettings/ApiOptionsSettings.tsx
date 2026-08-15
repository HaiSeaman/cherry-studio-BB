import { HStack } from '@renderer/components/Layout'
import { InfoTooltip } from '@renderer/components/TooltipIcons'
import { useProvider } from '@renderer/hooks/useProvider'
import { type AnthropicCacheControlSettings, type Provider } from '@renderer/types'
import { isSupportAnthropicPromptCacheProvider } from '@renderer/utils/provider'
import { Divider, Flex, InputNumber, Switch } from 'antd'
import { startTransition, useCallback, useMemo } from 'react'
type Props = {
  providerId: string
}

type OptionType = {
  key: string
  label: string
  tip: string
  checked: boolean
  onChange: (checked: boolean) => void
}

const ApiOptionsSettings = ({ providerId }: Props) => {
  const { provider, updateProvider } = useProvider(providerId)

  const updateProviderTransition = useCallback(
    (updates: Partial<Provider>) => {
      startTransition(() => {
        updateProvider(updates)
      })
    },
    [updateProvider]
  )

  const openAIOptions: OptionType[] = useMemo(
    () => [
      {
        key: 'openai_developer_role',
        label: '支持 Developer Message',
        tip: '该提供商是否支持 role: "developer" 的消息',
        onChange: (checked: boolean) => {
          updateProviderTransition({
            apiOptions: { ...provider.apiOptions, isSupportDeveloperRole: checked }
          })
        },
        checked: !!provider.apiOptions?.isSupportDeveloperRole
      },
      {
        key: 'openai_stream_options',
        label: '支持 stream_options',
        tip: '该提供商是否支持 stream_options 参数',
        onChange: (checked: boolean) => {
          updateProviderTransition({
            apiOptions: { ...provider.apiOptions, isNotSupportStreamOptions: !checked }
          })
        },
        checked: !provider.apiOptions?.isNotSupportStreamOptions
      },
      {
        key: 'openai_service_tier',
        label: '支持 service_tier',
        tip: '该提供商是否支持配置 service_tier 参数。开启后，可在对话页面的服务层级设置中调整该参数。（仅限OpenAI模型）',
        onChange: (checked: boolean) => {
          updateProviderTransition({
            apiOptions: { ...provider.apiOptions, isSupportServiceTier: checked }
          })
        },
        checked: !!provider.apiOptions?.isSupportServiceTier
      },
      {
        key: 'openai_enable_thinking',
        label: '支持 enable_thinking',
        tip: '该提供商是否支持通过 enable_thinking 参数控制 Qwen3 等模型的思考',
        onChange: (checked: boolean) => {
          updateProviderTransition({
            apiOptions: { ...provider.apiOptions, isNotSupportEnableThinking: !checked }
          })
        },
        checked: !provider.apiOptions?.isNotSupportEnableThinking
      },
      {
        key: 'openai_verbosity',
        label: '支持 verbosity',
        tip: '该提供商是否支持 verbosity 参数',
        onChange: (checked: boolean) => {
          updateProviderTransition({
            apiOptions: { ...provider.apiOptions, isNotSupportVerbosity: !checked }
          })
        },
        checked: !provider.apiOptions?.isNotSupportVerbosity
      }
    ],
    [provider, updateProviderTransition]
  )

  const options = useMemo(() => {
    const items: OptionType[] = [
      {
        key: 'openai_array_content',
        label: '支持数组格式的 message content',
        tip: '该提供商是否支持 message 的 content 字段为 array 类型',
        onChange: (checked: boolean) => {
          updateProviderTransition({
            apiOptions: { ...provider.apiOptions, isNotSupportArrayContent: !checked }
          })
        },
        checked: !provider.apiOptions?.isNotSupportArrayContent
      }
    ]

    if (provider.type === 'openai' || provider.type === 'openai-response' || provider.type === 'azure-openai') {
      items.push(...openAIOptions)
    }

    return items
  }, [openAIOptions, provider.apiOptions, provider.type, updateProviderTransition])

  const isSupportAnthropicPromptCache = isSupportAnthropicPromptCacheProvider(provider)

  const cacheSettings = useMemo(
    () =>
      provider.anthropicCacheControl ?? {
        tokenThreshold: 0,
        cacheSystemMessage: true,
        cacheLastNMessages: 0
      },
    [provider.anthropicCacheControl]
  )

  const updateCacheSettings = useCallback(
    (updates: Partial<AnthropicCacheControlSettings>) => {
      updateProviderTransition({
        anthropicCacheControl: { ...cacheSettings, ...updates }
      })
    },
    [cacheSettings, updateProviderTransition]
  )

  return (
    <Flex vertical gap="middle">
      {options.map((item) => (
        <HStack key={item.key} justifyContent="space-between">
          <HStack alignItems="center" gap={6}>
            <label style={{ cursor: 'pointer' }} htmlFor={item.key}>
              {item.label}
            </label>
            <InfoTooltip title={item.tip}></InfoTooltip>
          </HStack>
          <Switch id={item.key} checked={item.checked} onChange={item.onChange} />
        </HStack>
      ))}

      {isSupportAnthropicPromptCache && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <HStack justifyContent="space-between">
            <HStack alignItems="center" gap={6}>
              <span>{'缓存 Token 阈值'}</span>
              <InfoTooltip title={'消息超过此 Token 数才会被缓存，设为 0 禁用缓存'} />
            </HStack>
            <InputNumber
              min={0}
              max={100000}
              value={cacheSettings.tokenThreshold}
              onChange={(v) => updateCacheSettings({ tokenThreshold: v ?? 0 })}
              style={{ width: 100 }}
            />
          </HStack>
          {cacheSettings.tokenThreshold > 0 && (
            <>
              <HStack justifyContent="space-between">
                <HStack alignItems="center" gap={6}>
                  <span>{'缓存系统消息'}</span>
                  <InfoTooltip title={'是否缓存系统提示词'} />
                </HStack>
                <Switch
                  checked={cacheSettings.cacheSystemMessage}
                  onChange={(v) => updateCacheSettings({ cacheSystemMessage: v })}
                />
              </HStack>
              <HStack justifyContent="space-between">
                <HStack alignItems="center" gap={6}>
                  <span>{'缓存最后 N 条消息'}</span>
                  <InfoTooltip title={'缓存最后的 N 条对话消息（不含系统消息）'} />
                </HStack>
                <InputNumber
                  min={0}
                  max={10}
                  value={cacheSettings.cacheLastNMessages}
                  onChange={(v) => updateCacheSettings({ cacheLastNMessages: v ?? 0 })}
                  style={{ width: 100 }}
                />
              </HStack>
            </>
          )}
        </>
      )}
    </Flex>
  )
}

export default ApiOptionsSettings
