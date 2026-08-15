import Selector from '@renderer/components/Selector'
import { isSupportFlexServiceTierModel } from '@renderer/config/models'
import { useProvider } from '@renderer/hooks/useProvider'
import { SettingRow } from '@renderer/pages/settings'
import type { Model, OpenAIServiceTier, ServiceTier } from '@renderer/types'
import { toOptionValue, toRealValue } from '@renderer/utils/select'
import { Tooltip } from 'antd'
import { CircleHelp } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo } from 'react'
type OpenAIServiceTierOption = { value: NonNullable<OpenAIServiceTier> | 'null' | 'undefined'; label: string }

interface Props {
  model: Model
  providerId: string
  SettingRowTitleSmall: FC<{ children: React.ReactNode }>
}

const ServiceTierSetting: FC<Props> = ({ model, providerId, SettingRowTitleSmall }) => {
  const { provider, updateProvider } = useProvider(providerId)
  const serviceTierMode = provider.serviceTier
  const isSupportFlexServiceTier = isSupportFlexServiceTierModel(model)

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
        value: 'null',
        label: '关闭'
      },
      {
        value: 'auto',
        label: '自动'
      },
      {
        value: 'default',
        label: '默认'
      },
      {
        value: 'flex',
        label: '灵活'
      },
      {
        value: 'priority',
        label: '优先'
      }
    ] as const satisfies OpenAIServiceTierOption[]
    return options.filter((option) => {
      if (option.value === 'flex') {
        return isSupportFlexServiceTier
      }
      return true
    })
  }, [isSupportFlexServiceTier])

  return (
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
  )
}

export default ServiceTierSetting
