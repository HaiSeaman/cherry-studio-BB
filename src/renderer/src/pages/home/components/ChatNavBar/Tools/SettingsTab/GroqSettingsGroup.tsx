import Selector from '@renderer/components/Selector'
import { useProvider } from '@renderer/hooks/useProvider'
import { SettingDivider, SettingRow } from '@renderer/pages/settings'
import { CollapsibleSettingGroup } from '@renderer/pages/settings/SettingGroup'
import type { GroqServiceTier, ServiceTier } from '@renderer/types'
import { SystemProviderIds } from '@renderer/types'
import { toOptionValue, toRealValue } from '@renderer/utils/select'
import { Tooltip } from 'antd'
import { CircleHelp } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo } from 'react'
type ServiceTierOptions = { value: NonNullable<GroqServiceTier> | 'undefined'; label: string }

interface Props {
  SettingGroup: FC<{ children: React.ReactNode }>
  SettingRowTitleSmall: FC<{ children: React.ReactNode }>
}

const GroqSettingsGroup: FC<Props> = ({ SettingGroup, SettingRowTitleSmall }) => {
  const { provider, updateProvider } = useProvider(SystemProviderIds.groq)
  const serviceTierMode = provider.serviceTier

  const setServiceTierMode = useCallback(
    (value: ServiceTier) => {
      updateProvider({ serviceTier: value })
    },
    [updateProvider]
  )

  const serviceTierOptions = useMemo(() => {
    const options = [
      {
        value: 'undefined',
        label: '忽略'
      },
      {
        value: 'auto',
        label: '自动'
      },
      {
        value: 'on_demand',
        label: '按需'
      },
      {
        value: 'flex',
        label: '灵活'
      }
    ] as const satisfies ServiceTierOptions[]
    return options
  }, [])

  return (
    <CollapsibleSettingGroup title={'Groq 设置'} defaultExpanded={true}>
      <SettingGroup>
        <SettingRow>
          <SettingRowTitleSmall>
            {'服务层级'}{' '}
            <Tooltip title={'指定用于处理请求的延迟层级'}>
              <CircleHelp size={14} style={{ marginLeft: 4 }} color="var(--color-text-2)" />
            </Tooltip>
          </SettingRowTitleSmall>
          <Selector
            value={toOptionValue(serviceTierMode)}
            onChange={(value) => {
              setServiceTierMode(toRealValue(value))
            }}
            options={serviceTierOptions}
          />
        </SettingRow>
      </SettingGroup>
      <SettingDivider />
    </CollapsibleSettingGroup>
  )
}

export default GroqSettingsGroup
