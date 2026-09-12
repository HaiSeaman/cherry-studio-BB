import { db } from '@renderer/databases'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, Plus, Radio, RotateCw, Search, SkipBack, SkipForward } from 'lucide-react'
import { type FC, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import { type FmStatus, useFmPlayer } from '../hooks/useFmPlayer'
import { type RadioConfig, searchStations } from '../services/radioApi'
import { BOARD_SUBS, type BoardGroup, boardKeyOf, type BoardSub, getBoardStations } from '../services/radioBoards'
import { addExcludedUrl, getExcludedUrls } from '../services/radioCache'
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
  MXTabs
} from './mx'
import VolumeControl from './VolumeControl'

/** 一级 tab：国内 / 国外（各含综合+音乐两板块）/ 搜索 / 收藏 */
type FmTab = BoardGroup | 'search' | 'favorites'
type SearchMode = 'keyword' | 'country' | 'tag'

/** 二级板块中文名（板块顺序见 BOARD_SUBS） */
const SUB_LABELS: Record<BoardSub, string> = { news: '综合', music: '音乐' }

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

/** 名称按「 (」拆主副标题：如「中国之声 (CNR-1 国家级综合广播)」→ 主「中国之声」/ 副「CNR-1 国家级综合广播」 */
function splitName(name: string): { title: string; subtitle: string } {
  const i = name.indexOf(' (')
  if (i < 0) return { title: name, subtitle: '' }
  return { title: name.slice(0, i), subtitle: name.slice(i + 2).replace(/\)\s*$/, '') }
}

/**
 * FM 网络电台（右栏卡片）：国内/国外 × 综合/音乐 四大板块 + 搜索 + 收藏。
 * 板块数据打包内置（radioBoards.ts，零网络依赖）；搜索走 RadioBrowser；收存 Dexie。
 */
const FmRadio: FC = () => {
  const dispatch = useAppDispatch()
  const radioConfigState = useAppSelector((s) => s.musicSettings.radioConfig)
  const customStations = useAppSelector((s) => s.musicSettings.customStations)

  const cfg: RadioConfig = useMemo(
    () => ({ apiBaseUrl: radioConfigState.apiBaseUrl, timeout: radioConfigState.timeout }),
    [radioConfigState]
  )
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const [tab, setTab] = useState<FmTab>('domestic')
  const [boardSub, setBoardSub] = useState<BoardSub>('news')
  const [searchList, setSearchList] = useState<RadioStation[]>([])
  const [loading, setLoading] = useState(false)
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

  // 一级 tab 收窄为板块组（搜索/收藏时为 null）：靠类型收窄取组名，不写字符串拼接 + 断言
  const group: BoardGroup | null = tab === 'domestic' || tab === 'foreign' ? tab : null
  const boardKey = group ? boardKeyOf(group, boardSub) : null

  // 板块电台：内置数据 + 自定义电台（自定义排尾部，撞 url 时自定义优先）
  const boardStations = useMemo(
    () => (boardKey ? getBoardStations(boardKey, customStations) : []),
    [boardKey, customStations]
  )

  // 二级 tab 数量徽标 = 该板块实际可播条数（与列表严格一致：含自定义、扣除被 ✕ 隐藏的）
  const boardCounts = useMemo(() => {
    if (!group) return null
    const countOf = (s: BoardSub) =>
      getBoardStations(boardKeyOf(group, s), customStations).filter((x) => !excludedUrls.includes(x.url)).length
    return { news: countOf('news'), music: countOf('music') }
  }, [group, customStations, excludedUrls])

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

  // rawList 依赖 tab 状态切换，必须在 useMemo 内计算：
  // 每次渲染新建的数组引用（尤其 favorites || [] 兜底）会让下方 stations memo 依赖漂移而整体失效
  const rawList: RadioStation[] = useMemo(
    () => (boardKey ? boardStations : tab === 'search' ? searchList : favorites || []),
    [boardKey, boardStations, tab, searchList, favorites]
  )
  const stations = useMemo(() => rawList.filter((s) => !excludedUrls.includes(s.url)), [rawList, excludedUrls])

  const player = useFmPlayer(stations)

  // 控制栏 ↻：板块为内置静态数据、收藏为 Dexie 实时，仅搜索需要重新拉取
  const forceRefresh = useCallback(() => {
    if (tabRef.current !== 'search') return
    const text = searchText.trim()
    if (text) {
      setSearchText('')
      setTimeout(() => setSearchText(text), 0)
    }
  }, [searchText])

  const toggleFavorite = useCallback(
    async (s: RadioStation) => {
      const exists = (favorites || []).some((f) => f.url === s.url)
      if (exists) await db.radio_favorites.delete(s.url)
      else await db.radio_favorites.put({ ...s, addedAt: Date.now() })
    },
    [favorites]
  )

  const removeStation = useCallback(
    (s: RadioStation) => {
      if (customStations.some((c) => c.url === s.url)) {
        dispatch(removeCustomStation(s.url))
        return
      }
      addExcludedUrl(s.url)
      setExcludedUrls(getExcludedUrls())
    },
    [customStations, dispatch]
  )

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
    tab === 'search' && searchText.trim() ? '没有找到电台' : tab === 'favorites' ? '还没有收藏电台' : '本板块暂无电台'
  const emptyHint =
    tab === 'search'
      ? '换个关键词，或切换名称 / 国家 / 标签模式'
      : tab === 'favorites'
        ? '点击电台旁的 ☆ 收藏，随时在这里找到它'
        : '内置电台若被 ✕ 隐藏，可在此添加自定义电台补充'

  // 列表行 memo：网速（kbps）每秒刷新时只更新状态栏，不重建整张列表
  const stationRows = useMemo(
    () =>
      stations.map((s) => (
        <StationRow
          key={s.url}
          station={s}
          favored={(favorites || []).some((f) => f.url === s.url)}
          isCustom={customStations.some((c) => c.url === s.url)}
          isCurrent={player.currentUrl === s.url}
          live={live}
          onPlay={player.play}
          onToggleFavorite={toggleFavorite}
          onRemove={removeStation}
        />
      )),
    [stations, favorites, customStations, player.currentUrl, player.play, live, toggleFavorite, removeStation]
  )

  return (
    <MXCard data-no-dnd>
      <TabsRow>
        <MXTabs
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: 'domestic', label: '国内' },
            { value: 'foreign', label: '国外' },
            { value: 'search', label: '搜索' },
            { value: 'favorites', label: '收藏', badge: favorites?.length }
          ]}
        />
        <TabsActions>
          <MXGhostPill onClick={() => setCustomOpen(true)} title="添加自定义电台（将并入所有板块列表尾部）">
            <Plus size={12} /> 自定义
          </MXGhostPill>
        </TabsActions>
      </TabsRow>
      {group && boardCounts && (
        <SubTabsRow>
          <MXTabs
            size="sm"
            value={boardSub}
            onChange={(v) => setBoardSub(v)}
            options={BOARD_SUBS.map((s) => ({ value: s, label: SUB_LABELS[s], badge: boardCounts[s] }))}
          />
        </SubTabsRow>
      )}
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
        {/* 仅搜索会 loading；板块为内置数据、收藏为 Dexie 实时，切过去时不能被转圈挡住列表 */}
        {loading && tab === 'search' ? (
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
          <StationList>{stationRows}</StationList>
        )}
      </ListArea>
      {/* 底部「播放舱」：与本地音乐 PlayerControls 同构对齐（统一 min-height）。
          行1：左=换台/播放主控、右=音量/刷新，同一水平线；行2：当前播放状态栏 */}
      <ControlsDock>
        <DockMainRow>
          <TransportGroup>
            <MXIconButton onClick={player.prev} title="上一台">
              <SkipBack size={15} />
            </MXIconButton>
            <MainBtn onClick={player.toggle} title={live ? '暂停' : '播放'}>
              {live ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
            </MainBtn>
            <MXIconButton onClick={() => player.next()} title="下一台">
              <SkipForward size={15} />
            </MXIconButton>
          </TransportGroup>
          <ToolGroup>
            <VolumeControl />
            <MXIconButton
              onClick={forceRefresh}
              disabled={tab !== 'search'}
              title={tab === 'search' ? '重新搜索' : '板块为内置数据，无需刷新'}>
              <RotateCw size={15} />
            </MXIconButton>
          </ToolGroup>
        </DockMainRow>
        {/* 状态栏（原顶部 LiveBar 移入）：在功能键下方显示当前电台/状态 */}
        <DockStatusRow>
          <LiveDot className={live ? 'on' : player.status === 'connecting' ? 'connecting' : ''} />
          <LiveText>
            {player.currentStation ? player.currentStation.name : STATUS_TEXT[player.status]}
            {player.currentStation ? ` · ${STATUS_TEXT[player.status]}` : ''}
          </LiveText>
          {live && <KbpsChip>{player.kbps} KB/s</KbpsChip>}
          {player.errorMsg && <ErrorText>{player.errorMsg}</ErrorText>}
        </DockStatusRow>
      </ControlsDock>
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

interface StationRowProps {
  station: RadioStation
  favored: boolean
  isCustom: boolean
  isCurrent: boolean
  live: boolean
  onPlay: (url: string) => void
  onToggleFavorite: (s: RadioStation) => void
  onRemove: (s: RadioStation) => void
}

/** 单行电台（memo）：kbps 每秒刷新时整行 props 不变，跳过重建 */
const StationRow: FC<StationRowProps> = memo(function StationRow({
  station: s,
  favored,
  isCustom,
  isCurrent,
  live,
  onPlay,
  onToggleFavorite,
  onRemove
}) {
  const { title, subtitle } = splitName(s.name)
  const metaParts = [subtitle, s.desc, s.country, s.bitrate > 0 ? `${s.bitrate} kbps` : '', s.codec].filter(Boolean)
  if (isCustom) metaParts.push('自定义')

  return (
    <StationItem className={isCurrent ? 'playing' : ''} onClick={() => onPlay(s.url)}>
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
        <NameRow>
          <StationName title={s.name}>{title}</StationName>
          {s.badge && <BadgeChip>{s.badge}</BadgeChip>}
        </NameRow>
        <StationMeta>{metaParts.join(' · ')}</StationMeta>
      </StationInfo>
      <FavBtn
        className={favored ? 'favorited' : ''}
        title={favored ? '取消收藏' : '收藏'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite(s)
        }}>
        {favored ? '★' : '☆'}
      </FavBtn>
      <DeleteBtn
        title={isCustom ? '删除自定义电台' : '隐藏此电台'}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(s)
        }}>
        ✕
      </DeleteBtn>
    </StationItem>
  )
})

/** 板块徽标（如「国家台」「香港」）：紧跟台名右侧，不被名称省略号挤掉 */
const BadgeChip = styled.span`
  flex-shrink: 0;
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  color: ${mx.accent};
  background: ${mx.accentSoft};
`

/** 播放舱状态点：绿=播放中 / 琥珀=连接中 / 灰=未播放 */
const LiveDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${mx.text3};
  flex-shrink: 0;
  &.connecting {
    background: ${mx.amber};
  }
  &.on {
    background: ${mx.live};
  }
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

/**
 * 底部播放舱：与本地音乐 PlayerControls 同构容器（统一 min-height/间距/视觉），
 * 行1=主控制（换台/播放），行2=工具（音量/刷新）
 */
const ControlsDock = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  min-height: 128px;
  margin-top: 10px;
  padding: 12px 14px;
  background: ${mx.soft2};
  border: 1px solid ${mx.border};
  border-radius: 16px;
`

const DockMainRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`

/** 左侧主控组（上一台/播放/下一台） */
const TransportGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

/** 右侧工具组（音量/刷新） */
const ToolGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

/** 舱内状态栏：功能键下方一行显示当前电台/状态/网速/错误 */
const DockStatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 12px;
  border-radius: 10px;
  background: ${mx.card};
  border: 1px solid ${mx.border};
`

const MainBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  background: ${mx.gradient};
  box-shadow: 0 6px 18px color-mix(in srgb, var(--color-primary) 40%, transparent);
  transition: all 0.18s ease;
  &:hover {
    transform: translateY(-1px) scale(1.04);
    box-shadow: 0 8px 22px color-mix(in srgb, var(--color-primary) 50%, transparent);
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

/** 二级板块行（综合 / 音乐），仅国内/国外下显示 */
const SubTabsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
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
  background: color-mix(in srgb, var(--color-primary) 85%, transparent);
`

const StationInfo = styled.div`
  flex: 1;
  min-width: 0;
`

/** 台名 + 徽标同一行：名称可省略，徽标固定不被挤压 */
const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
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
