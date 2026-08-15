import AI302ProviderLogo from '@renderer/assets/images/providers/302ai.webp'
import AiHubMixProviderLogo from '@renderer/assets/images/providers/aihubmix.webp'
import AiOnlyProviderLogo from '@renderer/assets/images/providers/aiOnly.webp'
import PPIOProviderLogo from '@renderer/assets/images/providers/ppio.png'
import SiliconFlowProviderLogo from '@renderer/assets/images/providers/silicon.png'
import TokenFluxProviderLogo from '@renderer/assets/images/providers/tokenflux.png'
import { HStack } from '@renderer/components/Layout'
import OAuthButton from '@renderer/components/OAuth/OAuthButton'
import { PROVIDER_URLS } from '@renderer/config/providers'
import { useProvider } from '@renderer/hooks/useProvider'
import { getProviderLabel } from '@renderer/i18n/label'
import { providerBills, providerCharge } from '@renderer/utils/oauth'
import { Button } from 'antd'
import { isEmpty } from 'lodash'
import { CircleDollarSign, ReceiptText } from 'lucide-react'
import type { FC } from 'react'
import styled from 'styled-components'

interface Props {
  providerId: string
}

const PROVIDER_LOGO_MAP = {
  '302ai': AI302ProviderLogo,
  silicon: SiliconFlowProviderLogo,
  aihubmix: AiHubMixProviderLogo,
  ppio: PPIOProviderLogo,
  tokenflux: TokenFluxProviderLogo,
  aionly: AiOnlyProviderLogo
}

const ProviderOAuth: FC<Props> = ({ providerId }) => {
  const { provider, updateProvider } = useProvider(providerId)

  const setApiKey = (newKey: string) => {
    updateProvider({ apiKey: newKey, enabled: true })
  }

  let providerWebsite =
    PROVIDER_URLS[provider.id]?.api?.url?.replace('https://', '').replace('api.', '') || provider.name
  if (provider.id === 'ppio') {
    providerWebsite = 'ppio.com'
  }
  // 部分旧版持久化的 provider（如 silicon）不在 PROVIDER_URLS 中，需空值保护
  const officialWebsite = PROVIDER_URLS[provider.id]?.websites?.official ?? '#'

  return (
    <Container>
      <ProviderLogo src={PROVIDER_LOGO_MAP[provider.id]} />
      {isEmpty(provider.apiKey) ? (
        <OAuthButton provider={provider} onSuccess={setApiKey}>
          {`使用 ${getProviderLabel(provider.id)} 账号登录`}
        </OAuthButton>
      ) : (
        <HStack gap={10}>
          <Button shape="round" icon={<CircleDollarSign size={16} />} onClick={() => providerCharge(provider.id)}>
            {'余额充值'}
          </Button>
          <Button shape="round" icon={<ReceiptText size={16} />} onClick={() => providerBills(provider.id)}>
            {'费用账单'}
          </Button>
        </HStack>
      )}
      <Description>
        本服务由{' '}
        <OfficialWebsite href={officialWebsite} target="_blank" rel="noreferrer">
          {providerWebsite}
        </OfficialWebsite>{' '}
        提供
      </Description>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 15px;
  padding: 20px;
`

const ProviderLogo = styled.img`
  width: 60px;
  height: 60px;
  border-radius: 50%;
`

const Description = styled.div`
  font-size: 11px;
  color: var(--color-text-2);
  display: flex;
  align-items: center;
  gap: 5px;
`

const OfficialWebsite = styled.a`
  text-decoration: none;
  color: var(--color-text-2);
`

export default ProviderOAuth
