import { useCallback, useEffect, useRef } from 'react'
import styled from 'styled-components'

interface ResizeHandleProps {
  /** 拖动中的每次鼠标位移（px，右拖为正）。回调经 ref 转发，拖动期间父组件换新回调也能生效 */
  onResize: (deltaX: number) => void
  /** 松开鼠标（本次拖拽结束） */
  onResizeEnd?: () => void
  ariaLabel: string
}

/** 栏间竖向拖拽手柄：按住左右拖动调整相邻栏的宽度 */
export const ResizeHandle = ({ onResize, onResizeEnd, ariaLabel }: ResizeHandleProps) => {
  // 监听器闭包绑定 mousedown 时刻的 props，经 ref 读取最新值避免拖动中读到过期回调
  const cbRef = useRef({ onResize, onResizeEnd })
  cbRef.current = { onResize, onResizeEnd }
  // 组件在拖拽中途卸载时拆除 window 监听（正常松手由 onUp 自己清理）
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      cleanupRef.current?.()
    },
    []
  )

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    let lastX = e.clientX
    // 拖拽期间锁定光标并禁止选中文字，避免划过列表时闪选
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      cbRef.current.onResize(ev.clientX - lastX)
      lastX = ev.clientX
    }
    const onUp = () => {
      cleanupRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cbRef.current.onResizeEnd?.()
    }
    cleanupRef.current = onUp
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return <Handle role="separator" aria-orientation="vertical" aria-label={ariaLabel} onMouseDown={startDrag} />
}

/** 5px 热区 + 居中 1px 分隔线；悬停/拖拽中加粗变主色，提示可抓取 */
const Handle = styled.div`
  flex: none;
  position: relative;
  width: 5px;
  cursor: col-resize;
  z-index: 10;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: var(--color-border-soft);
    transition:
      width 0.15s,
      left 0.15s,
      background 0.15s;
  }

  &:hover::before,
  &:active::before {
    left: 1px;
    width: 3px;
    background: var(--color-primary);
  }
`
