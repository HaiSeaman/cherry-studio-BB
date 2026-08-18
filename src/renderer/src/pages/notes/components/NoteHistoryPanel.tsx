import { Lock, Unlock } from 'lucide-react'
import { type FC } from 'react'
import styled from 'styled-components'

import type { HubNoteSnapshot } from '../types'
import { formatDateTime } from '../services/schedule'
import { mx, MXDialog } from './mx'

interface NoteHistoryPanelProps {
  open: boolean
  snapshots: HubNoteSnapshot[]
  onClose: () => void
  onRestore: (content: string) => void
  onToggleLock: (snapshot: HubNoteSnapshot) => void
}

/** 便签历史版本（后悔药）：未锁定时间倒序在上，锁定组沉底；点击恢复内容 */
const NoteHistoryPanel: FC<NoteHistoryPanelProps> = ({ open, snapshots, onClose, onRestore, onToggleLock }) => {
  const unlocked = snapshots.filter((s) => s.locked !== 1).sort((a, b) => b.ts - a.ts)
  const locked = snapshots.filter((s) => s.locked === 1).sort((a, b) => b.ts - a.ts)

  const fmtTime = (t: number) => formatDateTime(t, true)

  const renderRow = (s: HubNoteSnapshot) => (
    <Row key={s.id}>
      <Preview>{s.content.slice(0, 120) || '（空）'}</Preview>
      <Meta>
        <Time>{fmtTime(s.ts)}</Time>
        <RowBtns>
          <Action onClick={() => onRestore(s.content)}>恢复</Action>
          <Action title={s.locked === 1 ? '解除锁定' : '锁定此版本'} onClick={() => onToggleLock(s)}>
            {s.locked === 1 ? <Unlock size={12} /> : <Lock size={12} />}
            {s.locked === 1 ? '解锁' : '锁定'}
          </Action>
        </RowBtns>
      </Meta>
    </Row>
  )

  return (
    <MXDialog
      open={open}
      title="历史版本（后悔药）"
      okText="关闭"
      okDisabled
      cancelText="关闭"
      onCancel={onClose}
      onOk={onClose}>
      {snapshots.length === 0 ? (
        <Empty>还没有历史版本，编辑后自动保存快照</Empty>
      ) : (
        <List>
          {unlocked.map(renderRow)}
          {locked.length > 0 && <GroupTitle>🔒 已锁定（不受 50 条上限限制）</GroupTitle>}
          {locked.map(renderRow)}
        </List>
      )}
    </MXDialog>
  )
}

const Empty = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
  font-size: 12px;
  color: ${mx.text3};
`

const List = styled.div`
  max-height: 340px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
`

const GroupTitle = styled.div`
  font-size: 11px;
  color: ${mx.text3};
  padding: 6px 2px 2px;
`

const Row = styled.div`
  border: 1px solid ${mx.border};
  border-radius: 10px;
  padding: 8px 10px;
  background: ${mx.soft2};
`

const Preview = styled.div`
  font-size: 12px;
  color: ${mx.text};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
`

const Meta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
`

const Time = styled.span`
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: ${mx.text3};
`

const RowBtns = styled.div`
  display: flex;
  gap: 6px;
`

const Action = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 11px;
  background: none;
  color: ${mx.text2};
  cursor: pointer;
  &:hover {
    background: ${mx.soft};
    color: ${mx.accent};
  }
`

export default NoteHistoryPanel
