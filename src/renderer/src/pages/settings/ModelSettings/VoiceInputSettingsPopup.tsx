import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig, VoiceInputProvider } from '@shared/config/types'
import { getMissingVoiceInputCredential } from '@shared/config/voiceInput'
import { Flex, Input, message, Modal, Select } from 'antd'
import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { TopView } from '../../../components/TopView'
import { SettingSubtitle } from '..'
import { getFieldValue, getVoiceInputFieldDefs, setFieldValue, VOICE_INPUT_PROVIDER_OPTIONS } from './voiceInputFields'

interface Props {
  resolve: (data: unknown) => void
}

/** 把已保存配置与默认配置合并（补齐缺失的服务商字段，兼容旧数据） */
const mergeConfig = (saved?: Partial<VoiceInputConfig>): VoiceInputConfig => {
  const base = structuredClone(DEFAULT_VOICE_INPUT_CONFIG)
  if (!saved) return base
  return {
    provider: saved.provider ?? base.provider,
    qwen: { ...base.qwen, ...saved.qwen },
    doubao: { ...base.doubao, ...saved.doubao },
    tencent: { ...base.tencent, ...saved.tencent }
  }
}

export const PopupContainer: FC<Props> = ({ resolve }) => {
  const [open, setOpen] = useState(true)
  const [config, setConfig] = useState<VoiceInputConfig | null>(null)

  useEffect(() => {
    void window.api.config.get('voiceInput').then((saved) => {
      setConfig(mergeConfig(saved as Partial<VoiceInputConfig> | undefined))
    })
  }, [])

  const provider = config?.provider ?? 'qwen'
  const fields = useMemo(() => getVoiceInputFieldDefs(provider), [provider])

  const updateField = (key: string, value: string) => {
    setConfig((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      setFieldValue(next, key, value)
      return next
    })
  }

  const close = () => {
    setOpen(false)
  }

  const save = () => {
    if (!config) return
    // 空值回填默认值（模型名/引擎型号这类有推荐的字段）
    for (const field of getVoiceInputFieldDefs(config.provider)) {
      if (field.defaultValue && !getFieldValue(config, field.key)) {
        setFieldValue(config, field.key, field.defaultValue)
      }
    }
    const error = getMissingVoiceInputCredential(config)
    if (error) {
      void message.error(error)
      return
    }
    void window.api.config.set('voiceInput', config)
    setOpen(false)
  }

  return (
    <Modal
      title={'语音输入设置'}
      open={open}
      onOk={save}
      onCancel={close}
      // 无论何种方式关闭，统一由 afterClose 收尾 resolve 一次
      afterClose={() => resolve({})}
      maskClosable={false}
      transitionName="animation-move-down"
      centered
      style={{ padding: '24px' }}>
      {config && (
        <Flex vertical align="stretch" gap={8}>
          <SettingSubtitle style={{ marginTop: 0, marginBottom: 0 }}>{'语音识别服务商'}</SettingSubtitle>
          <Select
            value={config.provider}
            options={VOICE_INPUT_PROVIDER_OPTIONS}
            onChange={(p: VoiceInputProvider) => setConfig({ ...config, provider: p })}
            style={{ width: '100%' }}
            placeholder={'选择服务商'}
          />
          {fields.map((field) => (
            <div key={field.key} style={{ marginTop: 4 }}>
              <div style={{ marginBottom: 4 }}>{field.label}</div>
              {field.secret ? (
                <Input.Password
                  value={getFieldValue(config, field.key)}
                  placeholder={field.defaultValue}
                  onChange={(e) => updateField(field.key, e.target.value)}
                />
              ) : (
                <Input
                  value={getFieldValue(config, field.key)}
                  placeholder={field.defaultValue}
                  onChange={(e) => updateField(field.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </Flex>
      )}
    </Modal>
  )
}

const TopViewKey = 'VoiceInputSettingsPopup'

export default class VoiceInputSettingsPopup {
  static hide() {
    TopView.hide(TopViewKey)
  }

  static show() {
    return new Promise<unknown>((resolve) => {
      TopView.show(
        <PopupContainer
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}
