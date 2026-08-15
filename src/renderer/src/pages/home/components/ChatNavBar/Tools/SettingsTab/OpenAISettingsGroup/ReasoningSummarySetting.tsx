import Selector from '@renderer/components/Selector'
import { SettingRow } from '@renderer/pages/settings'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import { setOpenAISummaryText } from '@renderer/store/settings'
import type { OpenAIReasoningSummary } from '@renderer/types/aiCoreTypes'
import { toOptionValue, toRealValue } from '@renderer/utils/select'
import { Tooltip } from 'antd'
import { CircleHelp } from 'lucide-react'
import type { FC } from 'react'
import { useCallback } from 'react'
import { useSelector } from 'react-redux'

type SummaryTextOption = {
  value: NonNullable<OpenAIReasoningSummary> | 'undefined' | 'null'
  label: string
}

interface Props {
  SettingRowTitleSmall: FC<{ children: React.ReactNode }>
}

const ReasoningSummarySetting: FC<Props> = ({ SettingRowTitleSmall }) => {
  const summaryText = useSelector((state: RootState) => state.settings.openAI.summaryText)
  const dispatch = useAppDispatch()

  const setSummaryText = useCallback(
    (value: OpenAIReasoningSummary) => {
      dispatch(setOpenAISummaryText(value))
    },
    [dispatch]
  )

  const summaryTextOptions = [
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
      value: 'detailed',
      label: '详细'
    },
    {
      value: 'concise',
      label: '简洁'
    }
  ] as const satisfies SummaryTextOption[]

  return (
    <SettingRow>
      <SettingRowTitleSmall>
        {'摘要模式'}{' '}
        <Tooltip title={'模型执行的推理摘要'}>
          <CircleHelp size={14} style={{ marginLeft: 4 }} color="var(--color-text-2)" />
        </Tooltip>
      </SettingRowTitleSmall>
      <Selector
        value={toOptionValue(summaryText)}
        onChange={(value) => {
          setSummaryText(toRealValue(value))
        }}
        options={summaryTextOptions}
      />
    </SettingRow>
  )
}

export default ReasoningSummarySetting
