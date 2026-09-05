import { SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { db } from '@renderer/databases'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { Input, message, Popconfirm } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Tv } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import styled from 'styled-components'

import { ChannelList } from './components/ChannelList'
import { type GroupKey, GroupSidebar } from './components/GroupSidebar'
import { LocalVideoList } from './components/LocalVideoList'
import { PlayerArea } from './components/PlayerArea'
import { ResizeHandle } from './components/ResizeHandle'
import { SettingsModal } from './components/SettingsModal'
import {
  filterChannels,
  getFavorites,
  getRecent,
  loadChannels,
  recordPlay,
  toggleFavorite
} from './services/channelService'
import {
  addLocalVideos,
  basename,
  formatTime,
  hasResumePoint,
  isLocalUrl,
  isVideoFile,
  localFileUrl,
  nextLocalIndex,
  saveLocalProgress,
  stepIndex,
  toLocalChannel,
  VIDEO_EXTENSIONS
} from './services/localMediaService'
import { iptvPlayerStore } from './services/playerStore'
import { addPlaylist, getPlaylists, refreshPlaylist, removePlaylist } from './services/playlistService'
import {
  clampPanePercent,
  setAutoPlay,
  setAutoReconnect,
  setLastVolumeBeforeMute,
  setListPercent as saveListPercent,
  setLocalPlayMode,
  setLocalRate,
  setSidebarPercent as saveSidebarPercent,
  setVolume
} from './store/iptvSettingsSlice'
import type { IptvChannel, IptvFavorite, IptvHistory, IptvLocalVideo, IptvPlaylist, LocalPlayMode } from './types'

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
  /** 播放器页面内最大化：隐藏头部与两侧栏，播放器铺满内容区（Esc 不拦截，经控制条按钮还原） */
  const [maximized, setMaximized] = useState(false)
  // 三栏 1:8:1 满版布局：两侧栏宽度按百分比记忆（默认各 10%），拖拽实时换算，松手写入 redux 持久化
  const [sidebarPercent, setSidebarPercent] = useState(settings.sidebarPercent)
  const [listPercent, setListPercent] = useState(settings.listPercent)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 存档装回是异步的：挂载瞬间拿到的是默认占比；装回完成后用持久化值同步一次。
  // 拖拽期间 redux 值不变（松手才落库），不会打断拖拽；落库后两值一致，同步为无操作。
  useEffect(() => setSidebarPercent(settings.sidebarPercent), [settings.sidebarPercent])
  useEffect(() => setListPercent(settings.listPercent), [settings.listPercent])

  // ---------------- 本地视频 ----------------
  const locals = useLiveQuery(
    async () => {
      const rows = (await db.iptv_locals.toArray()) ?? []
      return rows.sort((a, b) => a.addedAt - b.addedAt)
    },
    [],
    []
  )
  const [listTab, setListTab] = useState<'channels' | 'local'>('channels')
  const isLocal = isLocalUrl(currentUrl)

  // 事件回调里要读"最新值"，经 ref 转发避免闭包过期
  const localsRef = useRef<IptvLocalVideo[]>(locals)
  localsRef.current = locals
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const playLocalRef = useRef<(v: IptvLocalVideo) => void>(() => {})

  /** 播放本地视频：自动断点续播（>5s 且未临近片尾） */
  const playLocal = useCallback((v: IptvLocalVideo) => {
    if (hasResumePoint(v.positionSec, v.durationSec)) {
      iptvPlayerStore.play(toLocalChannel(v), true, v.positionSec)
      message.info(`已从 ${formatTime(v.positionSec)} 继续播放`)
    } else {
      iptvPlayerStore.play(toLocalChannel(v), true)
    }
    if (v.id > 0) void db.iptv_locals.update(v.id, { lastPlayedAt: Date.now() })
  }, [])
  playLocalRef.current = playLocal

  /** 添加并起播第一个（拖入窗口 / 文件选择共用入口） */
  const onFilesDropped = useCallback(async (paths: string[]) => {
    const videos = paths.filter(isVideoFile)
    if (videos.length === 0) {
      message.warning('只支持视频文件（mp4 / mkv / webm / mov 等）')
      return
    }
    setListTab('local')
    const added = await addLocalVideos(videos)
    if (added > 0) message.success(`已添加 ${added} 个视频`)
    else message.info('所选视频都已在列表中')
    // 起播第一个：优先用库里记录（带断点/时长）
    const first = videos[0]
    const stored = (await db.iptv_locals.where('path').equals(first).first()) as IptvLocalVideo | undefined
    playLocalRef.current(
      stored ?? {
        id: 0,
        name: basename(first),
        path: first,
        addedAt: 0,
        lastPlayedAt: null,
        positionSec: 0,
        durationSec: 0
      }
    )
  }, [])

  /** 断点落盘（PlayerArea 每 3 秒节流上报一次） */
  const onProgressSave = useCallback((currentTime: number, duration: number) => {
    const url = iptvPlayerStore.getSnapshot().current?.url
    if (!isLocalUrl(url)) return
    const v = localsRef.current.find((l) => localFileUrl(l.path) === url)
    if (v) void saveLocalProgress(v.path, currentTime, duration)
  }, [])

  // 播完自动连播：按播放模式决定下一部（order 末尾停止 / loopOne 原地 / shuffle 随机）
  useEffect(() => {
    iptvPlayerStore.setOnEnded(() => {
      const url = iptvPlayerStore.getSnapshot().current?.url
      if (!isLocalUrl(url)) return
      const list = localsRef.current
      const idx = list.findIndex((l) => localFileUrl(l.path) === url)
      if (idx === -1) return
      const next = nextLocalIndex(idx, list.length, settingsRef.current.localPlayMode)
      if (next === null) return
      playLocalRef.current(list[next])
    })
    return () => iptvPlayerStore.setOnEnded(null)
  }, [])

  // 倍速设置同步进内核
  useEffect(() => {
    iptvPlayerStore.setPlaybackRate(settings.localRate)
  }, [settings.localRate])

  const onSeek = useCallback((sec: number) => iptvPlayerStore.seekTo(sec), [])
  const onRate = useCallback((rate: number) => dispatch(setLocalRate(rate)), [dispatch])
  const onCycleMode = useCallback(() => {
    const order: LocalPlayMode[] = ['order', 'loopOne', 'shuffle']
    const cur = settingsRef.current.localPlayMode
    dispatch(setLocalPlayMode(order[(order.indexOf(cur) + 1) % order.length]))
  }, [dispatch])

  /** 手动上一个/下一个（列表环绕；未在播放时"下一个"= 第一部） */
  const stepLocal = useCallback((delta: number) => {
    const url = iptvPlayerStore.getSnapshot().current?.url
    const list = localsRef.current
    if (list.length === 0) return
    const idx = isLocalUrl(url) ? list.findIndex((l) => localFileUrl(l.path) === url) : -1
    const target = stepIndex(idx, list.length, delta)
    if (target !== null && target !== idx) playLocalRef.current(list[target])
  }, [])
  const onPrev = useCallback(() => stepLocal(-1), [stepLocal])
  const onNext = useCallback(() => stepLocal(1), [stepLocal])

  const onAddLocal = useCallback(async () => {
    const files = await window.api.file.select({
      title: '选择本地视频',
      filters: [{ name: '视频文件', extensions: [...VIDEO_EXTENSIONS] }],
      properties: ['openFile', 'multiSelections']
    })
    const paths = (files ?? []).map((f) => f.path).filter(Boolean)
    if (paths.length > 0) void onFilesDropped(paths)
  }, [onFilesDropped])

  // 本地视频键盘快捷键：空格播放/暂停，←→ 快退快进 5s，↑↓ 音量
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      if (!isLocalUrl(currentUrl)) return
      if (e.key === ' ') {
        e.preventDefault()
        iptvPlayerStore.toggle()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        iptvPlayerStore.seekTo(iptvPlayerStore.video.currentTime - 5)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        iptvPlayerStore.seekTo(iptvPlayerStore.video.currentTime + 5)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        dispatch(setVolume(Math.min(settingsRef.current.volume + 10, 200)))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        dispatch(setVolume(Math.max(settingsRef.current.volume - 10, 0)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentUrl, dispatch])

  /** 拖拽位移(px) → 占比变化：按 Body 实际宽度换算，窗口任意尺寸下手感一致 */
  const dragPercent = useCallback(
    (setter: (fn: (p: number) => number) => void, clamp: (p: number) => number) => (deltaX: number) => {
      const bodyWidth = bodyRef.current?.clientWidth ?? window.innerWidth
      setter((p) => clamp(p + (deltaX / bodyWidth) * 100))
    },
    []
  )

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

      <Body ref={bodyRef}>
        {/* 1. 左栏：全部频道与我的收藏分组（默认 10%，可拖拽调整并记住） */}
        {!maximized && (
          <>
            <SidebarPane style={{ width: `${sidebarPercent}%` }}>
              <GroupSidebar
                channels={channels}
                current={group}
                onSelect={setGroup}
                favoriteCount={favorites.length}
                recentCount={recent.length}
              />
            </SidebarPane>
            <ResizeHandle
              ariaLabel="调整分组栏宽度"
              onResize={dragPercent(setSidebarPercent, clampPanePercent)}
              onResizeEnd={() => dispatch(saveSidebarPercent(sidebarPercent))}
            />
          </>
        )}

        {/* 2. 中栏：播放器贴边铺满剩余空间（默认 80%，即 1:8:1 布局的"8"），最大化时独占全部 */}
        <PlayerPane>
          <PlayerArea
            volume={settings.volume}
            muted={false}
            maximized={maximized}
            isLocal={isLocal}
            playbackRate={settings.localRate}
            playMode={settings.localPlayMode}
            onVolume={(v) => dispatch(setVolume(v))}
            onToggleMaximize={() => setMaximized((m) => !m)}
            onSeek={onSeek}
            onRate={onRate}
            onCycleMode={onCycleMode}
            onPrev={onPrev}
            onNext={onNext}
            onFilesDropped={(paths) => void onFilesDropped(paths)}
            onProgress={onProgressSave}
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

        {/* 3. 右栏：电视台播放列表 / 本地视频列表 双 Tab（宽度可拖拽调整并记住） */}
        {!maximized && (
          <>
            <ResizeHandle
              ariaLabel="调整列表栏宽度"
              onResize={dragPercent(setListPercent, clampPanePercent)}
              onResizeEnd={() => dispatch(saveListPercent(listPercent))}
            />
            <ListPane style={{ width: `${listPercent}%` }}>
              <TabsRow>
                <TabBtn $active={listTab === 'channels'} onClick={() => setListTab('channels')}>
                  电视台
                </TabBtn>
                <TabBtn $active={listTab === 'local'} onClick={() => setListTab('local')}>
                  本地视频
                </TabBtn>
              </TabsRow>

              {listTab === 'channels' ? (
                loading ? (
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
                )
              ) : (
                <LocalPane>
                  <LocalActions>
                    <AddLocalBtn onClick={() => void onAddLocal()}>
                      <Plus size={13} />
                      添加本地视频
                    </AddLocalBtn>
                    {(locals?.length ?? 0) > 0 && (
                      <Popconfirm
                        title="清空本地视频列表？"
                        description="只移出列表，不删除文件"
                        okText="清空"
                        cancelText="取消"
                        onConfirm={() => void db.iptv_locals.clear()}>
                        <ClearBtn>
                          <Trash2 size={13} />
                          清空
                        </ClearBtn>
                      </Popconfirm>
                    )}
                  </LocalActions>
                  {(locals?.length ?? 0) === 0 ? (
                    <EmptyHint>
                      <Tv size={26} />
                      <div>还没有本地视频</div>
                      <Sub>点击上方按钮选择，或把视频文件拖进播放器</Sub>
                    </EmptyHint>
                  ) : (
                    <LocalVideoList
                      videos={locals ?? []}
                      currentUrl={currentUrl}
                      onPlay={playLocal}
                      onRemove={(v) => void db.iptv_locals.delete(v.id)}
                    />
                  )}
                </LocalPane>
              )}
            </ListPane>
          </>
        )}
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
  /* #root 是横向 flex（页面与侧栏并排），缺 width:100% 会被内容宽度收缩成窄条（其他页面均有此声明） */
  width: 100%;
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

/** 三栏主体（1:8:1 满版）：左右栏占比由拖拽手柄决定并持久化，中间播放器吃满剩余全部空间；min-height:0 允许各栏内部滚动 */
const Body = styled.div`
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
`

const SidebarPane = styled.div`
  flex: none;
  min-width: 170px; /* 小窗口下按占比算出的宽度太窄时兜底 */
  max-width: 30%;
  min-height: 0;
  overflow-y: auto;
`

/** 播放器面板：满版布局——零内边距贴边，占满左右栏之外的全部空间（最大化时独占整个内容区） */
const PlayerPane = styled.div`
  flex: 1;
  min-width: 320px; /* 控制条按钮不换行的下限 */
  min-height: 0;
  display: flex;
  box-sizing: border-box;
`

const ListPane = styled.div`
  flex: none;
  min-width: 220px; /* 小窗口下按占比算出的宽度太窄时兜底 */
  max-width: 30%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

/* ---------------- 右栏双 Tab / 本地视频操作区 ---------------- */

const TabsRow = styled.div`
  flex: none;
  display: flex;
  gap: 2px;
  padding: 8px 10px 0;
  border-bottom: 1px solid var(--color-border-soft);
`

const TabBtn = styled.button<{ $active: boolean }>`
  position: relative;
  flex: 1;
  padding: 7px 0 9px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  color: ${(p) => (p.$active ? 'var(--color-text)' : 'var(--color-text-3)')};
  transition: color 0.15s;

  &::after {
    content: '';
    position: absolute;
    left: 28%;
    right: 28%;
    bottom: -1px;
    height: 2px;
    border-radius: 1px;
    background: ${(p) => (p.$active ? 'var(--color-primary)' : 'transparent')};
  }
`

const LocalPane = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const LocalActions = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 8px;
`

const AddLocalBtn = styled.button`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: none;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--color-text-2);
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;

  &:hover {
    color: var(--color-text);
    border-color: var(--color-primary);
    background: var(--color-list-item-hover);
  }
`

const ClearBtn = styled.button`
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--color-text-3);
  transition:
    color 0.15s,
    background 0.15s;

  &:hover {
    color: var(--color-error, #e5484d);
    background: var(--color-list-item-hover);
  }
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
