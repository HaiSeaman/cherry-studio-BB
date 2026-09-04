import type { ClipboardItem, ClipboardLimits } from '@shared/IpcChannel'
import {
  Clipboard as ClipboardIcon,
  Eye,
  File as FileIcon,
  Image as ImageIcon,
  Pin,
  PinOff,
  Search,
  Settings2,
  Star,
  StarOff,
  Trash2,
  X
} from 'lucide-react'
import type { ReactNode } from 'react'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'

/** 图片缩略图的 file:// URL（Windows 反斜杠转正斜杠 + 中文路径编码，webSecurity:false 允许 file://） */
const thumbUrl = (p: string): string =>
  'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23')

const fileBaseName = (p: string): string => p.split(/[\\/]/).pop() || p

/** HTML → 纯文本预览（轻量正则，与主进程 stripHtmlText 同构） */
const htmlPreview = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/** 时间戳显示（需求4）：MM-DD HH:MM */
const fmtTime = (ts: number): string => {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 关键词匹配：文本/色号/文件路径命中；富文本按纯文本预览匹配；图片仅有关键词时隐藏 */
const matchKeyword = (item: ClipboardItem, kw: string): boolean => {
  if (!kw) return true
  if (item.type === 'text' || item.type === 'color') return (item.text ?? '').toLowerCase().includes(kw)
  if (item.type === 'html') return htmlPreview(item.html ?? '').toLowerCase().includes(kw)
  if (item.type === 'rtf') return false // 与图片一致：无可搜索文本，有关键词即隐藏
  if (item.type === 'files') return (item.paths ?? []).some((p) => p.toLowerCase().includes(kw))
  return false
}

/** 条目主体预览（需求5：color 色块 + html/rtf 富文本预览） */
const ItemBody: FC<{ item: ClipboardItem }> = ({ item }) => {
  switch (item.type) {
    case 'text':
      return <span className="clip-item-text">{item.text}</span>
    case 'color':
      return (
        <span className="clip-item-color">
          <i className="clip-color-dot" style={{ background: item.text }} />
          <span className="clip-item-text">{item.text}</span>
        </span>
      )
    case 'html': {
      const preview = htmlPreview(item.html ?? '')
      return <span className="clip-item-text">{preview ? `富文本 ${preview}` : '富文本(无文字)'}</span>
    }
    case 'rtf':
      return <span className="clip-item-text">富文本(RTF)</span>
    case 'image':
      return item.thumbPath ? (
        <img className="clip-item-thumb" src={thumbUrl(item.thumbPath)} alt="剪贴板图片" draggable={false} />
      ) : (
        <span className="clip-item-text clip-item-degraded">图片预览不可用</span>
      )
    case 'files':
      return (
        <span className="clip-item-text">
          {fileBaseName(item.paths?.[0] ?? '')}
          {(item.paths?.length ?? 0) > 1 ? `（共 ${item.paths?.length} 个文件）` : ''}
        </span>
      )
    default:
      return null
  }
}

const TYPE_ICON: Record<string, ReactNode> = {
  text: <ClipboardIcon size={13} />,
  color: <ClipboardIcon size={13} />,
  html: <ClipboardIcon size={13} />,
  rtf: <ClipboardIcon size={13} />,
  image: <ImageIcon size={13} />,
  files: <FileIcon size={13} />
}

/**
 * 剪贴板历史视图（桌面挂件第 5 视图）：无 TAB 无详情页，纯展示层。
 * - 每条：收藏★（固定键左侧）/ 固定钉 / 删除；点击主体 = 复制回系统剪贴板
 * - 底部：收藏夹切换（需求2）、清空（带确认，只删未收藏，需求3）、容量设置（需求4）
 * - 时间戳显示（需求4）；多数据类型：色号/富文本/图片/文件路径（需求5）
 */
const ClipboardView: FC = () => {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const copiedTimer = useRef(0)

  useEffect(() => {
    void window.api.clipboard.getHistory().then(setItems)
    return window.api.clipboard.onUpdate(setItems)
  }, [])

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const kw = keyword.trim().toLowerCase()
  const visible = useMemo(
    () => items.filter((i) => (!favOnly || i.fav) && matchKeyword(i, kw)),
    [items, kw, favOnly]
  )
  const favCount = items.filter((i) => i.fav).length
  const pinnedCount = items.filter((i) => i.pinned).length

  const onCopy = (item: ClipboardItem): void => {
    void window.api.clipboard.copyItem(item.id)
    setCopiedId(item.id)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopiedId(''), 1200)
  }

  const onClear = (): void => {
    void window.api.clipboard.clearUnfav()
    setConfirmClear(false)
  }

  return (
    <div className="clip">
      <div className="clip-search">
        <Search size={13} />
        <input
          type="text"
          placeholder="搜索历史……"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="clip-list">
        {visible.length === 0 ? (
          <div className="clip-empty">
            <ClipboardIcon size={22} />
            <div>{items.length === 0 ? '按 Ctrl+C 复制内容后' : favOnly ? '还没有收藏的内容' : '没有匹配的记录'}</div>
            <div className="clip-empty-sub">
              {items.length === 0 ? '自动出现在这里' : favOnly ? '点击条目上的 ★ 收藏' : '换个关键词试试'}
            </div>
          </div>
        ) : (
          visible.map((item) => (
            <div key={item.id} className="clip-item" onClick={() => onCopy(item)}>
              <span className="clip-item-icon">{TYPE_ICON[item.type]}</span>
              <span className="clip-item-body">
                <ItemBody item={item} />
              </span>
              <span className="clip-item-time">{fmtTime(item.ts)}</span>
              <span className="clip-item-acts">
                <button
                  type="button"
                  title={item.fav ? '取消收藏' : '收藏（不会被清空删除）'}
                  className={item.fav ? 'active' : ''}
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.api.clipboard.setFav(item.id, !item.fav)
                  }}>
                  {item.fav ? <Star size={12} /> : <StarOff size={12} />}
                </button>
                <button
                  type="button"
                  title={item.pinned ? '取消固定' : '固定（不随淘汰清理）'}
                  className={item.pinned ? 'active' : ''}
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.api.clipboard.setPinned(item.id, !item.pinned)
                  }}>
                  {item.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                </button>
                <button
                  type="button"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.api.clipboard.deleteItem(item.id)
                  }}>
                  <Trash2 size={12} />
                </button>
              </span>
              {copiedId === item.id && <span className="clip-copied">已复制</span>}
            </div>
          ))
        )}
      </div>

      <div className="clip-footer">
        <span>
          共 {items.length} 条{` · ★${favCount}`}{pinnedCount > 0 ? ` · 钉${pinnedCount}` : ''}
        </span>
        <span className="clip-footer-actions">
          <button
            type="button"
            title={favOnly ? '显示全部' : '只看收藏'}
            className="clip-opt"
            onClick={() => setFavOnly(!favOnly)}>
            {favOnly ? <Star size={12} /> : <Eye size={12} />}
            {favOnly ? '全部' : '收藏夹'}
          </button>
          <button type="button" title="历史容量设置（条数/天数）" className="clip-opt" onClick={() => setShowSettings(true)}>
            <Settings2 size={12} />
            上限
          </button>
          <button type="button" className="clip-opt clip-clear" onClick={() => setConfirmClear(true)}>
            <Trash2 size={12} />
            清空
          </button>
        </span>
      </div>

      {/* 需求3：清空确认（收藏的消息不会被删除） */}
      {confirmClear && (
        <div className="clip-modal">
          <div className="clip-modal-card">
            <div className="clip-modal-title">确认清空？</div>
            <div className="clip-modal-text">
              将删除所有<b>未收藏</b>的消息（含已固定的）。
              <br />
              ★ 收藏的消息<b>不会</b>被删除。
            </div>
            <div className="clip-modal-acts">
              <button type="button" className="clip-btn" onClick={() => setConfirmClear(false)}>
                取消
              </button>
              <button type="button" className="clip-btn clip-btn-danger" onClick={onClear}>
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 需求4：容量设置（条数 + 天数双上限，防数据库无限膨胀） */}
      {showSettings && <ClipLimitsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

/** 容量设置小面板（读当前 limits，保存即生效） */
const ClipLimitsPanel: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [maxItems, setMaxItems] = useState('500')
  const [maxDays, setMaxDays] = useState('30')
  useEffect(() => {
    void window.api.clipboard.getLimits().then((l: ClipboardLimits) => {
      setMaxItems(String(l.maxItems))
      setMaxDays(String(l.maxDays))
    })
  }, [])

  const save = (): void => {
    void window.api.clipboard.setLimits(Number(maxItems), Number(maxDays))
    onClose()
  }

  return (
    <div className="clip-modal">
      <div className="clip-modal-card">
        <div className="clip-modal-title">
          容量设置
          <X size={14} className="clip-modal-close" onClick={onClose} />
        </div>
        <div className="clip-limits-row">
          <label>
            保留条数
            <input type="number" min={1} value={maxItems} onChange={(e) => setMaxItems(e.target.value)} />
          </label>
          <label>
            保留天数
            <input type="number" min={1} value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
          </label>
        </div>
        <div className="clip-modal-text">收藏的消息永不清理，不受此限制。</div>
        <div className="clip-modal-acts">
          <button type="button" className="clip-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="clip-btn" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default ClipboardView