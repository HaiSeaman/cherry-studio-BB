import { message, Modal } from 'antd'
import { Archive, ArchiveRestore, Download, Pencil, Trash2, Upload } from 'lucide-react'
import { type FC, useRef, useState } from 'react'
import styled from 'styled-components'

import { useActiveHabits, useArchivedHabits } from '../hooks/useHabits'
import { todayISO } from '../services/calendar'
import { deleteHabitForever, exportHabitsJson, importHabitsJson, setArchived } from '../services/habitService'
import type { Habit } from '../types'
import HabitForm from './HabitForm'
import { EmptyText, mx } from './mx'

/**
 * 习惯管理视图：编辑/归档（活跃）+ 恢复/彻底删除（已归档）+ JSON 导出导入
 */
const HabitManage: FC = () => {
  const active = useActiveHabits()
  const archived = useArchivedHabits()
  const [editing, setEditing] = useState<Habit | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Habit | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onArchive = (habit: Habit) => {
    void setArchived(habit.id, true)
    message.success(`已归档「${habit.name}」，历史数据保留`)
  }

  const onRestore = (habit: Habit) => {
    void setArchived(habit.id, false)
    message.success(`已恢复「${habit.name}」`)
  }

  const onDeleteForever = async () => {
    if (!pendingDelete) return
    await deleteHabitForever(pendingDelete.id)
    message.success(`已彻底删除「${pendingDelete.name}」及其全部记录`)
    setPendingDelete(null)
  }

  const onExport = async () => {
    const json = await exportHabitsJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `habit-backup-${todayISO().replace(/-/g, '')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const { habits, records } = await importHabitsJson(text)
      message.success(`导入完成：${habits} 个习惯、${records} 条记录（已替换现有打卡数据）`)
    } catch {
      message.error('导入失败：文件格式不正确')
    }
  }

  return (
    <Wrap>
      <SectionTitle>活跃习惯（{active.length}）</SectionTitle>
      {active.length === 0 ? (
        <EmptyText>暂无活跃习惯</EmptyText>
      ) : (
        <List>
          {active.map((h) => (
            <Item key={h.id}>
              <Dot $color={h.color} />
              <span className="emoji">{h.icon}</span>
              <span className="name">{h.name}</span>
              <Spacer />
              <IconBtn title="编辑" onClick={() => setEditing(h)}>
                <Pencil size={13} />
              </IconBtn>
              <IconBtn title="归档" onClick={() => onArchive(h)}>
                <Archive size={13} />
              </IconBtn>
            </Item>
          ))}
        </List>
      )}

      <SectionTitle>已归档（{archived.length}）</SectionTitle>
      {archived.length === 0 ? (
        <EmptyText>暂无归档习惯</EmptyText>
      ) : (
        <List>
          {archived.map((h) => (
            <Item key={h.id}>
              <Dot $color={mx.border} />
              <span className="emoji">{h.icon}</span>
              <span className="name dim">{h.name}</span>
              <Spacer />
              <IconBtn title="恢复" onClick={() => onRestore(h)}>
                <ArchiveRestore size={13} />
              </IconBtn>
              <IconBtn $danger title="彻底删除（连带全部记录）" onClick={() => setPendingDelete(h)}>
                <Trash2 size={13} />
              </IconBtn>
            </Item>
          ))}
        </List>
      )}

      <SectionTitle>数据备份（JSON，可跨设备迁移打卡数据）</SectionTitle>
      <BackupRow>
        <button type="button" className="backup-btn" onClick={() => void onExport()}>
          <Download size={13} /> 导出 JSON
        </button>
        <button type="button" className="backup-btn" onClick={() => fileRef.current?.click()}>
          <Upload size={13} /> 导入 JSON（替换现有数据）
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onImportFile(f)
            e.target.value = ''
          }}
        />
      </BackupRow>

      <HabitForm open={editing !== null} editing={editing} onClose={() => setEditing(null)} />

      <Modal
        open={pendingDelete !== null}
        title="彻底删除习惯？"
        okText="删除"
        okType="danger"
        cancelText="取消"
        onOk={() => void onDeleteForever()}
        onCancel={() => setPendingDelete(null)}>
        <p>
          将永久删除「{pendingDelete?.name}」及其<b>全部打卡历史</b>，此操作不可撤销。
          如只想从主界面隐藏，请用「归档」。
        </p>
      </Modal>
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 640px;
`

const SectionTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: ${mx.text3};
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 13px;
  color: ${mx.text};
  .emoji {
    font-size: 16px;
  }
  .name {
    font-weight: 500;
  }
  .name.dim {
    color: ${mx.text3};
  }
`

const Dot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p) => p.$color};
`

const Spacer = styled.div`
  flex: 1;
`

const IconBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid ${mx.border};
  background: transparent;
  color: ${(p) => (p.$danger ? mx.danger : mx.text2)};
  cursor: pointer;
  &:hover {
    border-color: ${(p) => (p.$danger ? mx.danger : mx.accent)};
    color: ${(p) => (p.$danger ? mx.danger : mx.accent)};
  }
`

const BackupRow = styled.div`
  display: flex;
  gap: 10px;
  .backup-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    border: 1px solid ${mx.border};
    background: ${mx.card};
    color: ${mx.text};
    font-size: 12.5px;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    &:hover {
      color: ${mx.accent};
      border-color: ${mx.accent};
    }
  }
`

export default HabitManage
