import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, CheckSquare, Plus, Trash2 } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import styled from 'styled-components'

import { toISODate } from '../services/calendarUtils'
import type { HubTodo } from '../types'
import FolderModal from './FolderModal'
import {
  CountChip,
  EmptyText as Empty,
  HeaderBtns,
  IconBtn,
  MiniActionBtn as MiniBtn,
  mx,
  PanelHeader as Header,
  PanelTitle as Title,
  ScrollList as List,
  TitleIcon
} from './mx'

/** 左下卡片：待办事项（与便签/日历当日待办完全独立） */
const TodoPanel: FC = () => {
  const todos = useLiveQuery(async () => (await db.hub_todos.where('status').equals('active').toArray()) ?? [], [], [])
  const archived = useLiveQuery(
    async () => (await db.hub_todos.where('status').equals('archived').toArray()) ?? [],
    [],
    []
  )
  const trashed = useLiveQuery(
    async () => (await db.hub_todos.where('status').equals('trashed').toArray()) ?? [],
    [],
    []
  )

  const [input, setInput] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)

  // 未完成在前、已完成在后；同状态按创建时间倒序
  const sorted = useMemo(
    () =>
      (todos ?? []).slice().sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        return b.createdAt - a.createdAt
      }),
    [todos]
  )
  const undone = sorted.filter((t) => !t.done).length

  const bumpActivity = async () => {
    const date = toISODate(new Date())
    await db.transaction('rw', db.hub_activity, async () => {
      const row = await db.hub_activity.get(date)
      if (row) await db.hub_activity.update(date, { todo: row.todo + 1 })
      else await db.hub_activity.add({ date, note: 0, todo: 1 })
    })
  }

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
    if (done && !t.done) await bumpActivity() // 仅 未完成→完成 计入热力图
  }

  const archiveTodo = async (t: HubTodo) => {
    if (t.id == null) return
    await db.hub_todos.update(t.id, { status: 'archived', archivedAt: Date.now() })
  }

  /** 删除 → 移入垃圾桶（可还原/永久删除），与便签一致 */
  const trashTodo = async (t: HubTodo) => {
    if (t.id == null) return
    await db.hub_todos.update(t.id, { status: 'trashed', trashedAt: Date.now() })
  }

  const previewText = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 60)
  const fmtTime = (t: number) => {
    const d = new Date(t)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const archiveItems = (archived ?? []).slice().sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
  const trashItems = (trashed ?? []).slice().sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))

  return (
    <Panel data-no-dnd>
      <Header>
        <Title>
          <TitleIcon>
            <CheckSquare size={15} />
          </TitleIcon>
          待办事项
          <CountChip>{undone} 项待完成</CountChip>
        </Title>
        <HeaderBtns>
          <IconBtn title="待办归档文件夹" onClick={() => setArchiveOpen(true)}>
            <Archive size={14} />
          </IconBtn>
          <IconBtn title="垃圾桶（可还原/永久删除）" onClick={() => setTrashOpen(true)}>
            <Trash2 size={14} />
          </IconBtn>
        </HeaderBtns>
      </Header>
      <List>
        {sorted.length === 0 ? (
          <Empty>还没有待办，在下方输入框添加一条</Empty>
        ) : (
          sorted.map((t) => (
            <Row key={t.id}>
              <Check
                className={t.done ? 'checked' : ''}
                onClick={() => void toggleTodo(t)}
                role="checkbox"
                aria-checked={t.done}>
                {t.done && <span>✓</span>}
              </Check>
              <Info>
                <Text className={t.done ? 'done' : ''}>{t.text}</Text>
                <Time>{t.done && t.completedAt ? `完成于 ${fmtTime(t.completedAt)}` : fmtTime(t.createdAt)}</Time>
              </Info>
              <RowActions>
                <MiniBtn title="归档" onClick={() => void archiveTodo(t)}>
                  📦
                </MiniBtn>
                <MiniBtn $danger title="移入垃圾桶" onClick={() => void trashTodo(t)}>
                  <Trash2 size={12} />
                </MiniBtn>
              </RowActions>
            </Row>
          ))
        )}
      </List>
      <InputBar>
        <input
          placeholder="添加待办事项，回车确认…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 中文输入法组词确认的 Enter 不新增待办
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void addTodo()
          }}
        />
        <AddBtn onClick={() => void addTodo()} disabled={!input.trim()}>
          <Plus size={15} />
        </AddBtn>
      </InputBar>

      <FolderModal
        open={archiveOpen}
        title="待办归档文件夹"
        emptyHint="归档的待办会出现在这里"
        items={archiveItems.map((t) => ({
          id: t.id!,
          preview: previewText(t.text),
          time: t.archivedAt ?? t.updatedAt
        }))}
        onClose={() => setArchiveOpen(false)}
        onRestore={(id) => void db.hub_todos.update(id, { status: 'active', archivedAt: undefined })}
        onDelete={(id) => void db.hub_todos.delete(id)}
        onClearAll={() => void db.hub_todos.where('status').equals('archived').delete()}
      />
      <FolderModal
        open={trashOpen}
        title="待办垃圾桶"
        emptyHint="垃圾桶是空的"
        items={trashItems.map((t) => ({ id: t.id!, preview: previewText(t.text), time: t.trashedAt ?? t.updatedAt }))}
        onClose={() => setTrashOpen(false)}
        onRestore={(id) => void db.hub_todos.update(id, { status: 'active', trashedAt: undefined })}
        onDelete={(id) => void db.hub_todos.delete(id)}
        onClearAll={() => void db.hub_todos.where('status').equals('trashed').delete()}
      />
    </Panel>
  )
}

const Panel = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 14px;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  box-shadow: ${mx.shadow};
  overflow: hidden;
`

const Row = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 52px 7px 6px;
  border-radius: 10px;
  &:hover {
    background: ${mx.soft};
  }
`

const Check = styled.button`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid ${mx.border};
  background: ${mx.card};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.18s ease;
  span {
    color: #fff;
    font-size: 11px;
    line-height: 1;
  }
  &:hover {
    border-color: ${mx.accent};
  }
  &.checked {
    border-color: ${mx.accent};
    background: ${mx.gradient};
  }
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const Text = styled.div`
  font-size: 12.5px;
  color: ${mx.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &.done {
    text-decoration: line-through;
    color: ${mx.text3};
  }
`

const Time = styled.div`
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: ${mx.text3};
  margin-top: 1px;
`

const RowActions = styled.div`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  ${Row}:hover & {
    opacity: 1;
  }
`

const InputBar = styled.div`
  display: flex;
  gap: 8px;
  input {
    flex: 1;
    min-width: 0;
    border: 1px solid ${mx.border};
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 12.5px;
    color: ${mx.text};
    background: ${mx.soft2};
    outline: none;
    &:focus {
      border-color: ${mx.accent};
      box-shadow: 0 0 0 3px ${mx.accentSoft};
      background: ${mx.card};
    }
    &::placeholder {
      color: ${mx.text3};
    }
  }
`

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  color: #fff;
  background: ${mx.gradient};
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.18s ease;
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 40%, transparent);
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
    transform: none;
    box-shadow: none;
  }
`

export default TodoPanel
