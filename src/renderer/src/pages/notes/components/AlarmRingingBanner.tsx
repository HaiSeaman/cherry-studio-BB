import { BellRing, VolumeX } from 'lucide-react'
import { type FC, useEffect } from 'react'
import styled, { keyframes } from 'styled-components'

import type { RingingInfo } from '../services/alarmScheduler'
import { reduceMotion } from './mx'

interface AlarmRingingBannerProps {
  /** 正在响铃的闹钟数据或倒计时信息 */
  ringing: RingingInfo | null
  /** 关闭闹钟回调 */
  onStop: () => void
}

export const AlarmRingingBanner: FC<AlarmRingingBannerProps> = ({ ringing, onStop }) => {
  // 键盘快捷键监听：按下 Escape 或 Space 立即停铃，彻底免去鼠标瞄准成本
  useEffect(() => {
    if (!ringing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 避免在普通文本输入框打字时误触空格关闭闹钟
      const target = e.target as HTMLElement | null
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (e.key === 'Escape' || (e.key === ' ' && !isInput)) {
        e.preventDefault()
        e.stopPropagation()
        onStop()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [ringing, onStop])

  if (!ringing) return null

  const displayTime: string = ringing?.fromTimer ? '倒计时完成' : '闹钟到点'
  const displayLabel: string = ringing.label?.trim() || (ringing.fromTimer ? '计时任务已结束' : '提醒事项已到期')

  return (
    <OverlayWrapper>
      <BannerCard role="alert" aria-live="assertive">
        {/* 左侧：动态呼吸发光闹钟图标 */}
        <IconBox>
          <BellRing size={24} className="ring-bell" />
          <PulseHalo />
        </IconBox>

        {/* 中间：信息展示 */}
        <ContentBox>
          <HeaderLine>
            <StatusBadge>🔔 闹钟响铃中</StatusBadge>
            <TimeText>{displayTime}</TimeText>
          </HeaderLine>
          <LabelText title={displayLabel}>{displayLabel}</LabelText>
        </ContentBox>

        {/* 右侧：超大主操作按键（高醒目、防误触、键盘提示） */}
        <ActionButton
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onStop()
          }}
          title="点击或按 Esc / 空格 键停止响铃">
          <VolumeX size={18} />
          <span>关闭闹钟</span>
          <KbdHint>Esc</KbdHint>
        </ActionButton>
      </BannerCard>
    </OverlayWrapper>
  )
}

/* ---------------- 动效定义 ---------------- */

const pulseGlow = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(240, 89, 75, 0.5);
  }
  70% {
    box-shadow: 0 0 0 14px rgba(240, 89, 75, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(240, 89, 75, 0);
  }
`

const ringShake = keyframes`
  0%, 100% { transform: rotate(0deg); }
  20%, 60% { transform: rotate(-14deg); }
  40%, 80% { transform: rotate(14deg); }
`

const bannerSlideDown = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, -24px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
`

/* ---------------- 样式组件 ---------------- */

/** 全局绝对置顶容器：脱离一切局部滚动与网格限制，z-index 设为全屏最高 99999 */
const OverlayWrapper = styled.div`
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  pointer-events: none; /* 穿透空白区 */
`

const BannerCard = styled.div`
  pointer-events: auto; /* 保证卡片自身绝对接收点击 */
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 440px;
  max-width: 90vw;
  padding: 12px 16px 12px 14px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--color-background) 90%, transparent);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1.5px solid color-mix(in srgb, #f0594b 45%, var(--color-border));
  box-shadow:
    0 16px 40px -8px rgba(240, 89, 75, 0.22),
    0 6px 20px rgba(0, 0, 0, 0.12);
  animation: ${bannerSlideDown} 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;

  ${reduceMotion}
`

const IconBox = styled.div`
  position: relative;
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff6b5b, #e53935);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;

  .ring-bell {
    animation: ${ringShake} 1.2s infinite ease-in-out;
  }

  ${reduceMotion}
`

const PulseHalo = styled.div`
  position: absolute;
  inset: 0;
  border-radius: 14px;
  animation: ${pulseGlow} 1.8s infinite ease-out;

  ${reduceMotion}
`

const ContentBox = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const HeaderLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const StatusBadge = styled.span`
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, #f0594b 15%, transparent);
  color: #e53935;
  letter-spacing: 0.2px;
`

const TimeText = styled.span`
  font-size: 13px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--color-text);
`

const LabelText = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const ActionButton = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 18px;
  border: none;
  border-radius: 13px;
  background: linear-gradient(135deg, #ef5350, #d32f2f);
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(229, 57, 53, 0.35);
  transition:
    transform 0.12s ease,
    filter 0.15s ease,
    box-shadow 0.15s ease;
  user-select: none;
  -webkit-user-select: none;

  &:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(229, 57, 53, 0.45);
  }

  &:active {
    transform: translateY(1px) scale(0.97);
    filter: brightness(0.95);
    box-shadow: 0 2px 8px rgba(229, 57, 53, 0.3);
  }

  &:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }
`

const KbdHint = styled.kbd`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  line-height: 1;
`
