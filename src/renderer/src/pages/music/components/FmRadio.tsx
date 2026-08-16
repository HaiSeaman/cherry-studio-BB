import { Pause, Play, Plus, RotateCw, SkipBack, SkipForward } from 'lucide-react'
import { Input, Modal, Segmented, Spin, Tooltip } from 'antd'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import styled, { keyframes } from 'styled-components'

import { db } from '@renderer/databases'
import { useAppDispatch, useAppSelector } from '@renderer/store'

import { useFmPlayer, type FmStatus } from '../hooks/useFmPlayer'
import {
  getCnHkMusicStations,
  getStationsBySource,
  getTopStations,
  searchStations,
  type RadioConfig,
  type RadioSource
} from '../services/radioApi'
import { addExcludedUrl, clearRadioCache, getCachedCnHk, getCachedTop, getExcludedUrls, setCachedCnHk, setCachedTop } from '../services/radioCache'
import { addCustomStation, removeCustomStation } from '../store/musicSettingsSlice'
import type { RadioStation } from '../types'
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
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
  )

const STATUS_TEXT: Record<FmStatus, string> = {
  idle: '未播放',
  connecting: '连接中…',
  playing: '正在播放',
  paused: '已暂停',
  error: '连接失败'
}

/**
 * FM 网络电台（音乐页右栏）
 * 数据源：RadioBrowser API（热门榜 / 中港音乐 / 搜索）+ 本地收藏 + 自定义电台
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

  const [tab, setTab] = useState<FmTab>('top')
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
      setTopList([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCnhk = useCallback(async (force = false) => {
    const cached = force ? null : getCachedCnHk()
    if (cached) {
      setCnhkList(cached.stations)
      return
    }
    try {
      const list = await getCnHkMusicStations(cfgRef.current)
      setCnhkList(list)
      setCachedCnHk(list)
    } catch {
      setCnhkList([])
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
        const opts = searchMode === 'keyword' ? { keyword: text } : searchMode === 'country' ? { country: text } : { tag: text }
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

  const rawList: RadioStation[] = tab === 'top' ? topList : tab === 'cnhk' ? cnhkList : tab === 'search' ? searchList : favorites || []
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
      addCustomStation({ name, url, favicon: '', country: '自定义', tags: 'custom', bitrate: 0, codec: '', homepage: '' })
    )
    setCustomOpen(false)
    setCustomName('')
    setCustomUrl('')
    setCustomError('')
  }

  const statusLight = player.status === 'playing' ? 'playing' : player.status === 'connecting' ? 'connecting' : player.status === 'error' ? 'error' : 'idle'
  const emptyText =
    tab === 'search' && searchText.trim() ? '未找到匹配电台' : tab === 'favorites' ? '暂无收藏电台，点击列表中的 ☆ 收藏' : '暂无电台数据，请检查网络后点击 ↻ 重试'

  return (
    <Panel data-no-dnd>
      <StatusBar>
        <Light className={statusLight} />
        <StatusText>
          {STATUS_TEXT[player.status]}
          {player.currentStation ? ` · ${player.currentStation.name}` : ''}
        </StatusText>
        <Speed>{player.status === 'playing' ? `${player.kbps} KB/s` : ''}</Speed>
      </StatusBar>
      {player.errorMsg && <ErrorBar>{player.errorMsg}</ErrorBar>}
      <ControlsRow>
        <IconBtn onClick={player.prev} title="上一台">
          <SkipBack size={16} />
        </IconBtn>
        <MainBtn onClick={player.toggle} title={player.status === 'playing' ? '暂停' : '播放'}>
          {player.status === 'playing' ? <Pause size={18} /> : <Play size={18} />}
        </MainBtn>
        <IconBtn onClick={() => player.next()} title="下一台">
          <SkipForward size={16} />
        </IconBtn>
        <VolumeControl />
        <IconBtn onClick={forceRefresh} title="强制刷新（清 7 天缓存）">
          <RotateCw size={16} />
        </IconBtn>
      </ControlsRow>
      <TabsRow>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as FmTab)}
          options={[
            { value: 'top', label: '热门' },
            { value: 'cnhk', label: '中港音乐' },
            { value: 'search', label: '搜索' },
            { value: 'favorites', label: `收藏${favorites?.length ? ` ${favorites.length}` : ''}` }
          ]}
        />
        {tab === 'top' && (
          <Tooltip title={`来源：${SOURCE_LABELS[REFRESH_SOURCES[sourceIdx]]}（点击循环切换）`}>
            <IconBtn onClick={cycleSource} title="切换来源">
              <RotateCw size={14} />
            </IconBtn>
          </Tooltip>
        )}
        <IconBtn onClick={() => setCustomOpen(true)} title="添加自定义电台">
          <Plus size={14} />
        </IconBtn>
      </TabsRow>
      {tab === 'search' && (
        <SearchRow>
          <Segmented
            size="small"
            value={searchMode}
            onChange={(v) => setSearchMode(v as SearchMode)}
            options={[
              { value: 'keyword', label: '名称' },
              { value: 'country', label: '国家' },
              { value: 'tag', label: '标签' }
            ]}
          />
          <Input
            size="small"
            allowClear
            placeholder={searchMode === 'keyword' ? '搜索电台名称…' : searchMode === 'country' ? '按国家搜索，如 China…' : '按标签搜索，如 jazz…'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </SearchRow>
      )}
      <ListArea>
        {loading && tab !== 'search' ? (
          <CenterTip>
            <Spin size="small" />
          </CenterTip>
        ) : stations.length === 0 ? (
          <CenterTip>{emptyText}</CenterTip>
        ) : (
          <StationList>
            {stations.map((s) => {
              const favored = (favorites || []).some((f) => f.url === s.url)
              const isCustom = customStations.some((c) => c.url === s.url)
              return (
                <StationItem key={s.url} className={player.currentUrl === s.url ? 'playing' : ''} onClick={() => player.play(s.url)}>
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
                  <StationInfo>
                    <StationName>{s.name}</StationName>
                    <StationMeta>{[s.country, s.bitrate > 0 ? `${s.bitrate} kbps` : '', s.codec].filter(Boolean).join(' · ')}</StationMeta>
                  </StationInfo>
                  <FavBtn
                    className={favored ? 'favorited' : ''}
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
      <Modal
        title="添加自定义电台"
        open={customOpen}
        onCancel={() => setCustomOpen(false)}
        onOk={addCustom}
        okText="添加"
        cancelText="取消"
        okButtonProps={{ disabled: !customName.trim() || !/^https?:\/\//i.test(customUrl.trim()) }}>
        <Field>
          <Label>名称</Label>
          <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="如：我的私人电台" />
        </Field>
        <Field>
          <Label>流地址</Label>
          <Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="http://…（Icecast/Shoutcast 直播流）" />
        </Field>
        {customError && <ErrorText>{customError}</ErrorText>}
        {!customError && customUrl.trim() && !/^https?:\/\//i.test(customUrl.trim()) && <ErrorText>流地址必须以 http:// 或 https:// 开头</ErrorText>}
      </Modal>
    </Panel>
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

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`
const breathe = keyframes`
  0%, 100% { box-shadow: 0 0 4px 1px currentColor; }
  50% { box-shadow: 0 0 10px 2px currentColor; }
`

const Panel = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  overflow: hidden;
`

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-soft);
  border-radius: 6px;
  background: var(--color-background-mute);
`

const Light = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-3);
  flex-shrink: 0;
  &.connecting {
    color: #f5a623;
    background: #f5a623;
    animation: ${pulse} 1s ease-in-out infinite;
  }
  &.playing {
    color: var(--color-primary);
    background: var(--color-primary);
    animation: ${breathe} 2s ease-in-out infinite;
  }
  &.error {
    background: var(--color-error);
  }
`

const StatusText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text);
`

const Speed = styled.span`
  font-size: 11px;
  color: var(--color-text-3);
  flex-shrink: 0;
`

const ErrorBar = styled.div`
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
`

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
`

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-background);
  color: var(--color-icon);
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
`

const MainBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 60%, #0066cc));
  box-shadow: 0 4px 14px color-mix(in srgb, var(--color-primary) 40%, transparent);
  &:hover {
    filter: brightness(1.1);
  }
`

const TabsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
`

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ListArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--color-border-soft);
  padding-top: 6px;
`

const CenterTip = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 80px;
  color: var(--color-text-3);
  font-size: 12px;
`

const StationList = styled.div`
  display: flex;
  flex-direction: column;
`

const StationItem = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 52px 6px 6px;
  border-radius: 6px;
  cursor: pointer;
  &:hover {
    background: var(--color-background-mute);
  }
  &.playing {
    background: var(--color-primary-mute);
    .name {
      color: var(--color-primary);
    }
  }
`

const Favicon = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-background-mute);
`

const StationInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const StationName = styled.div.attrs({ className: 'name' })`
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StationMeta = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const FavBtn = styled.button`
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--color-text-3);
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  ${StationItem}:hover & {
    opacity: 1;
  }
  &.favorited {
    opacity: 1;
    color: #f5a623;
  }
`

const DeleteBtn = styled.button`
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--color-text-3);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  &:hover {
    color: var(--color-error);
  }
  ${StationItem}:hover & {
    opacity: 1;
  }
`

const Field = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
`

const Label = styled.span`
  width: 48px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--color-text-2);
`

const ErrorText = styled.div`
  color: var(--color-error);
  font-size: 12px;
  margin-bottom: 8px;
`

export default FmRadio
