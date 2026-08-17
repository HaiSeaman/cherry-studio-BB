import BaiduLogo from '@renderer/assets/images/search/baidu.svg'
import BingLogo from '@renderer/assets/images/search/bing.svg'
import BochaLogo from '@renderer/assets/images/search/bocha.webp'
import ExaLogo from '@renderer/assets/images/search/exa.png'
import GoogleLogo from '@renderer/assets/images/search/google.svg'
import QueritLogo from '@renderer/assets/images/search/querit.png'
import SearxngLogo from '@renderer/assets/images/search/searxng.svg'
import TavilyLogo from '@renderer/assets/images/search/tavily.png'
import ZhipuLogo from '@renderer/assets/images/search/zhipu.png'
import DividerWithText from '@renderer/components/DividerWithText'
import ListItem from '@renderer/components/ListItem'
import Scrollbar from '@renderer/components/Scrollbar'
import { useDefaultWebSearchProvider, useWebSearchProviders } from '@renderer/hooks/useWebSearchProviders'
import type { WebSearchProviderId } from '@renderer/types'
import { hasObjectKey } from '@renderer/utils'
import { Flex, Tag } from 'antd'
import { Search } from 'lucide-react'
import type { FC } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import WebSearchGeneralSettings from './WebSearchGeneralSettings'
import WebSearchProviderSettings from './WebSearchProviderSettings'

const WebSearchSettings: FC = () => {
  const { providers } = useWebSearchProviders()
  const { provider: defaultProvider } = useDefaultWebSearchProvider()
  const navigate = useNavigate()
  const location = useLocation()

  // Get the currently active view
  const getActiveView = () => {
    const path = location.pathname

    if (path === '/settings/websearch/general' || path === '/settings/websearch') {
      return 'general'
    }

    // Check if it's a provider page
    for (const provider of providers) {
      if (path === `/settings/websearch/provider/${provider.id}`) {
        return provider.id
      }
    }

    return 'general'
  }

  const activeView = getActiveView()

  // Filter providers that have API settings (apiKey or apiHost)
  const apiProviders = providers.filter((p) => hasObjectKey(p, 'apiKey') || hasObjectKey(p, 'apiHost'))
  const localProviders = providers.filter((p) => p.id.startsWith('local'))

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

  return (
    <Container>
      <MainContainer>
        <MenuList>
          <ListItem
            title={'网络搜索'}
            active={activeView === 'general'}
            onClick={() => navigate('/settings/websearch/general')}
            icon={<Search size={18} />}
            titleStyle={{ fontWeight: 500 }}
          />
          <DividerWithText text={'API 服务商'} style={{ margin: '10px 0 8px 0' }} />
          {apiProviders.map((provider) => {
            const logo = getProviderLogo(provider.id)
            const isDefault = defaultProvider?.id === provider.id
            return (
              <ListItem
                key={provider.id}
                title={provider.name}
                active={activeView === provider.id}
                onClick={() => navigate(`/settings/websearch/provider/${provider.id}`)}
                icon={
                  logo ? (
                    <img src={logo} alt={provider.name} className="h-5 w-5 rounded object-contain" />
                  ) : (
                    <div className="h-5 w-5 rounded bg-[var(--color-background-soft)]" />
                  )
                }
                titleStyle={{ fontWeight: 500 }}
                rightContent={
                  isDefault ? (
                    <Tag color="green" style={{ marginLeft: 'auto', marginRight: 0, borderRadius: 16 }}>
                      {'默认'}
                    </Tag>
                  ) : undefined
                }
              />
            )
          })}
          {localProviders.length > 0 && (
            <>
              <DividerWithText text={'本地搜索'} style={{ margin: '10px 0 8px 0' }} />
              {localProviders.map((provider) => {
                const logo = getProviderLogo(provider.id)
                const isDefault = defaultProvider?.id === provider.id
                return (
                  <ListItem
                    key={provider.id}
                    title={provider.name}
                    active={activeView === provider.id}
                    onClick={() => navigate(`/settings/websearch/provider/${provider.id}`)}
                    icon={
                      logo ? (
                        <img src={logo} alt={provider.name} className="h-5 w-5 rounded object-contain" />
                      ) : (
                        <div className="h-5 w-5 rounded bg-[var(--color-background-soft)]" />
                      )
                    }
                    titleStyle={{ fontWeight: 500 }}
                    rightContent={
                      isDefault ? (
                        <Tag color="green" style={{ marginLeft: 'auto', marginRight: 0, borderRadius: 16 }}>
                          {'默认'}
                        </Tag>
                      ) : undefined
                    }
                  />
                )
              })}
            </>
          )}
        </MenuList>
        <RightContainer>
          <Routes>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<WebSearchGeneralSettings />} />
            <Route path="provider/:providerId" element={<WebSearchProviderSettings />} />
          </Routes>
        </RightContainer>
      </MainContainer>
    </Container>
  )
}

const Container = styled(Flex)`
  flex: 1;
`

const MainContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  width: 100%;
  height: calc(100vh - var(--navbar-height) - 6px);
  overflow: hidden;
`

const MenuList = styled(Scrollbar)`
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: var(--settings-width);
  padding: 12px;
  padding-bottom: 48px;
  border-right: 0.5px solid var(--color-border);
  height: calc(100vh - var(--navbar-height));
`

const RightContainer = styled.div`
  flex: 1;
  position: relative;
  display: flex;
`

export default WebSearchSettings
