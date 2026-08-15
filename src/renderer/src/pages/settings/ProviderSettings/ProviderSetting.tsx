import { adaptProvider } from '@renderer/aiCore/provider/providerConfig'
import OpenAIAlert from '@renderer/components/Alert/OpenAIAlert'
import { showErrorDetailPopup } from '@renderer/components/ErrorDetailModal'
import { LoadingIcon } from '@renderer/components/Icons'
import { HStack } from '@renderer/components/Layout'
import { ApiKeyListPopup } from '@renderer/components/Popups/ApiKeyListPopup'
import Selector from '@renderer/components/Selector'
import { HelpTooltip } from '@renderer/components/TooltipIcons'
import { isRerankModel } from '@renderer/config/models'
import { PROVIDER_URLS } from '@renderer/config/providers'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useAllProviders, useProvider, useProviders } from '@renderer/hooks/useProvider'
import { useTimer } from '@renderer/hooks/useTimer'
import { ModelList } from '@renderer/pages/settings/ProviderSettings/ModelList'
import { checkApi } from '@renderer/services/ApiService'
import { isProviderSupportAuth } from '@renderer/services/ProviderService'
import { useAppDispatch } from '@renderer/store'
import { updateWebSearchProvider } from '@renderer/store/websearch'
import type { SystemProviderId } from '@renderer/types'
import { isSystemProvider, isSystemProviderId, SystemProviderIds } from '@renderer/types'
import type { ApiKeyConnectivity } from '@renderer/types/healthCheck'
import { HealthStatus } from '@renderer/types/healthCheck'
import { formatApiHost, formatApiKeys, getFancyProviderName, validateApiHost } from '@renderer/utils'
import { serializeHealthCheckError } from '@renderer/utils/error'
import {
  isAIGatewayProvider,
  isAnthropicProvider,
  isAzureOpenAIProvider,
  isGeminiProvider,
  isNewApiProvider,
  isOllamaProvider,
  isOpenAICompatibleProvider,
  isOpenAIProvider,
  isSupportAnthropicPromptCacheProvider
} from '@renderer/utils/provider'
import { Button, Divider, Flex, Input, Space, Switch, Tooltip } from 'antd'
import Link from 'antd/es/typography/Link'
import { debounce, isEmpty } from 'lodash'
import { Bolt, Check, Settings2, SquareArrowOutUpRight, TriangleAlert } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import {
  SettingContainer,
  SettingHelpLink,
  SettingHelpText,
  SettingHelpTextRow,
  SettingSubtitle,
  SettingTitle
} from '..'
import ApiOptionsSettingsPopup from './ApiOptionsSettings/ApiOptionsSettingsPopup'
import CustomHeaderPopup from './CustomHeaderPopup'
import ProviderOAuth from './ProviderOAuth'
import SelectProviderModelPopup from './SelectProviderModelPopup'

interface Props {
  providerId: string
  /** Whether in onboarding mode for new users */
  isOnboarding?: boolean
}

const ANTHROPIC_COMPATIBLE_PROVIDER_IDS = [
  SystemProviderIds.deepseek,
  SystemProviderIds.moonshot,
  SystemProviderIds.zhipu,
  SystemProviderIds.dashscope,
  SystemProviderIds.modelscope,
  SystemProviderIds.aihubmix,
  SystemProviderIds.grok,
  SystemProviderIds.longcat,
  SystemProviderIds.minimax,
  SystemProviderIds.silicon,
  SystemProviderIds.qiniu,
  SystemProviderIds.dmxapi,
  SystemProviderIds.mimo,
  SystemProviderIds.stepfun,
  SystemProviderIds.openrouter,
  SystemProviderIds.tokenflux,
  SystemProviderIds.ollama
] as const
type AnthropicCompatibleProviderId = (typeof ANTHROPIC_COMPATIBLE_PROVIDER_IDS)[number]

const ANTHROPIC_COMPATIBLE_PROVIDER_ID_SET = new Set<string>(ANTHROPIC_COMPATIBLE_PROVIDER_IDS)
const isAnthropicCompatibleProviderId = (id: string): id is AnthropicCompatibleProviderId => {
  return ANTHROPIC_COMPATIBLE_PROVIDER_ID_SET.has(id)
}

type HostField = 'apiHost' | 'anthropicApiHost'

const ProviderSetting: FC<Props> = ({ providerId, isOnboarding = false }) => {
  const { provider, updateProvider, models } = useProvider(providerId)
  const allProviders = useAllProviders()
  const { updateProviders } = useProviders()
  const [apiHost, setApiHost] = useState(provider.apiHost)
  const [anthropicApiHost, setAnthropicHost] = useState<string | undefined>(provider.anthropicApiHost)
  const [apiVersion, setApiVersion] = useState(provider.apiVersion)
  const [activeHostField, setActiveHostField] = useState<HostField>('apiHost')
  const { theme } = useTheme()
  const { setTimeoutTimer } = useTimer()
  const dispatch = useAppDispatch()

  const isAzureOpenAI = isAzureOpenAIProvider(provider)
  const noAPIInputProviders = ['aws-bedrock'] as const satisfies SystemProviderId[]
  const hideApiInput = noAPIInputProviders.some((id) => id === provider.id)

  const providerConfig = PROVIDER_URLS[provider.id]
  const officialWebsite = providerConfig?.websites?.official
  const apiKeyWebsite = providerConfig?.websites?.apiKey
  const configuredApiHost = providerConfig?.api?.url

  const fancyProviderName = getFancyProviderName(provider)

  const [localApiKey, setLocalApiKey] = useState(provider.apiKey)
  const [apiKeyConnectivity, setApiKeyConnectivity] = useState<ApiKeyConnectivity>({
    status: HealthStatus.NOT_CHECKED,
    checking: false
  })

  const updateWebSearchProviderKey = useCallback(
    ({ apiKey }: { apiKey: string }) => {
      provider.id === 'zhipu' && dispatch(updateWebSearchProvider({ id: 'zhipu', apiKey: apiKey.split(',')[0] }))
    },
    [dispatch, provider.id]
  )

  // Store callbacks in ref to avoid recreating debounce function when dependencies change
  const callbacks = { updateProvider, updateWebSearchProviderKey, isOnboarding, providerEnabled: provider.enabled }
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const debouncedUpdateApiKey = useMemo(
    () =>
      debounce((value: string) => {
        const { updateProvider, updateWebSearchProviderKey, isOnboarding, providerEnabled } = callbacksRef.current
        const formattedKey = formatApiKeys(value)
        updateProvider({ apiKey: formattedKey })
        updateWebSearchProviderKey({ apiKey: formattedKey })
        // Auto-enable provider when apiKey is updated in onboarding mode
        if (isOnboarding && formattedKey && !providerEnabled) {
          updateProvider({ enabled: true })
        }
      }, 150),
    []
  )

  // Track whether update comes from external source to avoid loops
  const isExternalUpdateRef = useRef(false)

  // Sync provider.apiKey to localApiKey and reset connectivity status
  useEffect(() => {
    // Cancel any pending debounce calls to prevent old values from overwriting new ones
    debouncedUpdateApiKey.cancel()
    isExternalUpdateRef.current = true
    setLocalApiKey(provider.apiKey)
    setApiKeyConnectivity({ status: HealthStatus.NOT_CHECKED })
  }, [provider.apiKey, debouncedUpdateApiKey])

  // Sync localApiKey to provider.apiKey (debounced)
  // Only trigger on user input, not on external updates
  useEffect(() => {
    if (isExternalUpdateRef.current) {
      isExternalUpdateRef.current = false
      return
    }
    if (localApiKey !== provider.apiKey) {
      debouncedUpdateApiKey(localApiKey)
    }
  }, [localApiKey, provider.apiKey, debouncedUpdateApiKey])

  // Flush pending updates on unmount to prevent data loss
  useEffect(() => {
    return () => {
      debouncedUpdateApiKey.flush()
    }
  }, [debouncedUpdateApiKey])

  const isApiKeyConnectable = useMemo(() => {
    return apiKeyConnectivity.status === 'success'
  }, [apiKeyConnectivity])

  const moveProviderToTop = useCallback(
    (providerId: string) => {
      const reorderedProviders = [...allProviders]
      const index = reorderedProviders.findIndex((p) => p.id === providerId)

      if (index !== -1) {
        const updatedProvider = { ...reorderedProviders[index], enabled: true }
        reorderedProviders.splice(index, 1)
        reorderedProviders.unshift(updatedProvider)
        updateProviders(reorderedProviders)
      }
    },
    [allProviders, updateProviders]
  )

  const onUpdateApiHost = () => {
    if (!validateApiHost(apiHost)) {
      setApiHost(provider.apiHost)
      window.toast.error('API 地址不合法')
      return
    }
    if (apiHost.trim()) {
      // For new-api provider, keep apiHost and anthropicApiHost in sync
      if (isNewApiProvider(provider)) {
        updateProvider({ apiHost, anthropicApiHost: apiHost })
        setAnthropicHost(apiHost)
      } else {
        updateProvider({ apiHost })
      }
    } else {
      setApiHost(provider.apiHost)
    }
  }

  const onUpdateAnthropicHost = () => {
    const trimmedHost = anthropicApiHost?.trim()

    if (trimmedHost) {
      updateProvider({ anthropicApiHost: trimmedHost })
      setAnthropicHost(trimmedHost)
    } else {
      updateProvider({ anthropicApiHost: undefined })
      setAnthropicHost(undefined)
    }
  }
  const onUpdateApiVersion = () => updateProvider({ apiVersion })

  const openApiKeyList = async () => {
    if (localApiKey !== provider.apiKey) {
      updateProvider({ apiKey: formatApiKeys(localApiKey) })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await ApiKeyListPopup.show({
      providerId: provider.id,
      title: `${fancyProviderName} ${'API 密钥管理'}`,
      providerType: 'llm'
    })
  }

  const onCheckApi = async () => {
    const formattedLocalKey = formatApiKeys(localApiKey)

    // 如果存在多个密钥，直接打开管理窗口
    if (formattedLocalKey.includes(',')) {
      await openApiKeyList()
      return
    }

    const modelsToCheck = models.filter((model) => !isRerankModel(model))

    if (isEmpty(modelsToCheck)) {
      window.toast.error({
        timeout: 5000,
        title: '没有可以被检测的模型（例如对话模型）'
      })
      return
    }

    const model = await SelectProviderModelPopup.show({ provider })

    if (!model) {
      window.toast.error('请选择一个模型')
      return
    }

    try {
      setApiKeyConnectivity((prev) => ({ ...prev, checking: true, status: HealthStatus.NOT_CHECKED }))
      await checkApi({ ...provider, apiHost, apiKey: formattedLocalKey }, model)

      window.toast.success({
        timeout: 2000,
        title: '连接成功'
      })

      setApiKeyConnectivity((prev) => ({ ...prev, status: HealthStatus.SUCCESS }))

      // Auto-enable provider when API check succeeds in onboarding mode
      if (isOnboarding && !provider.enabled) {
        updateProvider({ enabled: true })
      }

      setTimeoutTimer(
        'onCheckApi',
        () => {
          setApiKeyConnectivity((prev) => ({ ...prev, status: HealthStatus.NOT_CHECKED }))
        },
        3000
      )
    } catch (error: unknown) {
      window.toast.error({
        timeout: 8000,
        title: '连接失败'
      })

      const serializedError = serializeHealthCheckError(error)

      setApiKeyConnectivity((prev) => ({ ...prev, status: HealthStatus.FAILED, error: serializedError }))
    } finally {
      setApiKeyConnectivity((prev) => ({ ...prev, checking: false }))
    }
  }

  const onReset = useCallback(() => {
    setApiHost(configuredApiHost)
    updateProvider({ apiHost: configuredApiHost })
  }, [configuredApiHost, updateProvider])

  const isApiHostResettable = useMemo(() => {
    return !isEmpty(configuredApiHost) && apiHost !== configuredApiHost
  }, [configuredApiHost, apiHost])

  const hostPreview = () => {
    const formattedApiHost = adaptProvider({ provider: { ...provider, apiHost } }).apiHost

    if (isOllamaProvider(provider)) {
      return formattedApiHost + '/chat'
    }

    if (isOpenAICompatibleProvider(provider)) {
      return formattedApiHost + '/chat/completions'
    }

    if (isAzureOpenAIProvider(provider)) {
      const apiVersion = provider.apiVersion || ''
      const path = !['preview', 'v1'].includes(apiVersion)
        ? `/v1/chat/completions?apiVersion=v1`
        : `/v1/responses?apiVersion=v1`
      return formattedApiHost + path
    }

    if (isAnthropicProvider(provider)) {
      return formattedApiHost + '/messages'
    }

    if (isGeminiProvider(provider)) {
      return formattedApiHost + '/models'
    }
    if (isOpenAIProvider(provider)) {
      return formattedApiHost + '/responses'
    }
    if (isAIGatewayProvider(provider)) {
      return formattedApiHost + '/language-model'
    }
    return formattedApiHost
  }

  // API key 连通性检查状态指示器，目前仅在失败时显示
  const renderStatusIndicator = () => {
    if (apiKeyConnectivity.checking || apiKeyConnectivity.status !== HealthStatus.FAILED) {
      return null
    }

    return (
      <>
        <Tooltip title={apiKeyConnectivity.error?.message || '失败'}>
          <TriangleAlert
            size={16}
            color="var(--color-status-warning)"
            style={{ cursor: 'pointer' }}
            onClick={() => showErrorDetailPopup({ error: apiKeyConnectivity.error })}
          />
        </Tooltip>
      </>
    )
  }

  useEffect(() => {
    setApiHost(provider.apiHost)
  }, [provider.apiHost, provider.id])

  useEffect(() => {
    setAnthropicHost(provider.anthropicApiHost)
  }, [provider.anthropicApiHost])

  const canConfigureAnthropicHost = useMemo(() => {
    if (isNewApiProvider(provider)) {
      return true
    }
    return (
      provider.type !== 'anthropic' && isSystemProviderId(provider.id) && isAnthropicCompatibleProviderId(provider.id)
    )
  }, [provider])

  const anthropicHostPreview = useMemo(() => {
    const rawHost = anthropicApiHost ?? provider.anthropicApiHost
    // AI SDK uses the baseURL with /v1, then appends /messages
    const normalizedHost = formatApiHost(rawHost)

    return `${normalizedHost}/messages`
  }, [anthropicApiHost, provider.anthropicApiHost])

  const hostSelectorOptions = useMemo(() => {
    const options: { value: HostField; label: string }[] = [{ value: 'apiHost', label: 'API 地址' }]

    if (canConfigureAnthropicHost) {
      options.push({ value: 'anthropicApiHost', label: 'Anthropic API 地址' })
    }

    return options
  }, [canConfigureAnthropicHost])

  useEffect(() => {
    if (!canConfigureAnthropicHost && activeHostField === 'anthropicApiHost') {
      setActiveHostField('apiHost')
    }
  }, [canConfigureAnthropicHost, activeHostField])

  const hostSelectorTooltip =
    activeHostField === 'anthropicApiHost'
      ? '仅当服务商提供 Claude 兼容的基础地址时填写。'
      : '仅在服务商需要自定义的 OpenAI 兼容地址时覆盖。'

  return (
    <SettingContainer theme={theme} style={{ background: 'var(--color-background)' }}>
      <SettingTitle>
        <Flex align="center" gap={8}>
          <ProviderName>{fancyProviderName}</ProviderName>
          {officialWebsite && (
            <Link target="_blank" href={providerConfig.websites.official} style={{ display: 'flex' }}>
              <Button type="text" size="small" icon={<SquareArrowOutUpRight size={14} />} />
            </Link>
          )}
          {(!isSystemProvider(provider) || isSupportAnthropicPromptCacheProvider(provider)) && (
            <Tooltip title={'API 设置'}>
              <Button
                type="text"
                icon={<Bolt size={14} />}
                size="small"
                onClick={() => ApiOptionsSettingsPopup.show({ providerId: provider.id })}
              />
            </Tooltip>
          )}
        </Flex>
        <Switch
          value={provider.enabled}
          key={provider.id}
          onChange={(enabled) => {
            updateProvider({ apiHost, enabled })
            if (enabled) {
              moveProviderToTop(provider.id)
            }
          }}
        />
      </SettingTitle>
      <Divider style={{ width: '100%', margin: '10px 0' }} />
      {isProviderSupportAuth(provider) && <ProviderOAuth providerId={provider.id} />}
      {provider.id === 'openai' && <OpenAIAlert />}
      {!hideApiInput && (
        <>
          <SettingSubtitle
            style={{
              marginTop: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
            {'API 密钥'}
            <Tooltip title={'打开管理界面'} mouseEnterDelay={0.5}>
              <Button type="text" onClick={openApiKeyList} icon={<Settings2 size={16} />} />
            </Tooltip>
          </SettingSubtitle>
          <Space.Compact style={{ width: '100%', marginTop: 5 }}>
            <Input.Password
              value={localApiKey}
              placeholder={'API 密钥'}
              onChange={(e) => setLocalApiKey(e.target.value)}
              spellCheck={false}
              autoFocus={provider.enabled && provider.apiKey === '' && !isProviderSupportAuth(provider)}
              suffix={renderStatusIndicator()}
            />
            <Button
              type={isApiKeyConnectable ? 'primary' : 'default'}
              ghost={isApiKeyConnectable}
              onClick={onCheckApi}
              disabled={!apiHost || apiKeyConnectivity.checking}>
              {apiKeyConnectivity.checking ? (
                <LoadingIcon />
              ) : apiKeyConnectivity.status === 'success' ? (
                <Check size={16} className="lucide-custom" />
              ) : (
                '检测'
              )}
            </Button>
          </Space.Compact>
          <SettingHelpTextRow style={{ justifyContent: 'space-between' }}>
            <HStack>
              {apiKeyWebsite && (
                <SettingHelpLink target="_blank" href={apiKeyWebsite}>
                  {'点击这里获取密钥'}
                </SettingHelpLink>
              )}
            </HStack>
            <SettingHelpText>{'多个密钥使用逗号分隔'}</SettingHelpText>
          </SettingHelpTextRow>
          {
            <>
              <SettingSubtitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-1">
                  <Tooltip title={hostSelectorTooltip} mouseEnterDelay={0.3}>
                    <div>
                      <Selector
                        size={14}
                        value={activeHostField}
                        onChange={(value) => setActiveHostField(value)}
                        options={hostSelectorOptions}
                        style={{ paddingLeft: 1, fontWeight: 'bold' }}
                        placement="bottomLeft"
                      />
                    </div>
                  </Tooltip>
                  <HelpTooltip title={'在末尾添加 # 以禁用自动附加的API版本。'}></HelpTooltip>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Button
                    type="text"
                    onClick={() => CustomHeaderPopup.show({ provider })}
                    icon={<Settings2 size={16} />}
                  />
                </div>
              </SettingSubtitle>
              {activeHostField === 'apiHost' && (
                <>
                  <Space.Compact style={{ width: '100%', marginTop: 5 }}>
                    <Input
                      value={apiHost}
                      placeholder={'API 地址'}
                      onChange={(e) => setApiHost(e.target.value)}
                      onBlur={onUpdateApiHost}
                    />
                    {isApiHostResettable && (
                      <Button danger onClick={onReset}>
                        {'重置'}
                      </Button>
                    )}
                  </Space.Compact>
                  <SettingHelpTextRow style={{ justifyContent: 'space-between' }}>
                    <SettingHelpText
                      style={{
                        marginLeft: 6,
                        marginRight: '1em',
                        whiteSpace: 'break-spaces',
                        wordBreak: 'break-all'
                      }}>
                      {`预览：${hostPreview()}`}
                    </SettingHelpText>
                  </SettingHelpTextRow>
                </>
              )}

              {activeHostField === 'anthropicApiHost' && canConfigureAnthropicHost && (
                <>
                  <Space.Compact style={{ width: '100%', marginTop: 5 }}>
                    <Input
                      value={anthropicApiHost ?? ''}
                      placeholder={'Anthropic API 地址'}
                      onChange={(e) => setAnthropicHost(e.target.value)}
                      onBlur={onUpdateAnthropicHost}
                    />
                    {/* TODO: Add a reset button here. */}
                  </Space.Compact>
                  <SettingHelpTextRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <SettingHelpText style={{ marginLeft: 6, whiteSpace: 'break-spaces', wordBreak: 'break-all' }}>
                      {`Anthropic 预览：${anthropicHostPreview || '—'}`}
                    </SettingHelpText>
                  </SettingHelpTextRow>
                </>
              )}
            </>
          }
        </>
      )}
      {isAzureOpenAI && (
        <>
          <SettingSubtitle>{'API 版本'}</SettingSubtitle>
          <Space.Compact style={{ width: '100%', marginTop: 5 }}>
            <Input
              value={apiVersion}
              placeholder="2024-xx-xx-preview"
              onChange={(e) => setApiVersion(e.target.value)}
              onBlur={onUpdateApiVersion}
            />
          </Space.Compact>
          <SettingHelpTextRow style={{ justifyContent: 'space-between' }}>
            <SettingHelpText style={{ minWidth: 'fit-content' }}>
              {'Azure OpenAI 的 API 版本，如果想要使用 Response API，请输入 v1 版本'}
            </SettingHelpText>
          </SettingHelpTextRow>
        </>
      )}
      <ModelList providerId={provider.id} />
    </SettingContainer>
  )
}

const ProviderName = styled.span`
  font-size: 14px;
  font-weight: 500;
  margin-right: -2px;
`

export default ProviderSetting
