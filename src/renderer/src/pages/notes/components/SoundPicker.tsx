import { useAppDispatch, useAppSelector } from '@renderer/store'
import { Music4, Plus, X } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import styled from 'styled-components'

import { ALARM_SOUND_OPTIONS, alarmSounds } from '../services/alarmSounds'
import { addCustomSound, type CustomSound, removeCustomSound } from '../store/hubSettingsSlice'
import { mx } from './mx'

export const CUSTOM_PICK = 'custom:pick'

/**
 * 闹钟铃声选择器：内置 7 种 + 自定义声音（选择 MP3 等文件，预解码缓存供响铃循环播放）。
 * 已添加的自定义声音以胶囊 chip 展示在下方，可单独删除。
 */
const SoundPicker: FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const dispatch = useAppDispatch()
  const customSounds = useAppSelector((s) => s.hubSettings.customSounds)
  const [error, setError] = useState('')

  // 预解码缓存所有自定义声音（文件读取失败/解码失败静默跳过，响铃时回退默认）
  useEffect(() => {
    for (const s of customSounds) {
      if (alarmSounds.hasCustomBuffer(s.id)) continue
      void window.api.music
        .readAudioFile(s.filePath)
        .then(async (res) => {
          if (!res.success) return
          const buffer = await alarmSounds.decodeCustom(res.data)
          if (buffer) alarmSounds.setCustomBuffer(s.id, buffer)
        })
        .catch(() => {})
    }
  }, [customSounds])

  const pickCustom = async () => {
    setError('')
    const files = await window.api.file
      .select({
        properties: ['openFile'],
        filters: [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }]
      })
      .catch(() => null)
    if (!files || files.length === 0) return
    const file = files[0]
    if (file.size > 20 * 1024 * 1024) {
      setError('文件过大（超过 20MB），请换一个小一点的音频')
      return
    }
    // 预解码失败（损坏/格式不支持）则拒绝添加
    const res = await window.api.music.readAudioFile(file.path).catch(() => null)
    if (!res?.success) {
      setError('无法读取该文件，请确认是有效的音频文件')
      return
    }
    const buffer = await alarmSounds.decodeCustom(res.data)
    if (!buffer) {
      setError('解码失败：该音频格式不受支持（请使用 MP3 / WAV / OGG / M4A / FLAC）')
      return
    }
    const id = `cs_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    alarmSounds.setCustomBuffer(id, buffer)
    const name = file.origin_name.replace(/\.[^.]+$/, '').slice(0, 40) || '自定义声音'
    dispatch(addCustomSound({ id, name, filePath: file.path }))
    onChange(`custom:${id}`)
    alarmSounds.preview(`custom:${id}`)
  }

  const onSelect = (v: string) => {
    if (v === CUSTOM_PICK) {
      void pickCustom()
      return
    }
    onChange(v)
    alarmSounds.preview(v)
  }

  return (
    <Wrap>
      <Select value={value} onChange={(e) => onSelect(e.target.value)}>
        {ALARM_SOUND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {customSounds.length > 0 && (
          <optgroup label="自定义声音">
            {customSounds.map((s) => (
              <option key={s.id} value={`custom:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value={CUSTOM_PICK}>＋ 自定义声音…（选择电脑里的音频）</option>
      </Select>
      {customSounds.length > 0 && (
        <Chips>
          {customSounds.map((s: CustomSound) => (
            <Chip key={s.id} title={s.filePath}>
              <Music4 size={11} />
              {s.name}
              <ChipX
                onClick={() => {
                  alarmSounds.removeCustomBuffer(s.id)
                  dispatch(removeCustomSound(s.id))
                  if (value === `custom:${s.id}`) onChange('default')
                }}>
                <X size={11} />
              </ChipX>
            </Chip>
          ))}
          <AddChip onClick={() => void pickCustom()} title="再添加一个自定义声音">
            <Plus size={11} /> 添加
          </AddChip>
        </Chips>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`

const Select = styled.select`
  border: 1px solid ${mx.border};
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 12px;
  color: ${mx.text2};
  background: ${mx.soft2};
  outline: none;
  cursor: pointer;
  &:focus {
    border-color: ${mx.accent};
  }
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid ${mx.border};
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10.5px;
  color: ${mx.text2};
  background: ${mx.soft2};
  max-width: 100%;
`

const ChipX = styled.button`
  display: flex;
  border: none;
  background: none;
  color: ${mx.text3};
  cursor: pointer;
  padding: 0;
  &:hover {
    color: ${mx.danger};
  }
`

const AddChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px dashed ${mx.border};
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10.5px;
  color: ${mx.accent};
  background: none;
  cursor: pointer;
  &:hover {
    border-color: ${mx.accent};
  }
`

const ErrorText = styled.div`
  font-size: 11px;
  color: ${mx.danger};
`

export default SoundPicker
