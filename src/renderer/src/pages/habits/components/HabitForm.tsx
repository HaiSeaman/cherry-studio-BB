import { message } from 'antd'
import { type FC, useEffect, useState } from 'react'
import styled from 'styled-components'

import { addHabit, updateHabit } from '../services/habitService'
import type { Habit } from '../types'
import { DialogField, DialogInput, DialogLabel, mx, MXDialog } from './mx'

/**
 * 色板 24 色（按色系排布：红橙 → 金绿 → 青蓝 → 紫粉 → 棕灰），
 * 全部为中低饱和中间调，浅色/深色主题下作文字/色点都够清晰
 */
const HABIT_COLORS: string[] = [
  '#C43D3D',
  '#D85A30',
  '#D2691E',
  '#E8846B',
  '#C2426E',
  '#D96C8A',
  '#B8860B',
  '#DAA520',
  '#7A9A3B',
  '#2E9E5B',
  '#3CB371',
  '#5FB3B3',
  '#008B8B',
  '#1B9AAA',
  '#2F7ED8',
  '#7A99C2',
  '#2C4A8A',
  '#5B5EA6',
  '#8E44AD',
  '#9B7EC8',
  '#8B5A2B',
  '#C4A57B',
  '#5F6B7A',
  '#3E4550'
]

/**
 * 图标 40 个（按生活场景排列：运动/饮食/作息/学习/理财/情趣）。
 * 只用 Unicode 13 及更早的 emoji：Windows 10 的系统表情字体不含 14+ 新字符，选了会显示成方框
 */
const HABIT_EMOJIS: string[] = [
  '🚭',
  '💧',
  '🏃',
  '😴',
  '📚',
  '🧘',
  '🥗',
  '💪',
  '✍️',
  '🎸',
  '🧹',
  '💊',
  '🦷',
  '☀️',
  '🚶',
  '🛏️',
  '⏰',
  '🌙',
  '🚿',
  '🥣',
  '🍎',
  '🥦',
  '⚖️',
  '🏋️',
  '🚴',
  '🏊',
  '⚽',
  '🏀',
  '🏸',
  '🧠',
  '📓',
  '📵',
  '💰',
  '🎹',
  '🎨',
  '📷',
  '🌱',
  '🐕',
  '🙏',
  '🎯'
]

export interface HabitFormProps {
  open: boolean
  /** 编辑模式传入目标习惯；新增模式传 null */
  editing?: Habit | null
  onClose: () => void
}

/** 习惯新增/编辑弹窗：名称 + 备注（可选）+ emoji 单选 + 色板单选 */
const HabitForm: FC<HabitFormProps> = ({ open, editing, onClose }) => {
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [icon, setIcon] = useState(HABIT_EMOJIS[0])
  const [color, setColor] = useState(HABIT_COLORS[0])
  const [submitting, setSubmitting] = useState(false)

  // 打开时回填（编辑）或重置（新增）；note 防御式回填——老数据没有该字段
  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name)
        setNote(editing.note ?? '')
        setIcon(editing.icon)
        setColor(editing.color)
      } else {
        setName('')
        setNote('')
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
      const trimmedNote = note.trim()
      if (editing) {
        // 备注清空 → 写 undefined 删掉该字段；Dexie 对非索引字段的 undefined 更新安全
        await updateHabit(editing.id, { name: name.trim(), icon, color, note: trimmedNote || undefined })
      } else {
        await addHabit({ name: name.trim(), icon, color, note: trimmedNote || undefined })
      }
      onClose()
    } catch {
      // 静默失败比报错更糟：弹窗留着、输入不丢，让用户能重试
      message.error('保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MXDialog
      open={open}
      title={editing ? '编辑习惯' : '添加习惯'}
      okText="保存"
      okDisabled={!canSubmit}
      onOk={handleOk}
      onCancel={onClose}>
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
      <DialogField>
        <DialogLabel>备注（可选，说明具体要求或提醒自己）</DialogLabel>
        <DialogInput
          type="text"
          placeholder="如：每天至少 2000ml / 睡前拉伸 10 分钟"
          value={note}
          maxLength={100}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleOk()}
        />
      </DialogField>
      {/* 实时预览：所见即所得，选完就知道列表里长什么样 */}
      <PreviewRow $color={color}>
        <span className="emoji">{icon}</span>
        <div className="texts">
          <span className="name">{name.trim() || '新习惯'}</span>
          {note.trim() && <span className="note">{note.trim()}</span>}
        </div>
      </PreviewRow>
      <DialogField>
        <DialogLabel>图标</DialogLabel>
        <EmojiGrid data-testid="emoji-grid">
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

/** 10 列网格：40 个图标 4 行放下；上限 160px 兜底滚动，弹窗在小窗口也不撑爆 */
const EmojiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(10, 30px);
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
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
  .texts {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 600;
    color: ${mx.text};
  }
  .note {
    margin-top: 1px;
    font-size: 11.5px;
    color: ${mx.text3};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  gap: 7px;
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
