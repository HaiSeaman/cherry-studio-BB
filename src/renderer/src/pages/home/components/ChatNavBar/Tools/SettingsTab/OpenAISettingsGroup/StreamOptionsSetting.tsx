import Selector from '@renderer/components/Selector'
import { SettingRow } from '@renderer/pages/settings'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import { setOpenAIStreamOptionsIncludeUsage } from '@renderer/store/settings'
import type { OpenAICompletionsStreamOptions } from '@renderer/types/aiCoreTypes'
import { toOptionValue, toRealValue } from '@renderer/utils/select'
import { Tooltip } from 'antd'
import { CircleHelp } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'

type IncludeUsageOption = {
  value: 'undefined' | 'false' | 'true'
  label: string
}

interface Props {
  SettingRowTitleSmall: FC<{ children: React.ReactNode }>
}

const StreamOptionsSetting: FC<Props> = ({ SettingRowTitleSmall }) => {
  const includeUsage = useSelector((state: RootState) => state.settings.openAI?.streamOptions?.includeUsage)
  const dispatch = useAppDispatch()

  const setIncludeUsage = useCallback(
    (value: OpenAICompletionsStreamOptions['include_usage']) => {
      dispatch(setOpenAIStreamOptionsIncludeUsage(value))
    },
    [dispatch]
  )

  const includeUsageOptions = useMemo(() => {
    return [
      {
        value: 'undefined',
        label: '忽略'
      },
      {
        value: 'false',
        label: '关闭'
      },
      {
        value: 'true',
        label: '启用'
      }
    ] as const satisfies IncludeUsageOption[]
  }, [])

  return (
    <SettingRow>
      <SettingRowTitleSmall>
        {'包含用量'}{' '}
        <Tooltip title={'是否请求 Tokens 用量（仅 OpenAI Chat Completions API 可用）'}>
          <CircleHelp size={14} style={{ marginLeft: 4 }} color="var(--color-text-2)" />
        </Tooltip>
      </SettingRowTitleSmall>
      <Selector
        value={toOptionValue(includeUsage)}
        onChange={(value) => {
          setIncludeUsage(toRealValue(value))
        }}
        options={includeUsageOptions}
      />
    </SettingRow>
  )
}

export default StreamOptionsSetting
