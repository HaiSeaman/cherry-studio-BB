import { CheckOutlined, ExportOutlined, LoadingOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import BaiduLogo from '@renderer/assets/images/search/baidu.svg'
import BingLogo from '@renderer/assets/images/search/bing.svg'
import BochaLogo from '@renderer/assets/images/search/bocha.webp'
import ExaLogo from '@renderer/assets/images/search/exa.png'
import GoogleLogo from '@renderer/assets/images/search/google.svg'
import QueritLogo from '@renderer/assets/images/search/querit.png'
import SearxngLogo from '@renderer/assets/images/search/searxng.svg'
import TavilyLogo from '@renderer/assets/images/search/tavily.png'
import ZhipuLogo from '@renderer/assets/images/search/zhipu.png'
import { HStack } from '@renderer/components/Layout'
import ApiKeyListPopup from '@renderer/components/Popups/ApiKeyListPopup/popup'
import { WEB_SEARCH_PROVIDER_CONFIG } from '@renderer/config/webSearchProviders'
import { useTimer } from '@renderer/hooks/useTimer'
import { useDefaultWebSearchProvider, useWebSearchProvider } from '@renderer/hooks/useWebSearchProviders'
import WebSearchService from '@renderer/services/WebSearchService'
import type { WebSearchProviderId } from '@renderer/types'
import { formatApiKeys, hasObjectKey } from '@renderer/utils'
import { Button, Divider, Flex, Form, Input, Space, Tooltip } from 'antd'
import Link from 'antd/es/typography/Link'
import { Info, List } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import styled from 'styled-components'

import { SettingDivider, SettingHelpLink, SettingHelpText, SettingHelpTextRow, SettingSubtitle, SettingTitle } from '..'

const logger = loggerService.withContext('WebSearchProviderSetting')
interface Props {
  providerId: WebSearchProviderId
}

const WebSearchProviderSetting: FC<Props> = ({ providerId }) => {
  const { provider, updateProvider } = useWebSearchProvider(providerId)
  const { provider: defaultProvider, setDefaultProvider } = useDefaultWebSearchProvider()
  const [apiKey, setApiKey] = useState(provider.apiKey || '')
  const [apiHost, setApiHost] = useState(provider.apiHost || '')
  const [apiChecking, setApiChecking] = useState(false)
  const [basicAuthUsername, setBasicAuthUsername] = useState(provider.basicAuthUsername || '')
  const [basicAuthPassword, setBasicAuthPassword] = useState(provider.basicAuthPassword || '')
  const [apiValid, setApiValid] = useState(false)
  const { setTimeoutTimer } = useTimer()

  const webSearchProviderConfig = WEB_SEARCH_PROVIDER_CONFIG[provider.id]
  const apiKeyWebsite = webSearchProviderConfig?.websites?.apiKey
  const officialWebsite = webSearchProviderConfig?.websites?.official

  const onUpdateApiKey = () => {
    if (apiKey !== provider.apiKey) {
      updateProvider({ apiKey })
    }
  }

  const onUpdateApiHost = () => {
    let trimmedHost = apiHost?.trim() || ''
    if (trimmedHost.endsWith('/')) {
      trimmedHost = trimmedHost.slice(0, -1)
    }
    if (trimmedHost !== provider.apiHost) {
      updateProvider({ apiHost: trimmedHost })
    } else {
      setApiHost(provider.apiHost || '')
    }
  }

  const onUpdateBasicAuthUsername = () => {
    const currentValue = basicAuthUsername || ''
    const savedValue = provider.basicAuthUsername || ''
    if (currentValue !== savedValue) {
      updateProvider({ basicAuthUsername })
    } else {
      setBasicAuthUsername(provider.basicAuthUsername || '')
    }
  }

  const onUpdateBasicAuthPassword = () => {
    const currentValue = basicAuthPassword || ''
    const savedValue = provider.basicAuthPassword || ''
    if (currentValue !== savedValue) {
      updateProvider({ basicAuthPassword })
    } else {
      setBasicAuthPassword(provider.basicAuthPassword || '')
    }
  }

  const openApiKeyList = async () => {
    await ApiKeyListPopup.show({
      providerId: provider.id,
      title: `${provider.name} ${'API 密钥管理'}`
    })
  }

  async function checkSearch() {
    if (!provider) {
      window.toast.error({
        title: '未选择提供商',
        timeout: 3000,
        icon: <Info size={18} />
      })
      return
    }

    if (apiKey.includes(',')) {
      await openApiKeyList()
      return
    }

    try {
      setApiChecking(true)
      const { valid, error } = await WebSearchService.checkSearch(provider)

      const errorMessage = error && error?.message ? ' ' + error?.message : ''
      window.toast[valid ? 'success' : 'error']({
        timeout: valid ? 2000 : 8000,
        title: valid ? '验证成功' : '验证失败' + errorMessage
      })

      setApiValid(valid)
    } catch (err) {
      logger.error('Check search error:', err as Error)
      setApiValid(false)
      window.toast.error({
        timeout: 8000,
        title: '验证失败'
      })
    } finally {
      setApiChecking(false)
      setTimeoutTimer('checkSearch', () => setApiValid(false), 2500)
    }
  }

  useEffect(() => {
    setApiKey(provider.apiKey ?? '')
    setApiHost(provider.apiHost ?? '')
    setBasicAuthUsername(provider.basicAuthUsername ?? '')
    setBasicAuthPassword(provider.basicAuthPassword ?? '')
  }, [provider.apiKey, provider.apiHost, provider.basicAuthUsername, provider.basicAuthPassword])

  const getWebSearchProviderLogo = (providerId: WebSearchProviderId) => {
    switch (providerId) {
      case 'zhipu':
        return ZhipuLogo
      case 'tavily':
        return TavilyLogo
      case 'searxng':
        return SearxngLogo
      case 'exa':
      case 'exa-mcp':
        return ExaLogo
      case 'bocha':
        return BochaLogo
      case 'querit':
        return QueritLogo
      case 'local-google':
        return GoogleLogo
      case 'local-bing':
        return BingLogo
      case 'local-baidu':
        return BaiduLogo
      default:
        return undefined
    }
  }

  const isLocalProvider = provider.id.startsWith('local')

  const openLocalProviderSettings = async () => {
    if (officialWebsite) {
      await window.api.searchService.openSearchWindow(provider.id, true)
      await window.api.searchService.openUrlInSearchWindow(provider.id, officialWebsite)
    }
  }

  const providerLogo = getWebSearchProviderLogo(provider.id)

  // Check if this provider is already the default
  const isDefault = defaultProvider?.id === provider.id

  // Check if provider needs API key but doesn't have one configured
  const needsApiKey = hasObjectKey(provider, 'apiKey')
  const hasApiKey = provider.apiKey && provider.apiKey.trim() !== ''
  const canSetAsDefault = !isDefault && (!needsApiKey || hasApiKey)

  const handleSetAsDefault = () => {
    if (canSetAsDefault) {
      setDefaultProvider(provider)
    }
  }

  return (
    <>
      <SettingTitle>
        <Flex align="center" justify="space-between" style={{ width: '100%' }}>
          <Flex align="center" gap={8}>
            {providerLogo ? (
              <img src={providerLogo} alt={provider.name} className="h-5 w-5 object-contain" />
            ) : (
              <div className="h-5 w-5 rounded bg-[var(--color-background-soft)]" />
            )}
            <ProviderName> {provider.name}</ProviderName>
            {officialWebsite && webSearchProviderConfig?.websites && (
              <Link target="_blank" href={webSearchProviderConfig.websites.official}>
                <ExportOutlined style={{ color: 'var(--color-text)', fontSize: '12px' }} />
              </Link>
            )}
          </Flex>
          <Button type="default" disabled={!canSetAsDefault} onClick={handleSetAsDefault}>
            {isDefault ? '默认搜索' : '设为默认'}
          </Button>
        </Flex>
      </SettingTitle>
      <Divider style={{ width: '100%', margin: '10px 0' }} />
      {isLocalProvider && (
        <>
          <SettingSubtitle style={{ marginTop: 5, marginBottom: 10 }}>{'本地搜索设置'}</SettingSubtitle>
          <Button type="primary" onClick={openLocalProviderSettings} icon={<ExportOutlined />}>
            {`打开 ${provider.name} 设置`}
          </Button>
          <SettingHelpTextRow style={{ marginTop: 10 }}>
            <SettingHelpText>{'登录网站可以获得更好的搜索结果，也可以对搜索进行个性化设置。'}</SettingHelpText>
          </SettingHelpTextRow>
        </>
      )}
      {!isLocalProvider && hasObjectKey(provider, 'apiKey') && (
        <>
          <SettingSubtitle
            style={{
              marginTop: 5,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
            {'API 密钥'}
            <Tooltip title={'打开管理界面'} mouseEnterDelay={0.5}>
              <Button type="text" size="small" onClick={openApiKeyList} icon={<List size={14} />} />
            </Tooltip>
          </SettingSubtitle>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              value={apiKey}
              placeholder={'API 密钥'}
              onChange={(e) => setApiKey(formatApiKeys(e.target.value))}
              onBlur={onUpdateApiKey}
              spellCheck={false}
              type="password"
              autoFocus={apiKey === ''}
            />
            <Button
              ghost={apiValid}
              type={apiValid ? 'primary' : 'default'}
              onClick={checkSearch}
              disabled={apiChecking}>
              {apiChecking ? <LoadingOutlined spin /> : apiValid ? <CheckOutlined /> : '检测'}
            </Button>
          </Space.Compact>
          <SettingHelpTextRow style={{ justifyContent: 'space-between', marginTop: 5 }}>
            <HStack>
              {apiKeyWebsite && (
                <SettingHelpLink target="_blank" href={apiKeyWebsite}>
                  {'点击这里获取密钥'}
                </SettingHelpLink>
              )}
            </HStack>
            <SettingHelpText>{'多个密钥使用逗号分隔'}</SettingHelpText>
          </SettingHelpTextRow>
        </>
      )}
      {!isLocalProvider && hasObjectKey(provider, 'apiHost') && (
        <>
          <SettingSubtitle style={{ marginTop: 5, marginBottom: 10 }}>{'API 地址'}</SettingSubtitle>
          <Flex gap={8}>
            <Input
              value={apiHost}
              placeholder={'API 地址'}
              onChange={(e) => setApiHost(e.target.value)}
              onBlur={onUpdateApiHost}
            />
          </Flex>
        </>
      )}
      {!isLocalProvider && hasObjectKey(provider, 'basicAuthUsername') && (
        <>
          <SettingDivider style={{ marginTop: 12, marginBottom: 12 }} />
          <SettingSubtitle
            style={{ marginTop: 5, marginBottom: 10, display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
            {'HTTP 认证'}
            <Tooltip
              title={'适用于通过服务器部署的实例（参见文档）。目前仅支持 Basic 方案（RFC7617）'}
              placement="right">
              <Info size={16} color="var(--color-icon)" style={{ marginLeft: 5, cursor: 'pointer' }} />
            </Tooltip>
          </SettingSubtitle>
          <Flex>
            <Form
              layout="vertical"
              style={{ width: '100%' }}
              initialValues={{
                username: basicAuthUsername,
                password: basicAuthPassword
              }}
              onValuesChange={(changedValues) => {
                // Update local state when form values change
                if ('username' in changedValues) {
                  setBasicAuthUsername(changedValues.username || '')
                }
                if ('password' in changedValues) {
                  setBasicAuthPassword(changedValues.password || '')
                }
              }}>
              <Form.Item label={'用户名'} name="username">
                <Input placeholder={'留空以禁用'} onBlur={onUpdateBasicAuthUsername} />
              </Form.Item>
              <Form.Item
                label={'密码'}
                name="password"
                rules={[{ required: !!basicAuthUsername, validateTrigger: ['onBlur', 'onChange'] }]}
                help=""
                hidden={!basicAuthUsername}>
                <Input.Password
                  placeholder={'输入密码'}
                  onBlur={onUpdateBasicAuthPassword}
                  disabled={!basicAuthUsername}
                  visibilityToggle={true}
                />
              </Form.Item>
            </Form>
          </Flex>
        </>
      )}
    </>
  )
}

const ProviderName = styled.span`
  font-size: 14px;
  font-weight: 500;
`

export default WebSearchProviderSetting
