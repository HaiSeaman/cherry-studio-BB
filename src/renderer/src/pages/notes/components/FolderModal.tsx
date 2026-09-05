import { Archive, RotateCcw, Search, Trash2 } from 'lucide-react'
import { type FC, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'

import { formatDateTime } from '../services/schedule'
import { mx, MXDialog } from './mx'

export interface FolderItem {
  id: number
  preview: string
  time: number
}

interface FolderModalProps {
  open: boolean
  title: string
  emptyHint: string
  items: FolderItem[]
  onClose: () => void
  onRestore: (id: number) => void
  onDelete: (id: number) => void
  /** 垃圾桶提供「清空全部」 */
  onClearAll?: () => void
}

/** 通用归档/垃圾桶文件夹弹窗：搜索（200ms 防抖）+ 逐条还原/永久删除 */
const FolderModal: FC<FolderModalProps> = ({
  open,
  title,
  emptyHint,
  items,
  onClose,
  onRestore,
  onDelete,
  onClearAll
}) => {
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 200)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!open) {
      setSearchInput('')
      setSearchQuery('')
      setConfirmClear(false)
      setDeletingId(null)
    }
  }, [open])

  const filtered = useMemo(
    () => (searchQuery ? items.filter((i) => i.preview.toLowerCase().includes(searchQuery)) : items),
    [items, searchQuery]
  )

  const fmtTime = (t: number) => formatDateTime(t)

  return (
    <MXDialog open={open} title={title} okText="关闭" cancelText="关闭" okDisabled onCancel={onClose} onOk={onClose}>
      <Toolbar>
        <SearchBox>
          <Search size={13} />
          <input placeholder="搜索…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </SearchBox>
        {onClearAll && items.length > 0 && (
          <ClearBtn
            onClick={() => {
              if (confirmClear) {
                onClearAll()
                setConfirmClear(false)
              } else {
                setConfirmClear(true)
              }
            }}>
            <Trash2 size={12} /> {confirmClear ? '确认清空全部？' : '清空全部'}
          </ClearBtn>
        )}
      </Toolbar>
      <List>
        {filtered.length === 0 ? (
          <Empty>{emptyHint}</Empty>
        ) : (
          filtered.map((item) => (
            <Row key={item.id}>
              <Info>
                <Preview>{item.preview || '（空）'}</Preview>
                <Time>{fmtTime(item.time)}</Time>
              </Info>
              {deletingId === item.id ? (
                <ConfirmRow>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      onDelete(item.id)
                      setDeletingId(null)
                    }}>
                    确认删除
                  </button>
                  <button type="button" onClick={() => setDeletingId(null)}>
                    取消
                  </button>
                </ConfirmRow>
              ) : (
                <RowBtns>
                  <IconAction title="还原" onClick={() => onRestore(item.id)}>
                    <RotateCcw size={13} />
                  </IconAction>
                  <IconAction $danger title="永久删除" onClick={() => setDeletingId(item.id)}>
                    <Trash2 size={13} />
                  </IconAction>
                </RowBtns>
              )}
            </Row>
          ))
        )}
      </List>
      <FooterHint>
        <Archive size={12} /> 共 {items.length} 条
      </FooterHint>
    </MXDialog>
  )
}

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
`

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  border: 1px solid ${mx.border};
  border-radius: 999px;
  padding: 5px 12px;
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
  }
`

const ClearBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid ${mx.danger};
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  color: ${mx.danger};
  background: rgba(239, 83, 80, 0.06);
  cursor: pointer;
`

const List = styled.div`
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  padding: 24px 0;
  font-size: 12px;
  color: ${mx.text3};
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid ${mx.border};
  border-radius: 10px;
  background: ${mx.soft2};
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const Preview = styled.div`
  font-size: 12.5px;
  color: ${mx.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Time = styled.div`
  font-size: 10.5px;
  color: ${mx.text3};
  margin-top: 2px;
`

const RowBtns = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
`

const IconAction = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: none;
  color: ${(p) => (p.$danger ? mx.danger : mx.text2)};
  cursor: pointer;
  &:hover {
    background: ${(p) => (p.$danger ? 'rgba(239,83,80,0.1)' : mx.soft)};
    color: ${(p) => (p.$danger ? mx.danger : mx.accent)};
  }
`

const ConfirmRow = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  button {
    border: none;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    background: ${mx.soft};
    color: ${mx.text2};
    &.danger {
      background: ${mx.danger};
      color: #fff;
    }
  }
`

const FooterHint = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 11px;
  color: ${mx.text3};
`

export default FolderModal
