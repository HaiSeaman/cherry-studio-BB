import { db } from '@renderer/databases'
import DOMPurify from 'dompurify'
import { Eye, History, ImagePlus, Pencil } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import styled from 'styled-components'

import { toISODate } from '../services/calendarUtils'
import { exportNoteImage } from '../services/exportImage'
import type { HubNote, HubNoteSnapshot } from '../types'
import { mx } from './mx'
import NoteHistoryPanel from './NoteHistoryPanel'

const AUTOSAVE_DELAY = 500
const SNAPSHOT_MIN_INTERVAL = 60_000
const SNAPSHOT_MAX_UNLOCKED = 50

interface NoteEditorProps {
  note: HubNote | null
  /** 切换/删除便签时通知父组件保存上一条（父组件持有 currentNoteId 变化前的落盘职责） */
  onContentChange: (noteId: number, content: string) => void
}

/** 便签编辑器：500ms 防抖自动保存 + 活跃度埋点 + 历史快照 + Markdown 预览 + 一键转长图 */
const NoteEditor: FC<NoteEditorProps> = ({ note, onContentChange }) => {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<HubNoteSnapshot[]>([])
  const [flash, setFlash] = useState<'' | 'ok' | 'fail'>('')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteIdRef = useRef<number | null>(null)
  const textRef = useRef('')
  const lastSnapshotRef = useRef<{ ts: number; content: string }>({ ts: 0, content: '' })
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doFlash = (state: 'ok' | 'fail') => {
    setFlash(state)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 1200)
  }

  // 切换便签：载入内容（父组件保证切换前已落盘上一条）
  useEffect(() => {
    const noteId = note?.id ?? null
    setText(note?.content ?? '')
    textRef.current = note?.content ?? ''
    noteIdRef.current = noteId
    if (noteId != null) {
      void db.hub_note_history
        .where('noteId')
        .equals(noteId)
        .toArray()
        .then((list) => {
          // 查询期间又切走了便签 → 丢弃过期结果，避免覆盖新便签的快照状态
          if (noteIdRef.current !== noteId) return
          const latest = list.filter((s) => s.locked !== 1).sort((a, b) => b.ts - a.ts)[0]
          lastSnapshotRef.current = latest ? { ts: latest.ts, content: latest.content } : { ts: 0, content: '' }
        })
    }
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const bumpActivity = useCallback(async () => {
    const date = toISODate(new Date())
    await db.transaction('rw', db.hub_activity, async () => {
      const row = await db.hub_activity.get(date)
      if (row) await db.hub_activity.update(date, { note: row.note + 1 })
      else await db.hub_activity.add({ date, note: 1, todo: 0 })
    })
  }, [])

  const takeSnapshot = useCallback(async (noteId: number, content: string) => {
    const last = lastSnapshotRef.current
    if (last.ts && Date.now() - last.ts < SNAPSHOT_MIN_INTERVAL) return
    if (last.content === content) return
    await db.hub_note_history.add({ noteId, content, ts: Date.now(), locked: 0 })
    lastSnapshotRef.current = { ts: Date.now(), content }
    // 未锁定超上限 → 删最旧
    const unlocked = (await db.hub_note_history.where('noteId').equals(noteId).toArray())
      .filter((s) => s.locked !== 1)
      .sort((a, b) => a.ts - b.ts)
    if (unlocked.length > SNAPSHOT_MAX_UNLOCKED) {
      const extra = unlocked.slice(0, unlocked.length - SNAPSHOT_MAX_UNLOCKED)
      await db.hub_note_history.bulkDelete(extra.map((s) => s.id!))
    }
  }, [])

  // 卸载前落盘未保存内容（textRef 镜像最新输入，避免闭包捕获挂载时的空值）
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const id = noteIdRef.current
      if (id != null && textRef.current)
        void db.hub_notes.update(id, { content: textRef.current, updatedAt: Date.now() })
    }
  }, [])

  const handleInput = (value: string) => {
    setText(value)
    textRef.current = value
    // 同步通知父组件最新内容：切换便签时 switchNote 用其兜底落盘
    // （仅防抖保存完成后才更新的话，500ms 窗口内切走会丢最后一次输入）
    if (noteIdRef.current != null) onContentChange(noteIdRef.current, value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // 捕获调度时的便签 id：防抖期间切换便签，避免旧内容写入新便签
    const scheduledId = noteIdRef.current
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null
      if (scheduledId == null) return
      await db.hub_notes.update(scheduledId, { content: value, updatedAt: Date.now() })
      onContentChange(scheduledId, value)
      await bumpActivity()
      await takeSnapshot(scheduledId, value)
    }, AUTOSAVE_DELAY)
  }

  const openHistory = async () => {
    if (note?.id == null) return
    setSnapshots(await db.hub_note_history.where('noteId').equals(note.id).toArray())
    setHistoryOpen(true)
  }

  const toggleLock = async (s: HubNoteSnapshot) => {
    if (s.id == null) return
    await db.hub_note_history.update(s.id, { locked: s.locked === 1 ? 0 : 1 })
    if (note?.id != null) setSnapshots(await db.hub_note_history.where('noteId').equals(note.id).toArray())
  }

  const restore = (content: string) => {
    handleInput(content)
    setHistoryOpen(false)
  }

  const doExport = async () => {
    const ok = await exportNoteImage(text)
    doFlash(ok ? 'ok' : 'fail')
  }

  const sanitized = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'span',
      'div',
      'b',
      'i',
      's',
      'sub',
      'sup',
      'mark'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'target', 'rel'],
    ALLOW_DATA_ATTR: false
  })

  return (
    <Wrap>
      <LabelRow>
        <Label>便签内容</Label>
        <Tools>
          <ToolBtn className={flash} title="历史版本（后悔药）" onClick={() => void openHistory()}>
            <History size={13} />
          </ToolBtn>
          <ToolBtn className={flash} title="一键转长图（复制到剪贴板）" onClick={() => void doExport()}>
            <ImagePlus size={13} />
          </ToolBtn>
          <ToolBtn
            $active={preview}
            title={preview ? '返回编辑' : 'Markdown 预览'}
            onClick={() => setPreview(!preview)}>
            {preview ? <Pencil size={13} /> : <Eye size={13} />}
          </ToolBtn>
        </Tools>
      </LabelRow>
      {preview ? (
        <PreviewWrap>
          <ReactMarkdown
            components={{
              a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />
            }}>
            {sanitized}
          </ReactMarkdown>
        </PreviewWrap>
      ) : (
        <Textarea
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="在此输入便签内容…（支持 Markdown，切换右上「预览」查看）"
          spellCheck={false}
        />
      )}
      <NoteHistoryPanel
        open={historyOpen}
        snapshots={snapshots}
        onClose={() => setHistoryOpen(false)}
        onRestore={restore}
        onToggleLock={(s) => void toggleLock(s)}
      />
    </Wrap>
  )
}

const Wrap = styled.div`
  flex: 6;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const Label = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${mx.text2};
`

const Tools = styled.div`
  display: flex;
  gap: 4px;
`

const ToolBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid ${(p) => (p.$active ? mx.accent : mx.border)};
  border-radius: 8px;
  background: ${(p) => (p.$active ? mx.accentSoft : mx.card)};
  color: ${(p) => (p.$active ? mx.accent : mx.text2)};
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover {
    border-color: ${mx.accent};
    color: ${mx.accent};
  }
  &.ok {
    border-color: ${mx.accent};
    background: ${mx.accentSoft};
    color: ${mx.accent};
  }
  &.fail {
    border-color: ${mx.danger};
    color: ${mx.danger};
  }
`

const Textarea = styled.textarea`
  flex: 1;
  min-height: 0;
  resize: none;
  border: 1px solid ${mx.border};
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: ${mx.text};
  background: ${mx.soft2};
  outline: none;
  font-family: inherit;
  &:focus {
    border-color: ${mx.accent};
    box-shadow: 0 0 0 3px ${mx.accentSoft};
    background: ${mx.card};
  }
  &::placeholder {
    color: ${mx.text3};
  }
`

const PreviewWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid ${mx.border};
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.7;
  color: ${mx.text};
  background: ${mx.soft2};
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
  h1, h2, h3, h4 {
    margin: 0.6em 0 0.3em;
  }
  p {
    margin: 0.4em 0;
  }
  pre {
    background: ${mx.card};
    border: 1px solid ${mx.border};
    border-radius: 8px;
    padding: 10px;
    overflow-x: auto;
  }
  code {
    background: ${mx.card};
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 12px;
  }
  blockquote {
    border-left: 3px solid ${mx.accent2};
    margin: 0.5em 0;
    padding: 2px 12px;
    color: ${mx.text2};
  }
  table {
    border-collapse: collapse;
    th, td {
      border: 1px solid ${mx.border};
      padding: 4px 10px;
      font-size: 12px;
    }
  }
  img {
    max-width: 100%;
    border-radius: 8px;
  }
  a {
    color: ${mx.accent};
  }
`

export default NoteEditor
