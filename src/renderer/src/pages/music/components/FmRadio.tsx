import { db } from '@renderer/databases'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, Plus, Radio, RefreshCw, RotateCw, Search, SkipBack, SkipForward } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled, { keyframes } from 'styled-components'

import { type FmStatus, useFmPlayer } from '../hooks/useFmPlayer'
import {
  getCnHkMusicStations,
  getStationsBySource,
  getTopStations,
  type RadioConfig,
  type RadioSource,
  searchStations,
  withBuiltinCnHk
} from '../services/radioApi'
import {
  addExcludedUrl,
  clearRadioCache,
  getCachedCnHk,
  getCachedTop,
  getExcludedUrls,
  setCachedCnHk,
  setCachedTop
} from '../services/radioCache'
import { addCustomStation, removeCustomStation } from '../store/musicSettingsSlice'
import type { RadioStation } from '../types'
import {
  DialogField,
  DialogInput,
  DialogLabel,
  Eq,
  mx,
  MXCard,
  MXDialog,
  MXGhostPill,
  MXIconButton,
  MXSearchInput,
  MXSpinner,
  MXTabs,
  reduceMotion
} from './mx'
import VolumeControl from './VolumeControl'

type FmTab = 'top' | 'cnhk' | 'search' | 'favorites'
type SearchMode = 'keyword' | 'country' | 'tag'

/** 列表刷新来源循环（仅热门 tab，照文档 §7.7 五种） */
const REFRESH_SOURCES: RadioSource[] = ['topvote', 'topclick', 'recent', 'bycountry-china', 'bycountry-hongkong']
const SOURCE_LABELS: Record<RadioSource, string> = {
  topvote: '热门投票',
  topclick: '热门收听',
  recent: '最近播放',
  'bycountry-china': '中国大陆',
  'bycountry-hongkong': '香港'
}

const FAVICON_FALLBACK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#98A79F" stroke-width="1.8"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.25a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>'
  )

const STATUS_TEXT: Record<FmStatus, string> = {
  idle: '未播放',
  connecting: '连接中',
  playing: '正在播放',
  paused: '已暂停',
  error: '连接失败'
}

/**
 * FM 网络电台（右栏卡片）：LIVE 状态胶囊 + 控制 + 胶囊标签 + 电台列表
 */
const FmRadio: FC = () => {
  const dispatch = useAppDispatch()
  const radioConfigState = useAppSelector((s) => s.musicSettings.radioConfig)
  const customStations = useAppSelector((s) => s.musicSettings.customStations)

  const cfg: RadioConfig = useMemo(
    () => ({ apiBaseUrl: radioConfigState.apiBaseUrl, timeout: radioConfigState.timeout, customStations }),
    [radioConfigState, customStations]
  )
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const [tab, setTab] = useState<FmTab>('cnhk')
  const [topList, setTopList] = useState<RadioStation[]>([])
  const [cnhkList, setCnhkList] = useState<RadioStation[]>([])
  const [searchList, setSearchList] = useState<RadioStation[]>([])
  const [loading, setLoading] = useState(false)
  const [sourceIdx, setSourceIdx] = useState(0)
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword')
  const [searchText, setSearchText] = useState('')
  const [excludedUrls, setExcludedUrls] = useState<string[]>(() => getExcludedUrls())
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [customError, setCustomError] = useState('')

  const favorites = useLiveQuery(() => db.radio_favorites.toArray(), [], [])

  const tabRef = useRef(tab)
  tabRef.current = tab

  const loadTop = useCallback(async (force = false) => {
    const cached = force ? null : getCachedTop()
    if (cached) {
      setTopList(dedupMerge(cached.chinaHk, cached.stations))
      return
    }
    setLoading(true)
    try {
      const list = await getTopStations(cfgRef.current)
      setTopList(list)
      const chinaHk = list.filter((s) => s.country.includes('China') || s.country.includes('Hong Kong'))
      setCachedTop(list, chinaHk)
    } catch {
      // 全部镜像失败：回退内置精选台（清晨音乐台 + RTHK + 自定义），保证始终有台可听
      setTopList(withBuiltinCnHk([], cfgRef.current.customStations))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCnhk = useCallback(async (force = false) => {
    const cached = force ? null : getCachedCnHk()
    if (cached) {
      setCnhkList(withBuiltinCnHk(cached.stations, cfgRef.current.customStations))
      return
    }
    try {
      const list = await getCnHkMusicStations(cfgRef.current)
      setCnhkList(list)
      setCachedCnHk(list)
    } catch {
      setCnhkList(withBuiltinCnHk([], cfgRef.current.customStations))
    }
  }, [])

  useEffect(() => {
    void loadTop()
    void loadCnhk()
  }, [loadTop, loadCnhk])

  // 列表 ↻：五来源循环替换热门列表（不写缓存，控制栏 ↻ 才强制重拉）
  const cycleSource = useCallback(async () => {
    const nextIdx = (sourceIdx + 1) % REFRESH_SOURCES.length
    setSourceIdx(nextIdx)
    setLoading(true)
    try {
      const list = await getStationsBySource(cfgRef.current, REFRESH_SOURCES[nextIdx])
      setTopList(list)
    } catch {
      // 失败保留原列表
    } finally {
      setLoading(false)
    }
  }, [sourceIdx])

  // 搜索：200ms 防抖 + 请求序号守卫丢弃过期响应
  const searchReqId = useRef(0)
  useEffect(() => {
    const text = searchText.trim()
    if (!text) {
      searchReqId.current += 1
      setSearchList([])
      return
    }
    const reqId = ++searchReqId.current
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const opts =
          searchMode === 'keyword' ? { keyword: text } : searchMode === 'country' ? { country: text } : { tag: text }
        const list = await searchStations(cfgRef.current, opts)
        if (searchReqId.current === reqId) setSearchList(list)
      } catch {
        if (searchReqId.current === reqId) setSearchList([])
      } finally {
        if (searchReqId.current === reqId) setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [searchText, searchMode])

  const rawList: RadioStation[] =
    tab === 'top' ? topList : tab === 'cnhk' ? cnhkList : tab === 'search' ? searchList : favorites || []
  const stations = useMemo(() => rawList.filter((s) => !excludedUrls.includes(s.url)), [rawList, excludedUrls])

  const player = useFmPlayer(stations)

  // 控制栏 ↻：清 7 天缓存后强制重拉当前子 tab 数据
  const forceRefresh = useCallback(() => {
    clearRadioCache()
    if (tabRef.current === 'top') void loadTop(true)
    else if (tabRef.current === 'cnhk') void loadCnhk(true)
    else if (tabRef.current === 'search') {
      const text = searchText.trim()
      if (text) {
        setSearchText('')
        setTimeout(() => setSearchText(text), 0)
      }
    }
  }, [loadTop, loadCnhk, searchText])

  const toggleFavorite = async (s: RadioStation) => {
    const exists = (favorites || []).some((f) => f.url === s.url)
    if (exists) await db.radio_favorites.delete(s.url)
    else await db.radio_favorites.put({ ...s, addedAt: Date.now() })
  }

  const removeStation = (s: RadioStation) => {
    if (customStations.some((c) => c.url === s.url)) {
      dispatch(removeCustomStation(s.url))
      return
    }
    addExcludedUrl(s.url)
    setExcludedUrls(getExcludedUrls())
  }

  const addCustom = () => {
    const name = customName.trim()
    const url = customUrl.trim()
    if (!name) return setCustomError('请输入电台名称')
    if (!/^https?:\/\//i.test(url)) return setCustomError('流地址必须以 http:// 或 https:// 开头')
    dispatch(
      addCustomStation({
        name,
        url,
        favicon: '',
        country: '自定义',
        tags: 'custom',
        bitrate: 0,
        codec: '',
        homepage: ''
      })
    )
    setCustomOpen(false)
    setCustomName('')
    setCustomUrl('')
    setCustomError('')
  }

  const live = player.status === 'playing'
  const emptyText =
    tab === 'search' && searchText.trim() ? '没有找到电台' : tab === 'favorites' ? '还没有收藏电台' : '电台列表加载失败'
  const emptyHint =
    tab === 'search'
      ? '换个关键词，或切换名称 / 国家 / 标签模式'
      : tab === 'favorites'
        ? '点击电台旁的 ☆ 收藏，随时在这里找到它'
        : '检查网络后点右上 ↻ 重试；中港音乐 tab 始终有内置精选台'

  return (
    <MXCard data-no-dnd>
      <LiveBar>
        <LiveDot className={live ? 'on' : player.status === 'connecting' ? 'connecting' : ''} />
        <LiveText>
          {player.currentStation ? player.currentStation.name : STATUS_TEXT[player.status]}
          {player.currentStation ? ` · ${STATUS_TEXT[player.status]}` : ''}
        </LiveText>
        {live && <KbpsChip>{player.kbps} KB/s</KbpsChip>}
        {player.errorMsg && <ErrorText>{player.errorMsg}</ErrorText>}
      </LiveBar>
      <ControlsRow>
        <MXIconButton onClick={player.prev} title="上一台">
          <SkipBack size={16} />
        </MXIconButton>
        <MainBtn onClick={player.toggle} title={live ? '暂停' : '播放'}>
          {live ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </MainBtn>
        <MXIconButton onClick={() => player.next()} title="下一台">
          <SkipForward size={16} />
        </MXIconButton>
        <VolumeControl />
        <MXIconButton onClick={forceRefresh} title="强制刷新（清 7 天缓存）">
          <RotateCw size={16} />
        </MXIconButton>
      </ControlsRow>
      <TabsRow>
        <MXTabs
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'top', label: '热门' },
            { value: 'cnhk', label: '中港音乐' },
            { value: 'search', label: '搜索' },
            { value: 'favorites', label: '收藏', badge: favorites?.length }
          ]}
        />
        <TabsActions>
          {tab === 'top' && (
            <MXGhostPill
              onClick={cycleSource}
              title={`当前来源：${SOURCE_LABELS[REFRESH_SOURCES[sourceIdx]]}，点击循环切换`}>
              <RefreshCw size={12} /> {SOURCE_LABELS[REFRESH_SOURCES[sourceIdx]]}
            </MXGhostPill>
          )}
          <MXGhostPill onClick={() => setCustomOpen(true)} title="添加自定义电台">
            <Plus size={12} /> 自定义
          </MXGhostPill>
        </TabsActions>
      </TabsRow>
      {tab === 'search' && (
        <SearchRow>
          <MXTabs
            size="sm"
            value={searchMode}
            onChange={(v) => setSearchMode(v)}
            options={[
              { value: 'keyword', label: '名称' },
              { value: 'country', label: '国家' },
              { value: 'tag', label: '标签' }
            ]}
          />
          <MXSearchInput>
            <Search size={13} />
            <input
              placeholder={
                searchMode === 'keyword'
                  ? '搜索电台名称…'
                  : searchMode === 'country'
                    ? '按国家搜索，如 China'
                    : '按标签搜索，如 jazz'
              }
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </MXSearchInput>
        </SearchRow>
      )}
      <ListArea>
        {loading && tab !== 'search' ? (
          <CenterTip>
            <MXSpinner />
          </CenterTip>
        ) : stations.length === 0 ? (
          <Empty>
            <EmptyIcon>
              <Radio size={28} />
            </EmptyIcon>
            <EmptyTitle>{emptyText}</EmptyTitle>
            <EmptyHint>{emptyHint}</EmptyHint>
          </Empty>
        ) : (
          <StationList>
            {stations.map((s) => {
              const favored = (favorites || []).some((f) => f.url === s.url)
              const isCustom = customStations.some((c) => c.url === s.url)
              const isCurrent = player.currentUrl === s.url
              return (
                <StationItem key={s.url} className={isCurrent ? 'playing' : ''} onClick={() => player.play(s.url)}>
                  <FaviconWrap>
                    <Favicon
                      src={s.favicon || FAVICON_FALLBACK}
                      onError={(e) => {
                        const img = e.currentTarget
                        if (!img.dataset.fb) {
                          img.dataset.fb = '1'
                          img.src = FAVICON_FALLBACK
                        }
                      }}
                    />
                    {isCurrent && <FaviconMask>{live ? <Eq /> : <Eq paused />}</FaviconMask>}
                  </FaviconWrap>
                  <StationInfo>
                    <StationName>{s.name}</StationName>
                    <StationMeta>
                      {[s.country, s.bitrate > 0 ? `${s.bitrate} kbps` : '', s.codec].filter(Boolean).join(' · ')}
                      {isCustom ? ' · 自定义' : ''}
                    </StationMeta>
                  </StationInfo>
                  <FavBtn
                    className={favored ? 'favorited' : ''}
                    title={favored ? '取消收藏' : '收藏'}
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleFavorite(s)
                    }}>
                    {favored ? '★' : '☆'}
                  </FavBtn>
                  <DeleteBtn
                    title={isCustom ? '删除自定义电台' : '隐藏此电台'}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeStation(s)
                    }}>
                    ✕
                  </DeleteBtn>
                </StationItem>
              )
            })}
          </StationList>
        )}
      </ListArea>
      <MXDialog
        open={customOpen}
        title="添加自定义电台"
        okText="添加"
        okDisabled={!customName.trim() || !/^https?:\/\//i.test(customUrl.trim())}
        onCancel={() => setCustomOpen(false)}
        onOk={addCustom}>
        <DialogField>
          <DialogLabel>名称</DialogLabel>
          <DialogInput
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="如：我的私人电台"
          />
        </DialogField>
        <DialogField>
          <DialogLabel>流地址</DialogLabel>
          <DialogInput
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="http://…（Icecast / Shoutcast 直播流）"
          />
        </DialogField>
        {customError && <ErrorText>{customError}</ErrorText>}
        {!customError && customUrl.trim() && !/^https?:\/\//i.test(customUrl.trim()) && (
          <ErrorText>流地址必须以 http:// 或 https:// 开头</ErrorText>
        )}
      </MXDialog>
    </MXCard>
  )
}

/** 热门榜缓存还原：中港置顶 → 全球榜（去重） */
function dedupMerge(chinaHk: RadioStation[], stations: RadioStation[]): RadioStation[] {
  const seen = new Set<string>()
  const out: RadioStation[] = []
  for (const s of [...chinaHk, ...stations]) {
    if (seen.has(s.url)) continue
    seen.add(s.url)
    out.push(s)
  }
  return out
}

const pulseDot = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
`

const LiveBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid ${mx.border};
  border-radius: 999px;
  background: ${mx.soft2};
  margin-bottom: 10px;
  min-height: 36px;
`

const LiveDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${mx.text3};
  flex-shrink: 0;
  &.connecting {
    background: ${mx.amber};
    animation: ${pulseDot} 1s ease-in-out infinite;
  }
  &.on {
    background: ${mx.live};
    animation: ${pulseDot} 1.6s ease-in-out infinite;
  }
  ${reduceMotion}
`

const LiveText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: ${mx.text};
`

const KbpsChip = styled.span`
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: ${mx.accent};
  background: ${mx.accentSoft};
  border-radius: 999px;
  padding: 2px 8px;
  flex-shrink: 0;
`

const ErrorText = styled.span`
  font-size: 11px;
  color: ${mx.danger};
  flex-shrink: 0;
`

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`

const MainBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  background: ${mx.gradient};
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.4);
  transition: all 0.18s ease;
  &:hover {
    transform: translateY(-1px) scale(1.04);
    box-shadow: 0 8px 22px rgba(16, 185, 129, 0.5);
  }
  &:active {
    transform: scale(0.97);
  }
`

const TabsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`

const TabsActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`

const ListArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
`

const CenterTip = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
`

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 24px;
`

const EmptyIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${mx.soft};
  color: ${mx.accent};
  margin-bottom: 4px;
`

const EmptyTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${mx.text};
`

const EmptyHint = styled.div`
  font-size: 12px;
  color: ${mx.text3};
  text-align: center;
  max-width: 260px;
`

const StationList = styled.div`
  display: flex;
  flex-direction: column;
`

const StationItem = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 56px 6px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover {
    background: ${mx.soft};
  }
  &.playing {
    background: ${mx.accentSoft};
    .name {
      color: ${mx.accent};
      font-weight: 600;
    }
  }
`

const FaviconWrap = styled.div`
  position: relative;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
`

const Favicon = styled.img`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  background: ${mx.soft2};
  border: 1px solid ${mx.border};
`

const FaviconMask = styled.span`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.85);
`

const StationInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const StationName = styled.div.attrs({ className: 'name' })`
  font-size: 13px;
  color: ${mx.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StationMeta = styled.div`
  font-size: 11px;
  color: ${mx.text3};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
`

const FavBtn = styled.button`
  position: absolute;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: ${mx.text3};
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transition: all 0.15s ease;
  ${StationItem}:hover & {
    opacity: 1;
    pointer-events: auto;
  }
  &.favorited {
    opacity: 1;
    pointer-events: auto;
    color: ${mx.amber};
  }
  &:hover {
    transform: translateY(-50%) scale(1.15);
  }
`

const DeleteBtn = styled.button`
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: ${mx.text3};
  font-size: 12px;
  cursor: pointer;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transition: all 0.15s ease;
  &:hover {
    color: ${mx.danger};
    background: rgba(239, 83, 80, 0.08);
  }
  ${StationItem}:hover & {
    opacity: 1;
    pointer-events: auto;
  }
`

export default FmRadio
