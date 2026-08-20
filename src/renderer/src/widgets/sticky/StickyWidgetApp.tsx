import { db } from '@renderer/databases'
import type { HubTodo } from '@renderer/pages/notes/types'
import { useLiveQuery } from 'dexie-react-hooks'
import { ExternalLink, Lock, Minus, Pin, PinOff, Plus, Trash2, Unlock, X } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'

/**
 * 挂件关闭前兜底：待保存草稿（NotesSection 输入时写入；关闭/卸载时据此落库）
 * 关闭挂件（✕/托盘/设置开关）时先落库再销毁窗口，避免丢失 500ms 防抖窗口内输入
 */
const pendingDraft: { id: number; content: string } = { id: 0, content: '' }

/** 立即把最新待保存草稿写入 Dexie（幂等；无待保存内容时直接返回） */
async function flushPendingDraft(): Promise<void> {
  if (pendingDraft.id) {
    const { id, content } = pendingDraft
    await db.hub_notes.update(id, { content, updatedAt: Date.now() }).catch(() => {})
  }
}

/**
 * 桌面便签待办挂件（轻量独立入口，无 antd/Redux/router）
 * 数据层与主程序共享同一 Dexie（IndexedDB），useLiveQuery 跨窗口实时双向同步。
 * 已移除贴边吸附/折叠，保留：置顶/锁定/拖拽/拉伸（原生能力）。
 */
const StickyWidgetApp: FC = () => {
  const [pinned, setPinned] = useState(true)
  const [locked, setLocked] = useState(false)

  // 页面将被卸载（窗口关闭/隐藏/刷新）：先落库待保存草稿，避免数据丢失
  useEffect(() => {
    const flush = () => {
      if (pendingDraft.id) void flushPendingDraft()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  return (
    <div className="app">
      <header className={`header ${locked ? 'locked' : ''}`}>
        <span className="title">便签待办</span>
        <div className="btns">
          <button
            type="button"
            title={pinned ? '取消置顶' : '置顶'}
            className={pinned ? 'active' : ''}
            onClick={() => {
              setPinned(!pinned)
              void window.api.stickyWidget.setPin(!pinned)
            }}>
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
          <button
            type="button"
            title={locked ? '解锁' : '锁定'}
            className={locked ? 'active' : ''}
            onClick={() => {
              setLocked(!locked)
              void window.api.stickyWidget.setLock(!locked)
            }}>
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button type="button" title="打开主程序" onClick={() => void window.api.stickyWidget.openMain()}>
            <ExternalLink size={13} />
          </button>
          <button type="button" title="最小化" onClick={() => void window.api.stickyWidget.toggle()}>
            <Minus size={14} />
          </button>
          <button
            type="button"
            title="关闭"
            className="close"
            onClick={() => {
              // 先落库未保存草稿，确保「速记后立即关闭」不丢字
              void flushPendingDraft().then(() => window.api.stickyWidget.close())
            }}>
            <X size={14} />
          </button>
        </div>
      </header>

      <main className="body">
        <NotesSection />
        <TodosSection />
      </main>
    </div>
  )
}

/** 上半区：随手便签（下拉切换 / 新建 / 删除 / 500ms 防抖自动保存） */
const NotesSection: FC = () => {
  const notes = useLiveQuery(async () => (await db.hub_notes.where('status').equals('active').toArray()) ?? [], [], [])
  const sorted = (notes ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt)

  const [noteId, setNoteId] = useState<number | null>(null)
  const current = sorted.find((n) => n.id === noteId) ?? sorted[0]

  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const knownContentRef = useRef<string | null>(null)
  const knownIdRef = useRef<number | null>(null)

  // 草稿同步：切换便签无条件重置；外部更新仅在无未保存草稿时跟随（避免光标跳动）
  useEffect(() => {
    const c = current?.content ?? ''
    if (current?.id !== knownIdRef.current) {
      setDraft(c)
      setDirty(false)
    } else if (!dirty && c !== knownContentRef.current) {
      setDraft(c)
    }
    knownContentRef.current = c
    knownIdRef.current = current?.id ?? null
  }, [current?.id, current?.content, dirty])

  // 500ms 防抖自动保存（与主程序 NoteEditor 同节奏）
  useEffect(() => {
    if (!dirty || current?.id == null) return
    const id = current.id
    pendingDraft.id = id
    pendingDraft.content = draft
    const t = window.setTimeout(() => {
      void db.hub_notes.update(id, { content: draft, updatedAt: Date.now() }).then(() => {
        setDirty(false)
        // 防抖落库成功后，若已是最新版本则清空待保存标记（避免关闭时误写旧草稿）
        if (pendingDraft.id === id && pendingDraft.content === draft) {
          pendingDraft.id = 0
        }
      })
    }, 500)
    return () => window.clearTimeout(t)
  }, [draft, dirty, current?.id])

  // 切换/新建前冲刷未保存草稿，避免丢失
  const saveNow = () => {
    if (dirty && current?.id != null) {
      const id = current.id
      pendingDraft.id = 0 // 切换目标立即落库，此后关闭兜底不再误写已切换的旧便签
      void db.hub_notes.update(id, { content: draft, updatedAt: Date.now() })
      setDirty(false)
    }
  }

  const addNote = async () => {
    saveNow()
    const now = Date.now()
    const id = await db.hub_notes.add({ content: '', createdAt: now, updatedAt: now, status: 'active' })
    setNoteId(id as number)
  }

  const removeNote = async () => {
    if (current?.id == null) return
    if (pendingDraft.id === current.id) pendingDraft.id = 0 // 删除的不是待保存便签时，清理避免关闭时写回
    await db.hub_notes.update(current.id, { status: 'trashed', trashedAt: Date.now() })
    setNoteId(null)
  }

  const preview = (s: string) => s.split('\n').find((l) => l.trim())?.trim().slice(0, 20) ?? ''

  return (
    <section className="notes">
      <div className="section-head">
        <select
          value={current?.id ?? ''}
          disabled={sorted.length === 0}
          onChange={(e) => {
            saveNow()
            setNoteId(Number(e.target.value))
          }}>
          {sorted.length === 0 && <option value="">暂无便签</option>}
          {sorted.map((n) => (
            <option key={n.id} value={n.id}>
              {preview(n.content) || '空白便签'}
            </option>
          ))}
        </select>
        <button type="button" className="tool-btn" title="新建便签" onClick={() => void addNote()}>
          <Plus size={14} />
        </button>
        <button type="button" className="tool-btn" title="删除当前便签" disabled={!current} onClick={() => void removeNote()}>
          <Trash2 size={13} />
        </button>
        <span className="save-hint">{dirty ? '保存中…' : '已保存'}</span>
      </div>
      <textarea
        value={draft}
        disabled={!current}
        placeholder={current ? '输入内容，自动保存…' : '点击 + 新建第一条便签'}
        onChange={(e) => {
          setDraft(e.target.value)
          setDirty(true)
        }}
      />
    </section>
  )
}

/** 下半区：待办清单（筛选 / 勾选 / 回车新增） */
const TodosSection: FC = () => {
  const todos = useLiveQuery(async () => (await db.hub_todos.where('status').equals('active').toArray()) ?? [], [], [])
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')
  const [input, setInput] = useState('')

  const sorted = (todos ?? []).slice().sort((a, b) =>
    a.done !== b.done ? (a.done ? 1 : -1) : b.createdAt - a.createdAt
  )
  const list = sorted.filter((t) => (filter === 'all' ? true : filter === 'active' ? !t.done : t.done))
  const undone = sorted.filter((t) => !t.done).length

  const addTodo = async () => {
    const text = input.trim()
    if (!text) return
    const now = Date.now()
    await db.hub_todos.add({ text, done: false, createdAt: now, updatedAt: now, status: 'active' })
    setInput('')
  }

  const toggleTodo = async (t: HubTodo) => {
    if (t.id == null) return
    const done = !t.done
    await db.hub_todos.update(t.id, {
      done,
      updatedAt: Date.now(),
      completedAt: done ? Date.now() : undefined
    })
    // 未完成→完成计入热力图（与主程序 TodoPanel 同步维护）
    if (done && !t.done) {
      const d = new Date()
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      await db.transaction('rw', db.hub_activity, async () => {
        const row = await db.hub_activity.get(date)
        if (row) await db.hub_activity.update(date, { todo: row.todo + 1 })
        else await db.hub_activity.add({ date, note: 0, todo: 1 })
      })
    }
  }

  return (
    <section className="todos">
      <div className="section-head">
        <div className="tabs">
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            全部
          </button>
          <button type="button" className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>
            进行中
          </button>
          <button type="button" className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>
            已完成
          </button>
        </div>
        <span className="count">{undone} 项待完成</span>
      </div>
      <div className="todo-list">
        {list.length === 0 ? (
          <div className="empty">没有{filter === 'done' ? '已完成' : filter === 'active' ? '进行中' : ''}待办</div>
        ) : (
          list.map((t) => (
            <div key={t.id} className="todo-row">
              <button
                type="button"
                className={`checkbox ${t.done ? 'checked' : ''}`}
                role="checkbox"
                aria-checked={t.done}
                onClick={() => void toggleTodo(t)}>
                {t.done && <span>✓</span>}
              </button>
              <span className={`todo-text ${t.done ? 'done' : ''}`}>{t.text}</span>
            </div>
          ))
        )}
      </div>
      <div className="input-bar">
        <input
          placeholder="添加待办，回车确认…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 中文输入法组词确认的 Enter 不新增待办
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void addTodo()
          }}
        />
      </div>
    </section>
  )
}

export default StickyWidgetApp
