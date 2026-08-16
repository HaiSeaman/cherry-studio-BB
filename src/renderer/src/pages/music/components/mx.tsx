import { X } from 'lucide-react'
import { type FC, type ReactNode, useEffect } from 'react'
import styled, { css, keyframes } from 'styled-components'

/**
 * 音乐/闹钟便签页设计系统：全部颜色取自全局主题 CSS 变量，
 * 跟随 6 款主题（4 浅 + 2 深）自动变色（accent = 当前主题主色）。
 * 组件自绘（不依赖 antd），深色主题下观感同样成立。
 */

export const mx = {
  paper: 'color-mix(in srgb, var(--color-background) 86%, transparent)',
  /* 卡片/内容框/输入框统一为当前主题配色（背景色），靠边框与阴影区分，只有功能按键加深 */
  card: 'var(--color-background)',
  soft: 'var(--color-background-soft)',
  soft2: 'var(--color-background)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  text2: 'var(--color-text-2)',
  text3: 'var(--color-text-3)',
  accent: 'var(--color-primary)',
  accent2: 'color-mix(in srgb, var(--color-primary) 55%, var(--color-white))',
  accentSoft: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
  amber: '#F5A623',
  live: '#F0594B',
  danger: 'var(--color-error)',
  gradient:
    'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 80%, var(--color-white)), var(--color-primary))',
  shadow: '0 1px 2px rgba(0, 0, 0, 0.05), 0 10px 30px color-mix(in srgb, var(--color-primary) 9%, transparent)'
}

/** 动效降级：系统开启"减少动态效果"时关闭所有装饰动画 */
export const reduceMotion = css`
  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
`

const eqBounce = keyframes`
  0%, 100% { height: 4px; }
  50% { height: 14px; }
`

export const MXCard = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  box-shadow: ${mx.shadow};
  padding: 14px;
  overflow: hidden;
  color: ${mx.text};
`

/** 36px 圆形幽灵图标按钮（主题色浅底，悬停泛主色） */
export const MXIconButton = styled.button<{ $danger?: boolean; $size?: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${(p) => p.$size ?? 36}px;
  height: ${(p) => p.$size ?? 36}px;
  border-radius: 50%;
  border: 1px solid ${mx.border};
  background: var(--color-background);
  color: ${(p) => (p.$danger ? mx.danger : mx.text2)};
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
  &:hover {
    ${(p) =>
      p.$danger
        ? css`
            border-color: ${mx.danger};
            background: rgba(239, 83, 80, 0.08);
            color: ${mx.danger};
          `
        : css`
            border-color: ${mx.accent};
            background: ${mx.accentSoft};
            color: ${mx.accent};
            transform: translateY(-1px);
          `}
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
    &:hover {
      transform: none;
      border-color: ${mx.border};
      background: var(--color-background);
      color: ${mx.text2};
    }
  }
`

/** 渐变主按钮（胶囊） */
export const MXPrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: ${mx.gradient};
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45);
    filter: brightness(1.05);
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
    transform: none;
    box-shadow: none;
  }
`

/** 次级胶囊按钮（主题色浅底） */
export const MXGhostPill = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid ${mx.border};
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  color: ${(p) => (p.$danger ? mx.danger : mx.text2)};
  background: var(--color-background);
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  &:hover {
    ${(p) =>
      p.$danger
        ? css`
            border-color: ${mx.danger};
            background: rgba(239, 83, 80, 0.08);
          `
        : css`
            border-color: ${mx.accent};
            background: ${mx.accentSoft};
            color: ${mx.accent};
          `}
  }
`

/** 整圆角搜索框 */
export const MXSearchInput = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 120px;
  border: 1px solid ${mx.border};
  border-radius: 999px;
  padding: 7px 14px;
  color: ${mx.text3};
  background: ${mx.soft2};
  transition: all 0.18s ease;
  &:focus-within {
    border-color: ${mx.accent};
    background: ${mx.card};
    box-shadow: 0 0 0 3px ${mx.accentSoft};
  }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: ${mx.text};
    font-size: 12.5px;
    &::placeholder {
      color: ${mx.text3};
    }
  }
`

/** 胶囊标签组（自绘 Segmented，active 白底浮起） */
interface MXTabsProps<T extends string> {
  value: T
  options: { value: T; label: string; badge?: number | string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}

export function MXTabs<T extends string>({ value, options, onChange, size = 'md' }: MXTabsProps<T>) {
  return (
    <TabsWrap $size={size} role="tablist">
      {options.map((o) => (
        <TabBtn
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          $active={value === o.value}
          $size={size}
          onClick={() => onChange(o.value)}>
          {o.label}
          {o.badge != null && o.badge !== 0 && <TabBadge>{o.badge}</TabBadge>}
        </TabBtn>
      ))}
    </TabsWrap>
  )
}

const TabsWrap = styled.div<{ $size: 'sm' | 'md' }>`
  display: inline-flex;
  gap: 2px;
  background: ${mx.soft};
  border-radius: 999px;
  padding: 3px;
  max-width: 100%;
  overflow-x: auto;
`

const TabBtn = styled.button<{ $active: boolean; $size: 'sm' | 'md' }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  border-radius: 999px;
  padding: ${(p) => (p.$size === 'sm' ? '3px 10px' : '5px 13px')};
  font-size: ${(p) => (p.$size === 'sm' ? '11.5px' : '12.5px')};
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  color: ${(p) => (p.$active ? mx.accent : mx.text2)};
  background: ${(p) => (p.$active ? 'var(--color-background)' : 'transparent')};
  box-shadow: ${(p) => (p.$active ? '0 1px 4px rgba(34,49,42,0.10)' : 'none')};
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  &:hover {
    color: ${(p) => (p.$active ? mx.accent : mx.text)};
  }
`

const TabBadge = styled.span`
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  background: ${mx.accentSoft};
  color: ${mx.accent};
  border-radius: 999px;
  padding: 0 5px;
  min-width: 14px;
  text-align: center;
`

/** 轻量浅色对话框（替代 antd Modal / Modal.confirm） */
interface MXDialogProps {
  open: boolean
  title: string
  children?: ReactNode
  okText?: string
  cancelText?: string
  okDisabled?: boolean
  danger?: boolean
  onOk: () => void
  onCancel: () => void
}

export const MXDialog: FC<MXDialogProps> = ({
  open,
  title,
  children,
  okText = '确定',
  cancelText = '取消',
  okDisabled,
  danger,
  onOk,
  onCancel
}) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <DialogOverlay onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <DialogCard role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </DialogClose>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <DialogFooter>
          <MXGhostPill onClick={onCancel}>{cancelText}</MXGhostPill>
          <MXPrimaryButton
            onClick={onOk}
            disabled={okDisabled}
            style={danger ? { background: mx.danger, boxShadow: '0 4px 14px rgba(239,83,80,0.35)' } : undefined}>
            {okText}
          </MXPrimaryButton>
        </DialogFooter>
      </DialogCard>
    </DialogOverlay>
  )
}

const DialogOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, #000 32%, transparent);
  backdrop-filter: blur(3px);
`

const DialogCard = styled.div`
  width: min(400px, calc(100vw - 48px));
  background: var(--glass-bg-strong);
  backdrop-filter: blur(20px) saturate(1.3);
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
  padding: 18px;
`

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`

const DialogTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${mx.text};
`

const DialogClose = styled.button`
  display: flex;
  border: none;
  background: none;
  color: ${mx.text3};
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  &:hover {
    background: ${mx.soft};
    color: ${mx.text};
  }
`

const DialogBody = styled.div`
  color: ${mx.text2};
  font-size: 13px;
`

export const DialogField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
`

export const DialogLabel = styled.label`
  font-size: 12px;
  color: ${mx.text2};
`

export const DialogInput = styled.input`
  border: 1px solid ${mx.border};
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: ${mx.text};
  background: ${mx.soft2};
  outline: none;
  transition: all 0.18s ease;
  &:focus {
    border-color: ${mx.accent};
    background: ${mx.card};
    box-shadow: 0 0 0 3px ${mx.accentSoft};
  }
`

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
`

/** 加载指示（呼吸圆点） */
export const MXSpinner = styled.span`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid ${mx.accentSoft};
  border-top-color: ${mx.accent};
  animation: ${keyframes`to { transform: rotate(360deg) }`} 0.8s linear infinite;
  ${reduceMotion}
`

/** 播放中频谱条（3 根，签名元素之一；暂停时冻结为静止短条） */
export const Equalizer = styled.span<{ $paused?: boolean }>`
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  span {
    width: 3px;
    border-radius: 2px;
    background: ${mx.accent};
    animation: ${eqBounce} 0.9s ease-in-out infinite;
    ${(p) => p.$paused && 'animation-play-state: paused; height: 4px;'}
  }
  span:nth-child(2) {
    animation-delay: 0.25s;
  }
  span:nth-child(3) {
    animation-delay: 0.5s;
  }
  ${reduceMotion}
`

/** 播放中频谱条（3 根，签名元素之一） */
export const Eq: FC<{ paused?: boolean }> = ({ paused }) => (
  <Equalizer $paused={paused} aria-hidden>
    <span />
    <span />
    <span />
  </Equalizer>
)
