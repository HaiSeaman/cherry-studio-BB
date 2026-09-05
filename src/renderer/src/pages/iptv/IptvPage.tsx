import { SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { Input, message } from 'antd'
import { Tv } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import styled, { css } from 'styled-components'

import { ChannelList } from './components/ChannelList'
import { type GroupKey, GroupSidebar } from './components/GroupSidebar'
import { PlayerArea } from './components/PlayerArea'
import { SettingsModal } from './components/SettingsModal'
import {
  filterChannels,
  getFavorites,
  getRecent,
  loadChannels,
  recordPlay,
  toggleFavorite
} from './services/channelService'
import { iptvPlayerStore } from './services/playerStore'
import { addPlaylist, getPlaylists, refreshPlaylist, removePlaylist } from './services/playlistService'
import { setAutoPlay, setAutoReconnect, setLastVolumeBeforeMute, setVolume } from './store/iptvSettingsSlice'
import type { IptvChannel, IptvFavorite, IptvHistory, IptvPlaylist } from './types'

const IptvPage = () => {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((s) => s.iptvSettings)
  // 只订阅当前频道 url（原始值快照：播放器其他状态变化不触发本页重渲染，PlayerArea 自己订阅全量）
  const currentUrl = useSyncExternalStore(
    iptvPlayerStore.subscribe,
    () => iptvPlayerStore.getSnapshot().current?.url ?? null
  )

  const [playlists, setPlaylists] = useState<IptvPlaylist[]>([])
  const [channels, setChannels] = useState<IptvChannel[]>([])
  const [favorites, setFavorites] = useState<IptvFavorite[]>([])
  const [recent, setRecent] = useState<IptvHistory[]>([])
  const [group, setGroup] = useState<GroupKey>('__all__')
  const [keyword, setKeyword] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  /** 播放器页面内最大化：隐藏头部与左栏，播放器铺满内容区（Esc 不拦截，经控制条按钮还原） */
  const [maximized, setMaximized] = useState(false)

  const favoriteUrls = useMemo(() => new Set(favorites.map((f) => f.url)), [favorites])

  const reloadAll = useCallback(async () => {
    const [ps, cs, fs, rs] = await Promise.all([getPlaylists(), loadChannels(), getFavorites(), getRecent()])
    setPlaylists(ps)
    setChannels(cs)
    setFavorites(fs)
    setRecent(rs)
  }, [])

  useEffect(() => {
    void reloadAll().finally(() => setLoading(false))
  }, [reloadAll])

  // 自动重连开关同步到播放器
  useEffect(() => {
    iptvPlayerStore.setAutoReconnect(settings.autoReconnect)
  }, [settings.autoReconnect])

  // Esc 还原页面内最大化（全屏的 Esc 由浏览器原生处理，这里只管最大化）
  useEffect(() => {
    if (!maximized) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximized(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximized])

  // 音量同步到 video 元素
  useEffect(() => {
    iptvPlayerStore.setVolume(settings.volume, settings.volume === 0)
  }, [settings.volume])

  const play = useCallback(
    (channel: IptvChannel) => {
      iptvPlayerStore.play(channel, settings.autoPlay)
      void recordPlay(channel).then(() => {
        void getRecent().then(setRecent)
      })
    },
    [settings.autoPlay]
  )

  const onToggleFavorite = useCallback(async (channel: IptvChannel) => {
    await toggleFavorite(channel)
    setFavorites(await getFavorites())
  }, [])

  // 展示列表：固定组（收藏/最近）或 分组过滤 + 搜索（useDeferredValue 防抖：输入不卡，列表延迟跟随）
  const deferredKeyword = useDeferredValue(keyword)
  const visible = useMemo(() => {
    const kw = deferredKeyword.trim().toLowerCase()
    if (group === '__favorites__') {
      return favorites.filter((f) => !kw || f.name.toLowerCase().includes(kw)).map(toChannel)
    }
    if (group === '__recent__') {
      return recent.filter((h) => !kw || h.name.toLowerCase().includes(kw)).map(toChannel)
    }
    return filterChannels(channels, { group: group === '__all__' ? null : group, keyword: deferredKeyword })
  }, [group, deferredKeyword, channels, favorites, recent])

  // ---------- 设置弹窗动作 ----------

  const addRemote = async (url: string) => {
    try {
      const name = url.split('/').pop() || url
      await addPlaylist(name, url, 'remote')
      await reloadAll()
      message.success('播放列表已添加')
    } catch (e) {
      message.error(`添加失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const addLocal = async () => {
    const files = await window.api.file.select({
      title: '选择 M3U 播放列表',
      filters: [{ name: 'M3U 播放列表', extensions: ['m3u', 'm3u8', 'txt'] }]
    })
    const file = files?.[0]
    if (!file?.path) return
    try {
      await addPlaylist(file.origin_name || file.name, file.path, 'local')
      await reloadAll()
      message.success('播放列表已添加')
    } catch (e) {
      message.error(`添加失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const refresh = async (playlist: IptvPlaylist) => {
    try {
      const count = await refreshPlaylist(playlist)
      await reloadAll()
      message.success(`已更新：${count} 个频道`)
    } catch (e) {
      message.error(`更新失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const remove = async (playlist: IptvPlaylist) => {
    try {
      await removePlaylist(playlist)
      await reloadAll()
      message.success('已删除')
    } catch (e) {
      message.error(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <Container>
      {!maximized && (
        <Header>
          <Title>
            <TitleDot />
            电视
          </Title>
          <SearchBox>
            <Input
              prefix={<SearchOutlined style={{ color: 'var(--color-text-3)' }} />}
              placeholder="搜索频道"
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </SearchBox>
          <SettingBtn onClick={() => setSettingsOpen(true)} aria-label="设置" title="电视设置">
            <SettingOutlined />
          </SettingBtn>
        </Header>
      )}

      <Body>
        {!maximized && (
          <SidebarPane>
            <GroupSidebar
              channels={channels}
              current={group}
              onSelect={setGroup}
              favoriteCount={favorites.length}
              recentCount={recent.length}
            />
          </SidebarPane>
        )}

        {!maximized && (
          <ListPane>
            {loading ? (
              <Hint>加载中…</Hint>
            ) : visible.length === 0 ? (
              <EmptyHint>
                <Tv size={26} />
                <div>{channels.length === 0 ? '还没有播放列表' : '没有匹配的频道'}</div>
                {channels.length === 0 && <Sub>点击右上角设置，添加 M3U 播放源</Sub>}
              </EmptyHint>
            ) : (
              <ChannelList
                channels={visible}
                currentUrl={currentUrl}
                favoriteUrls={favoriteUrls}
                onPlay={play}
                onToggleFavorite={(c) => void onToggleFavorite(c)}
              />
            )}
          </ListPane>
        )}

        <PlayerPane $maximized={maximized}>
          <PlayerArea
            volume={settings.volume}
            muted={false}
            maximized={maximized}
            onVolume={(v) => dispatch(setVolume(v))}
            onToggleMaximize={() => setMaximized((m) => !m)}
            onToggleMute={() => {
              // 音量 0 视为静音：静音前保存当前音量，恢复时取回（避免污染）
              if (settings.volume > 0) {
                dispatch(setLastVolumeBeforeMute(settings.volume))
                dispatch(setVolume(0))
              } else {
                dispatch(setVolume(settings.lastVolumeBeforeMute || 80))
              }
            }}
          />
        </PlayerPane>
      </Body>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        playlists={playlists}
        settings={settings}
        onAddRemote={addRemote}
        onAddLocal={addLocal}
        onRefresh={refresh}
        onRemove={remove}
        onSettingsChange={(patch) => {
          if (patch.autoPlay !== undefined) dispatch(setAutoPlay(patch.autoPlay))
          if (patch.autoReconnect !== undefined) dispatch(setAutoReconnect(patch.autoReconnect))
          if (patch.volume !== undefined) dispatch(setVolume(patch.volume))
        }}
      />
    </Container>
  )
}

/** 快照（收藏/历史）→ 可播放频道对象（url 快照表反向映射，无需 playlistId） */
const toChannel = (snap: IptvFavorite | IptvHistory): IptvChannel => ({
  id: 0,
  playlistId: 0,
  name: snap.name,
  url: snap.url,
  logo: snap.logo,
  group: 'group' in snap ? snap.group : null,
  tvgId: 'tvgId' in snap ? snap.tvgId : null
})

/* ---------------- 布局 ---------------- */

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
`

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border-soft);
  background: var(--color-background-opacity);
  backdrop-filter: blur(14px);
`

const Title = styled.h1`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--color-text);
`

const TitleDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-error, #e5484d);
  box-shadow: 0 0 8px var(--color-error, #e5484d);
  animation: titlepulse 2.2s ease-in-out infinite;

  @keyframes titlepulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
`

const SearchBox = styled.div`
  flex: 1;
  max-width: 300px;

  .ant-input-affix-wrapper {
    border-radius: 8px;
  }
`

const SettingBtn = styled.button`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  font-size: 15px;
  color: var(--color-text-2);
  transition:
    background 0.15s,
    color 0.15s;

  &:hover {
    background: var(--color-list-item-hover);
    color: var(--color-text);
  }
`

/** 三栏主体：min-height:0 允许子栏各自内部滚动；三栏共享精确的上下边缘 */
const Body = styled.div`
  flex: 1;
  display: flex;
  min-height: 0;
`

const SidebarPane = styled.div`
  flex: none;
  width: 168px;
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--color-border-soft);
`

const ListPane = styled.div`
  flex: none;
  width: 288px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--color-border-soft);
`

/** 播放器面板：flex 容器让 PlayerArea 撑满全高（悬浮剧院卡）；最大化时铺满内容区 */
const PlayerPane = styled.div<{ $maximized?: boolean }>`
  flex: 1;
  min-width: 360px;
  min-height: 0;
  display: flex;
  padding: 12px;
  box-sizing: border-box;

  ${(p) =>
    p.$maximized &&
    css`
      padding: 0;
      min-width: 0;
    `}
`

/* ---------------- 空态 ---------------- */

const Hint = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-3);
  font-size: 13px;
`

const EmptyHint = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--color-text-3);
  font-size: 13px;
`

const Sub = styled.div`
  font-size: 11.5px;
  color: var(--color-text-3);
  opacity: 0.75;
`

export default IptvPage
