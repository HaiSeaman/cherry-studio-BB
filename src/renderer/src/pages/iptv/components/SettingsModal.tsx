import { DeleteOutlined, FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Input, Modal, Slider, Switch } from 'antd'
import { useState } from 'react'
import styled from 'styled-components'

import type { IptvSettingsState } from '../store/iptvSettingsSlice'
import type { IptvPlaylist } from '../types'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  playlists: IptvPlaylist[]
  settings: Pick<IptvSettingsState, 'autoPlay' | 'autoReconnect' | 'volume'>
  onAddRemote: (url: string) => Promise<void>
  onAddLocal: () => Promise<void>
  onRefresh: (playlist: IptvPlaylist) => Promise<void>
  onRemove: (playlist: IptvPlaylist) => Promise<void>
  onSettingsChange: (patch: Partial<Pick<IptvSettingsState, 'autoPlay' | 'autoReconnect' | 'volume'>>) => void
}

export const SettingsModal = ({
  open,
  onClose,
  playlists,
  settings,
  onAddRemote,
  onAddLocal,
  onRefresh,
  onRemove,
  onSettingsChange
}: SettingsModalProps) => {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const addRemote = async () => {
    if (!url.trim()) return
    setBusy(true)
    try {
      await onAddRemote(url.trim())
      setUrl('')
    } finally {
      setBusy(false)
    }
  }

  const addLocal = async () => {
    setBusy(true)
    try {
      await onAddLocal()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="电视设置" open={open} onCancel={onClose} footer={null} width={560} destroyOnHidden>
      <Section>
        <SectionTitle>添加播放列表</SectionTitle>
        <Row>
          <Input
            placeholder="https://example.com/playlist.m3u"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={() => void addRemote()}
            disabled={busy}
          />
          <Button type="primary" loading={busy} onClick={() => void addRemote()}>
            添加
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => void addLocal()} disabled={busy}>
            本地文件
          </Button>
        </Row>
      </Section>

      <Section>
        <SectionTitle>已添加的播放列表（{playlists.length}）</SectionTitle>
        {playlists.length === 0 && <Empty>暂无播放列表</Empty>}
        {playlists.map((p) => (
          <PlaylistRow key={p.id}>
            <PlaylistInfo>
              <PlaylistName>{p.name}</PlaylistName>
              <PlaylistUrl title={p.url}>{p.url}</PlaylistUrl>
            </PlaylistInfo>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void onRefresh(p)} title="更新" />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void onRemove(p)} title="删除" />
          </PlaylistRow>
        ))}
      </Section>

      <Section>
        <SectionTitle>播放设置</SectionTitle>
        <SettingRow>
          <span>自动播放</span>
          <Switch checked={settings.autoPlay} onChange={(v) => onSettingsChange({ autoPlay: v })} />
        </SettingRow>
        <SettingRow>
          <span>播放失败自动重连</span>
          <Switch checked={settings.autoReconnect} onChange={(v) => onSettingsChange({ autoReconnect: v })} />
        </SettingRow>
        <SettingRow>
          <span>默认音量（100% 以上为增益放大）</span>
          <Slider
            value={settings.volume}
            onChange={(v) => onSettingsChange({ volume: v })}
            min={0}
            max={200}
            tooltip={{ formatter: (val) => `${val ?? 0}%${(val ?? 0) > 100 ? ' 增益' : ''}` }}
            style={{ width: 160 }}
          />
        </SettingRow>
      </Section>
    </Modal>
  )
}

const Section = styled.div`
  margin-bottom: 20px;
`

const SectionTitle = styled.h4`
  margin-bottom: 10px;
  color: var(--color-text, #333);
`

const Row = styled.div`
  display: flex;
  gap: 8px;
`

const Empty = styled.div`
  color: var(--color-text-3, #999);
  font-size: 13px;
  padding: 8px 0;
`

const PlaylistRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border, #f0f0f0);
`

const PlaylistInfo = styled.div`
  flex: 1;
  overflow: hidden;
`

const PlaylistName = styled.div`
  font-size: 13px;
  color: var(--color-text, #333);
`

const PlaylistUrl = styled.div`
  font-size: 11px;
  color: var(--color-text-3, #999);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  color: var(--color-text, #333);
`
