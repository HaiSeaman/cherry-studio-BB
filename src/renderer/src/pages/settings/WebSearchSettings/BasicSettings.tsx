import BaiduLogo from '@renderer/assets/images/search/baidu.svg'
import BingLogo from '@renderer/assets/images/search/bing.svg'
import BochaLogo from '@renderer/assets/images/search/bocha.webp'
import ExaLogo from '@renderer/assets/images/search/exa.png'
import GoogleLogo from '@renderer/assets/images/search/google.svg'
import QueritLogo from '@renderer/assets/images/search/querit.png'
import SearxngLogo from '@renderer/assets/images/search/searxng.svg'
import TavilyLogo from '@renderer/assets/images/search/tavily.png'
import ZhipuLogo from '@renderer/assets/images/search/zhipu.png'
import Selector from '@renderer/components/Selector'
import { useTheme } from '@renderer/context/ThemeProvider'
import {
  useDefaultWebSearchProvider,
  useWebSearchProviders,
  useWebSearchSettings
} from '@renderer/hooks/useWebSearchProviders'
import { useAppDispatch } from '@renderer/store'
import { setMaxResult, setSearchWithTime } from '@renderer/store/websearch'
import type { WebSearchProvider, WebSearchProviderId } from '@renderer/types'
import { Slider, Switch, Tooltip } from 'antd'
import { Info } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'

import { SettingDivider, SettingGroup, SettingRow, SettingRowTitle, SettingTitle } from '..'

// Provider logos map
const getProviderLogo = (providerId: WebSearchProviderId): string | undefined => {
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

const BasicSettings: FC = () => {
  const { theme } = useTheme()
  const { providers } = useWebSearchProviders()
  const { provider: defaultProvider, setDefaultProvider } = useDefaultWebSearchProvider()
  const { searchWithTime, maxResults, compressionConfig } = useWebSearchSettings()
  const navigate = useNavigate()

  const dispatch = useAppDispatch()

  const updateSelectedWebSearchProvider = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId)
    if (provider) {
      // Check if provider needs API key but doesn't have one
      const needsApiKey = Object.hasOwn(provider, 'apiKey')
      const hasApiKey = provider.apiKey && provider.apiKey.trim() !== ''

      if (needsApiKey && !hasApiKey) {
        // Don't allow selection, show modal to configure
        window.modal.confirm({
          title: '需要 API 密钥',
          content: `${provider.name} 需要 API 密钥才能使用。是否现在去配置？`,
          okText: '去配置',
          cancelText: '取消',
          centered: true,
          onOk: () => {
            navigate(`/settings/websearch/provider/${provider.id}`)
          }
        })
        return
      }

      setDefaultProvider(provider)
    }
  }

  // Sort providers: API providers first, then local providers
  const sortedProviders = [...providers].sort((a, b) => {
    const aIsLocal = a.id.startsWith('local')
    const bIsLocal = b.id.startsWith('local')
    if (aIsLocal && !bIsLocal) return 1
    if (!aIsLocal && bIsLocal) return -1
    return 0
  })

  const renderProviderLabel = (provider: WebSearchProvider) => {
    const logo = getProviderLogo(provider.id)
    const needsApiKey = Object.hasOwn(provider, 'apiKey')

    return (
      <div className="flex items-center gap-2">
        {logo ? (
          <img src={logo} alt={provider.name} className="h-4 w-4 rounded-sm object-contain" />
        ) : (
          <div className="h-4 w-4 rounded-sm bg-[var(--color-background-soft)]" />
        )}
        <span>
          {provider.name}
          {needsApiKey && ` (${'API 密钥'})`}
        </span>
      </div>
    )
  }

  return (
    <>
      <SettingGroup theme={theme}>
        <SettingTitle>{'搜索服务商'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'默认搜索引擎'}</SettingRowTitle>
          <Selector
            size={14}
            value={defaultProvider?.id}
            onChange={(value: string) => updateSelectedWebSearchProvider(value)}
            placeholder={'选择一个搜索服务商'}
            options={sortedProviders.map((p) => ({
              value: p.id,
              label: renderProviderLabel(p)
            }))}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme} style={{ paddingBottom: 8 }}>
        <SettingTitle>{'常规设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'搜索包含日期'}</SettingRowTitle>
          <Switch checked={searchWithTime} onChange={(checked) => dispatch(setSearchWithTime(checked))} />
        </SettingRow>
        <SettingDivider style={{ marginTop: 15, marginBottom: 10 }} />
        <SettingRow style={{ height: 40 }}>
          <SettingRowTitle style={{ minWidth: 120 }}>
            {'搜索结果个数'}
            {maxResults > 20 && compressionConfig?.method === 'none' && (
              <Tooltip title={'未开启搜索结果压缩的情况下，数量过大可能会消耗过多 tokens'} placement="top">
                <Info size={16} color="var(--color-icon)" style={{ marginLeft: 5, cursor: 'pointer' }} />
              </Tooltip>
            )}
          </SettingRowTitle>
          <Slider
            defaultValue={maxResults}
            style={{ width: '100%' }}
            min={1}
            max={100}
            step={1}
            marks={{ 1: '1', 5: '5', 20: '20', 50: '50', 100: '100' }}
            onChangeComplete={(value) => dispatch(setMaxResult(value))}
          />
        </SettingRow>
      </SettingGroup>
    </>
  )
}

export default BasicSettings
