import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, FileText, Plus, Search, Trash2 } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import type { HubNote } from '../types'
import FolderModal from './FolderModal'
import { mx } from './mx'
import NoteEditor from './NoteEditor'

/** 左上卡片：便签列表（搜索/新建/归档/垃圾桶）+ 编辑器 */
const NotesPanel: FC = () => {
  const notes = useLiveQuery(async () => (await db.hub_notes.where('status').equals('active').toArray()) ?? [], [], [])
  const archived = useLiveQuery(async () => (await db.hub_notes.where('status').equals('archived').toArray()) ?? [], [], [])
  const trashed = useLiveQuery(async () => (await db.hub_notes.where('status').equals('trashed').toArray()) ?? [], [], [])
  const active = useMemo(() => (notes ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt), [notes])

  const [currentId, setCurrentId] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const creating = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 200)
    return () => clearTimeout(timer)
  }, [searchInput])

  // 无选中或选中已不在列表 → 自动选第一条；无便签自动新建一条
  useEffect(() => {
    if (active.length === 0) return
    if (currentId == null || !active.some((n) => n.id === currentId)) {
      setCurrentId(active[0].id ?? null)
    }
  }, [active, currentId])

  useEffect(() => {
    if ((notes ?? []).length === 0 && (archived ?? []).length === 0 && (trashed ?? []).length === 0 && !creating.current) {
      creating.current = true
      const now = Date.now()
      void db.hub_notes
        .add({ content: '', createdAt: now, updatedAt: now, status: 'active' })
        .finally(() => {
          creating.current = false
        })
    }
  }, [notes, archived, trashed])

  const filtered = useMemo(
    () => (searchQuery ? active.filter((n) => (n.content || '').toLowerCase().includes(searchQuery)) : active),
    [active, searchQuery]
  )

  const currentNote = currentId != null ? active.find((n) => n.id === currentId) ?? null : null

  // 切换便签前落盘上一条（NoteEditor 卸载副作用只处理组件卸载场景）
  const switchNote = useCallback(
    async (nextId: number | null, prev: HubNote | null, latestContent?: string) => {
      if (prev && prev.id != null && latestContent != null && latestContent !== prev.content) {
        await db.hub_notes.update(prev.id, { content: latestContent, updatedAt: Date.now() })
      }
      setCurrentId(nextId)
    },
    []
  )

  const createNote = async () => {
    if (creating.current) return
    creating.current = true
    try {
      const now = Date.now()
      const id = await db.hub_notes.add({ content: '', createdAt: now, updatedAt: now, status: 'active' })
      setCurrentId(Number(id))
    } finally {
      creating.current = false
    }
  }

  const archiveNote = async (n: HubNote) => {
    if (n.id == null) return
    await db.hub_notes.update(n.id, { status: 'archived', archivedAt: Date.now() })
    if (n.id === currentId) setCurrentId(null)
  }

  const trashNote = async (n: HubNote) => {
    if (n.id == null) return
    await db.hub_notes.update(n.id, { status: 'trashed', trashedAt: Date.now() })
    if (n.id === currentId) setCurrentId(null)
  }

  const previewText = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80) || '（空便签）'
  const fmtTime = (t: number) => {
    const d = new Date(t)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // 编辑器内容变化（防抖已落盘）→ 记住最新内容供切换时兜底
  const latestContentRef = useRef<{ id: number; content: string } | null>(null)
  const onContentChange = (id: number, content: string) => {
    latestContentRef.current = { id, content }
  }

  /** 切换前若该便签有未落盘内容（极端时序）则补写 */
  const pendingContentOf = (id: number): string | undefined => {
    const latest = latestContentRef.current
    return latest && latest.id === id ? latest.content : undefined
  }

  const archiveItems = (archived ?? []).slice().sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
  const trashItems = (trashed ?? []).slice().sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))

  return (
    <Panel data-no-dnd>
      <ListCol>
        <Header>
          <Title>
            <TitleIcon>
              <FileText size={15} />
            </TitleIcon>
            便签
            <CountChip>{active.length}</CountChip>
          </Title>
          <HeaderBtns>
            <IconBtn title="便签归档文件夹" onClick={() => setArchiveOpen(true)}>
              <Archive size={14} />
            </IconBtn>
            <IconBtn title="垃圾桶（可还原/永久删除）" onClick={() => setTrashOpen(true)}>
              <Trash2 size={14} />
            </IconBtn>
            <IconBtn $accent title="新建便签" onClick={() => void createNote()}>
              <Plus size={15} />
            </IconBtn>
          </HeaderBtns>
        </Header>
        <SearchBox>
          <Search size={13} />
          <input placeholder="搜索便签…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </SearchBox>
        <List>
          {filtered.length === 0 ? (
            <Empty>{active.length === 0 ? '还没有便签，点右上 ＋ 新建' : '没有匹配的便签'}</Empty>
          ) : (
            filtered.map((n) => (
              <Item key={n.id} className={n.id === currentId ? 'active' : ''} onClick={() => void switchNote(n.id ?? null, currentNote, n.id != null ? pendingContentOf(n.id) : undefined)}>
                <ItemTitle>{previewText(n.content)}</ItemTitle>
                <ItemTime>{fmtTime(n.createdAt)}</ItemTime>
                <ItemActions>
                  <MiniBtn title="归档" onClick={(e) => { e.stopPropagation(); void archiveNote(n) }}>📦</MiniBtn>
                  <MiniBtn $danger title="移入垃圾桶" onClick={(e) => { e.stopPropagation(); void trashNote(n) }}>✕</MiniBtn>
                </ItemActions>
              </Item>
            ))
          )}
        </List>
      </ListCol>
      <NoteEditor note={currentNote} onContentChange={onContentChange} />

      <FolderModal
        open={archiveOpen}
        title="便签归档文件夹"
        emptyHint="归档的便签会出现在这里"
        items={archiveItems.map((n) => ({ id: n.id!, preview: previewText(n.content), time: n.archivedAt ?? n.updatedAt }))}
        onClose={() => setArchiveOpen(false)}
        onRestore={(id) => void db.hub_notes.update(id, { status: 'active', archivedAt: undefined })}
        onDelete={(id) => void db.hub_notes.delete(id)}
        onClearAll={() => void db.hub_notes.where('status').equals('archived').delete()}
      />
      <FolderModal
        open={trashOpen}
        title="垃圾桶"
        emptyHint="垃圾桶是空的"
        items={trashItems.map((n) => ({ id: n.id!, preview: previewText(n.content), time: n.trashedAt ?? n.updatedAt }))}
        onClose={() => setTrashOpen(false)}
        onRestore={(id) => void db.hub_notes.update(id, { status: 'active', trashedAt: undefined })}
        onDelete={(id) => void db.hub_notes.delete(id)}
        onClearAll={() => void db.hub_notes.where('status').equals('trashed').delete()}
      />
    </Panel>
  )
}

const Panel = styled.div`
  grid-area: notes;
  display: flex;
  flex-direction: row;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 14px;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  box-shadow: ${mx.shadow};
  overflow: hidden;
`

const ListCol = styled.div`
  flex: 4;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-right: 1px solid ${mx.border};
  padding-right: 10px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: ${mx.text};
`

const TitleIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: ${mx.accentSoft};
  color: ${mx.accent};
`

const CountChip = styled.span`
  font-size: 10.5px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: ${mx.text3};
  background: ${mx.soft};
  border-radius: 999px;
  padding: 1px 7px;
`

const HeaderBtns = styled.div`
  display: flex;
  gap: 4px;
`

const IconBtn = styled.button<{ $accent?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border: 1px solid ${mx.border};
  border-radius: 8px;
  background: ${(p) => (p.$accent ? mx.gradient : mx.card)};
  color: ${(p) => (p.$accent ? '#fff' : mx.text2)};
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover {
    border-color: ${mx.accent};
    color: ${(p) => (p.$accent ? '#fff' : mx.accent)};
  }
`

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid ${mx.border};
  border-radius: 999px;
  padding: 5px 11px;
  color: ${mx.text3};
  background: ${mx.soft2};
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: ${mx.text};
    &::placeholder {
      color: ${mx.text3};
    }
  }
`

const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
`

const Empty = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 12px;
  color: ${mx.text3};
`

const Item = styled.div`
  position: relative;
  padding: 8px 52px 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover {
    background: ${mx.soft};
  }
  &.active {
    background: ${mx.accentSoft};
  }
`

const ItemTitle = styled.div`
  font-size: 12.5px;
  color: ${mx.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ItemTime = styled.div`
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: ${mx.text3};
  margin-top: 2px;
`

const ItemActions = styled.div`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  ${Item}:hover & {
    opacity: 1;
  }
`

const MiniBtn = styled.button<{ $danger?: boolean }>`
  border: none;
  background: none;
  color: ${mx.text3};
  font-size: 12px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  &:hover {
    background: ${(p) => (p.$danger ? 'rgba(239,83,80,0.1)' : mx.card)};
    color: ${(p) => (p.$danger ? mx.danger : mx.accent)};
  }
`

export default NotesPanel
