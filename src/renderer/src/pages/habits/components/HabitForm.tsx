import { type FC, useEffect, useState } from 'react'
import styled from 'styled-components'

import { addHabit, updateHabit } from '../services/habitService'
import type { Habit } from '../types'
import { DialogField, DialogInput, DialogLabel, mx, MXDialog } from './mx'

const HABIT_COLORS: string[] = [  '#D85A30',
  '#2F7ED8',
  '#2E9E5B',
  '#B8860B',
  '#8E44AD',
  '#C2426E',
  '#008B8B',
  '#D2691E',
  '#5F6B7A',
  '#3CB371'
]

const HABIT_EMOJIS: string[] = ['🚭', '💧', '🏃', '😴', '📚', '🧘', '🥗', '💪', '✍️', '🎸', '🧹', '💊', '🦷', '☀️', '🚶', '🛏️']

export interface HabitFormProps {
  open: boolean
  /** 编辑模式传入目标习惯；新增模式传 null */
  editing?: Habit | null
  onClose: () => void
}

/** 习惯新增/编辑弹窗：名称 + emoji 单选 + 色板单选 */
const HabitForm: FC<HabitFormProps> = ({ open, editing, onClose }) => {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(HABIT_EMOJIS[0])
  const [color, setColor] = useState(HABIT_COLORS[0])
  const [submitting, setSubmitting] = useState(false)

  // 打开时回填（编辑）或重置（新增）
  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name)
        setIcon(editing.icon)
        setColor(editing.color)
      } else {
        setName('')
        setIcon(HABIT_EMOJIS[0])
        setColor(HABIT_COLORS[0])
      }
    }
  }, [open, editing])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleOk = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      if (editing) {
        await updateHabit(editing.id, { name: name.trim(), icon, color })
      } else {
        await addHabit({ name: name.trim(), icon, color })
      }
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MXDialog open={open} title={editing ? '编辑习惯' : '添加习惯'} okText="保存" okDisabled={!canSubmit} onOk={handleOk} onCancel={onClose}>
      <DialogField>
        <DialogLabel>名称</DialogLabel>
        <DialogInput
          type="text"
          placeholder="如：戒烟 / 喝水 / 运动"
          value={name}
          maxLength={20}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleOk()}
        />
      </DialogField>
      {/* 实时预览：所见即所得，选完就知道列表里长什么样 */}
      <PreviewRow $color={color}>
        <span className="emoji">{icon}</span>
        <span className="name">{name.trim() || '新习惯'}</span>
      </PreviewRow>
      <DialogField>
        <DialogLabel>图标</DialogLabel>
        <EmojiGrid>
          {HABIT_EMOJIS.map((e) => (
            <EmojiCell key={e} $active={icon === e} onClick={() => setIcon(e)}>
              {e}
            </EmojiCell>
          ))}
        </EmojiGrid>
      </DialogField>
      <DialogField>
        <DialogLabel>颜色</DialogLabel>
        <ColorRow>
          {HABIT_COLORS.map((c) => (
            <ColorDot key={c} $color={c} $active={color === c} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </ColorRow>
      </DialogField>
      <Hint>删除习惯会走归档，历史打卡数据保留。</Hint>
    </MXDialog>
  )
}

const EmojiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(8, 30px);
  gap: 4px;
`

const PreviewRow = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, ${(p) => p.$color} 12%, transparent);
  border-left: 3px solid ${(p) => p.$color};
  margin-bottom: 12px;
  .emoji {
    font-size: 18px;
  }
  .name {
    font-size: 13.5px;
    font-weight: 600;
    color: ${mx.text};
  }
`

const EmojiCell = styled.button<{ $active?: boolean }>`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border-radius: 7px;
  border: 1px solid ${(p) => (p.$active ? mx.accent : mx.border)};
  background: ${(p) => (p.$active ? mx.accentSoft : 'transparent')};
  cursor: pointer;
  padding: 0;
`

const ColorRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const ColorDot = styled.button<{ $color: string; $active?: boolean }>`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  border: 2px solid ${(p) => (p.$active ? mx.text : 'transparent')};
  box-shadow: ${(p) => (p.$active ? `0 0 0 2px ${mx.paper}` : 'none')};
  cursor: pointer;
  padding: 0;
`

const Hint = styled.div`
  font-size: 11.5px;
  color: ${mx.text3};
`

export default HabitForm
