import Selector from '@renderer/components/Selector'
import { getModelSupportedVerbosity } from '@renderer/config/models'
import { SettingRow } from '@renderer/pages/settings'
import type { RootState } from '@renderer/store'
import { useAppDispatch } from '@renderer/store'
import { setOpenAIVerbosity } from '@renderer/store/settings'
import type { Model } from '@renderer/types'
import type { OpenAIVerbosity } from '@renderer/types/aiCoreTypes'
import { toOptionValue, toRealValue } from '@renderer/utils/select'
import { Tooltip } from 'antd'
import { CircleHelp } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'

type VerbosityOption = {
  value: NonNullable<OpenAIVerbosity> | 'undefined' | 'null'
  label: string
}

interface Props {
  model: Model
  SettingRowTitleSmall: FC<{ children: React.ReactNode }>
}

const VerbositySetting: FC<Props> = ({ model, SettingRowTitleSmall }) => {
  const verbosity = useSelector((state: RootState) => state.settings.openAI.verbosity)
  const dispatch = useAppDispatch()

  const setVerbosity = useCallback(
    (value: OpenAIVerbosity) => {
      dispatch(setOpenAIVerbosity(value))
    },
    [dispatch]
  )

  const verbosityOptions = useMemo(() => {
    const allOptions = [
      {
        value: 'undefined',
        label: '忽略'
      },
      {
        value: 'null',
        label: '关闭'
      },
      {
        value: 'low',
        label: '低'
      },
      {
        value: 'medium',
        label: '中'
      },
      {
        value: 'high',
        label: '高'
      }
    ] as const satisfies VerbosityOption[]
    const supportedVerbosityLevels = getModelSupportedVerbosity(model).map((v) => toOptionValue(v))
    return allOptions.filter((option) => supportedVerbosityLevels.includes(option.value))
  }, [model])

  useEffect(() => {
    if (verbosity !== undefined && !verbosityOptions.some((option) => option.value === toOptionValue(verbosity))) {
      const supportedVerbosityLevels = getModelSupportedVerbosity(model)
      // Default to the highest supported verbosity level
      const defaultVerbosity = supportedVerbosityLevels[supportedVerbosityLevels.length - 1]
      setVerbosity(defaultVerbosity)
    }
  }, [model, verbosity, verbosityOptions, setVerbosity])

  return (
    <SettingRow>
      <SettingRowTitleSmall>
        {'详细程度'}{' '}
        <Tooltip title={'控制模型输出的详细程度'}>
          <CircleHelp size={14} style={{ marginLeft: 4 }} color="var(--color-text-2)" />
        </Tooltip>
      </SettingRowTitleSmall>
      <Selector
        value={toOptionValue(verbosity)}
        onChange={(value) => {
          setVerbosity(toRealValue(value))
        }}
        options={verbosityOptions}
      />
    </SettingRow>
  )
}

export default VerbositySetting
