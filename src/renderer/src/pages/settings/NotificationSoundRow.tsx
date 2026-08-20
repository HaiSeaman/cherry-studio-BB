import { AudioOutlined, CloseCircleOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { NOTIFICATION_SOUND_EXTENSIONS } from '@renderer/store/settings'
import type { NotificationSource } from '@renderer/types/notification'
import { Button, Tooltip } from 'antd'
import { type FC, useState } from 'react'
import styled from 'styled-components'

interface Props {
  source: NotificationSource
  sound: string
  /** 用户选择了新本地文件（存 'custom:<path>'） */
  onSoundChange: (sound: string) => void
}

/** 用独立的临时 AudioContext 校验文件可解码（失败提示，成功立即播放试听）；用完关闭避免泄漏 */
async function validateAndPreview(filePath: string): Promise<boolean> {
  let ctx: AudioContext | null = null
  try {
    if (typeof AudioContext === 'undefined') return true
    ctx = new AudioContext()
    const res = await window.api.music.readAudioFile(filePath)
    if (!res?.success || !res.data) return false
    const buf = res.data.buffer.slice(res.data.byteOffset, res.data.byteOffset + res.data.byteLength) as ArrayBuffer
    const audioBuf = await ctx.decodeAudioData(buf)
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = 0.7
    source.buffer = audioBuf
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start()
    // 播放完毕后关闭 context，避免每次选择文件都泄漏一个 AudioContext
    source.onended = () => {
      void ctx?.close().catch(() => {})
    }
    return true
  } catch {
    void ctx?.close().catch(() => {})
    return false
  }
}

/** 从 'custom:<path>' 取展示文件名 */
export function soundDisplayName(sound: string): string | null {
  if (!sound.startsWith('custom:')) return null
  const path = sound.slice('custom:'.length)
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || null
}

/**
 * 通知声音选择：按钮选择本地音频文件（常见格式），显示当前声音名，可清除回默认提示音。
 * 放在每个通知开关左边。
 */
const NotificationSoundRow: FC<Props> = ({ source, sound, onSoundChange }) => {
  const [error, setError] = useState('')
  const customName = soundDisplayName(sound)

  const pickSound = async () => {
    setError('')
    const files = await window.api.file
      .select({
        properties: ['openFile'],
        filters: [{ name: '音频', extensions: NOTIFICATION_SOUND_EXTENSIONS }]
      })
      .catch(() => null)
    if (!files || files.length === 0) return
    const file = files[0]
    if (file.size > 20 * 1024 * 1024) {
      setError('文件过大（超过 20MB），请换一个小一点的音频')
      return
    }
    // 校验可读可解码，成功即试听；失败拒绝并提示
    const ok = await validateAndPreview(file.path)
    if (!ok) {
      setError('无法播放该文件，请确认是有效的音频文件（MP3/WAV/OGG/M4A/FLAC/AAC）')
      return
    }
    onSoundChange(`custom:${file.path}`)
  }

  const clearSound = () => {
    setError('')
    onSoundChange('default')
  }

  return (
    <Wrap>
      <Btns>
        <Tooltip title={`为「${source}」选择本地声音文件`}>
          <Button size="small" icon={<FolderOpenOutlined />} onClick={() => void pickSound()}>
            选择声音
          </Button>
        </Tooltip>
        {customName && (
          <Current title={sound}>
            <AudioOutlined />
            <span>{customName}</span>
            <ClearBtn onClick={clearSound} title="清除，恢复默认提示音">
              <CloseCircleOutlined />
            </ClearBtn>
          </Current>
        )}
        {!customName && <DefaultHint>默认提示音</DefaultHint>}
      </Btns>
      {error && <ErrorText>{error}</ErrorText>}
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`

const Btns = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`

const Current = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 220px;
  font-size: 12px;
  color: var(--color-text-2);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 2px 8px;
  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const ClearBtn = styled.button`
  display: flex;
  border: none;
  background: none;
  padding: 0;
  color: var(--color-text-3);
  cursor: pointer;
  &:hover {
    color: var(--color-error);
  }
`

const DefaultHint = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
`

const ErrorText = styled.div`
  font-size: 11px;
  color: var(--color-error);
`

export default NotificationSoundRow
