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
const thumbUrl = (p: string): string => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23')

const fileBaseName = (p: string): string => p.split(/[\\/]/).pop() || p

/** HTML → 纯文本预览（轻量正则，与主进程 stripHtmlText 同构） */
const htmlPreview = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** HTML → 可读纯文本（详情用）：保留换行/段落/列表结构，便于完整阅读与选中复制 */
const htmlToText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

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
  if (item.type === 'html')
    return htmlPreview(item.html ?? '')
      .toLowerCase()
      .includes(kw)
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

const TYPE_NAME: Record<string, string> = {
  text: '文本',
  color: '色号',
  html: '富文本',
  rtf: 'RTF 富文本',
  image: '图片',
  files: '文件'
}

/**
 * 双击详情：小窗口显示条目的完整内容，文字可选中复制。
 * 按数据类型分别展示：文本/色号全文、富文本纯文本全文、图片原图、文件路径列表。
 */
const DetailBody: FC<{ item: ClipboardItem }> = ({ item }) => {
  switch (item.type) {
    case 'text':
    case 'color':
      return <div className="clip-detail-text">{item.text}</div>
    case 'html': {
      const preview = htmlToText(item.html ?? '')
      return <div className="clip-detail-text">{preview || '富文本（无文字内容）'}</div>
    }
    case 'rtf':
      return (
        <div className="clip-detail-text clip-detail-hint">
          该条目为 RTF 富文本格式，暂不支持直接预览，请点击列表项进行复制。
        </div>
      )
    case 'image': {
      // 优先展示原件（完整保留），原件缺失时回退缩略图
      const src = item.imageFile && item.imageFile !== '' ? item.imageFile : item.thumbPath
      return src ? (
        <img className="clip-detail-image" src={thumbUrl(src)} alt="剪贴板图片" draggable={false} />
      ) : (
        <div className="clip-detail-text clip-detail-hint">图片文件缺失，无法预览。</div>
      )
    }
    case 'files':
      return (
        <div className="clip-detail-text">
          {(item.paths ?? []).map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )
    default:
      return null
  }
}

/**
 * 剪贴板历史视图（桌面挂件第 5 视图）：无 TAB 无详情页，纯展示层。
 * - 每条：收藏★（固定键左侧）/ 固定钉 / 删除；单击主体 = 复制回系统剪贴板
 * - 双击主体 = 弹出小窗显示完整内容（可选中复制）
 * - 底部：收藏夹切换（需求2）、清空（带确认，只删未收藏且未固定，需求3）、容量设置（需求4）
 * - 时间戳显示（需求4）；多数据类型：色号/富文本/图片/文件路径（需求5）
 */
const ClipboardView: FC = () => {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [detail, setDetail] = useState<ClipboardItem | null>(null)
  const copiedTimer = useRef(0)
  // 单击复制延迟执行：双击时在此窗口期内取消复制，避免"只想看详情却被覆盖剪贴板"
  const pendingCopyRef = useRef(0)
  const lastCopyRef = useRef(0)
  const lastCopyIdRef = useRef('')

  useEffect(() => {
    void window.api.clipboard.getHistory().then(setItems)
    return window.api.clipboard.onUpdate(setItems)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(copiedTimer.current)
      window.clearTimeout(pendingCopyRef.current)
    },
    []
  )

  const kw = keyword.trim().toLowerCase()
  const visible = useMemo(() => items.filter((i) => (!favOnly || i.fav) && matchKeyword(i, kw)), [items, kw, favOnly])
  const favCount = items.filter((i) => i.fav).length
  const pinnedCount = items.filter((i) => i.pinned).length

  const doCopy = (item: ClipboardItem): void => {
    void window.api.clipboard.copyItem(item.id)
    setCopiedId(item.id)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopiedId(''), 1200)
  }

  const onCopy = (item: ClipboardItem): void => {
    // 单击先延迟 300ms 执行：若此期间触发双击，pendingCopy 会被取消，不再写系统剪贴板。
    // （双击会先触发两次单击：同一窗口期内只保留一个待执行复制）
    const now = Date.now()
    if (now - lastCopyRef.current < 300 && lastCopyIdRef.current === item.id) return
    lastCopyRef.current = now
    lastCopyIdRef.current = item.id
    window.clearTimeout(pendingCopyRef.current)
    pendingCopyRef.current = window.setTimeout(() => doCopy(item), 300)
  }

  const onDoubleClickItem = (item: ClipboardItem): void => {
    // 双击 = 查看详情而非复制：取消未执行的单击复制
    window.clearTimeout(pendingCopyRef.current)
    setDetail(item)
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
            <div
              key={item.id}
              className="clip-item"
              onClick={() => onCopy(item)}
              onDoubleClick={() => onDoubleClickItem(item)}>
              <span className="clip-item-icon">{TYPE_ICON[item.type]}</span>
              <span className="clip-item-body">
                <ItemBody item={item} />
              </span>
              <span className="clip-item-time">{fmtTime(item.ts)}</span>
              <span className="clip-item-acts">
                <button
                  type="button"
                  title={item.fav ? '取消收藏' : '收藏（永不清理）'}
                  className={item.fav ? 'active' : ''}
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.api.clipboard.setFav(item.id, !item.fav)
                  }}>
                  {item.fav ? <Star size={12} /> : <StarOff size={12} />}
                </button>
                <button
                  type="button"
                  title={item.pinned ? '取消固定' : '固定（永不清理）'}
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
          共 {items.length} 条{` · ★${favCount}`}
          {pinnedCount > 0 ? ` · 钉${pinnedCount}` : ''}
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
          <button
            type="button"
            title="历史容量设置（条数/天数）"
            className="clip-opt"
            onClick={() => setShowSettings(true)}>
            <Settings2 size={12} />
            上限
          </button>
          <button type="button" className="clip-opt clip-clear" onClick={() => setConfirmClear(true)}>
            <Trash2 size={12} />
            清空
          </button>
        </span>
      </div>

      {/* 需求3：清空确认（收藏与置顶的消息不会被删除） */}
      {confirmClear && (
        <div className="clip-modal">
          <div className="clip-modal-card">
            <div className="clip-modal-title">确认清空？</div>
            <div className="clip-modal-text">
              将删除所有<b>未收藏且未固定</b>的消息。
              <br />★ 收藏与<b>置顶</b>的消息<b>不会</b>被删除。
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

      {/* 双击详情：小窗口显示完整内容，文字可选中复制 */}
      {detail && (
        <div className="clip-modal" onClick={() => setDetail(null)}>
          <div className="clip-modal-card clip-detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="clip-modal-title">
              {TYPE_NAME[detail.type] ?? '剪贴板内容'}
              <span className="clip-detail-time">{fmtTime(detail.ts)}</span>
              <X size={14} className="clip-modal-close" onClick={() => setDetail(null)} />
            </div>
            <DetailBody item={detail} />
            <div className="clip-modal-acts">
              <button type="button" className="clip-btn clip-detail-copy" onClick={() => doCopy(detail)}>
                复制
              </button>
              <button type="button" className="clip-btn" onClick={() => setDetail(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
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
        <div className="clip-modal-text">收藏与置顶的消息永不清理，不受此限制。</div>
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
