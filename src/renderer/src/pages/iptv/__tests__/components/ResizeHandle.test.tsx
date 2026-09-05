import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ResizeHandle } from '../../components/ResizeHandle'

describe('ResizeHandle（栏间拖拽手柄）', () => {
  it('按住拖动：每次位移都上报增量，松手触发结束回调', () => {
    const onResize = vi.fn()
    const onResizeEnd = vi.fn()
    const { container } = render(<ResizeHandle onResize={onResize} onResizeEnd={onResizeEnd} ariaLabel="拖我" />)

    fireEvent.mouseDown(container.firstElementChild!, { clientX: 100 })
    expect(document.body.style.cursor).toBe('col-resize')

    fireEvent.mouseMove(window, { clientX: 120 })
    fireEvent.mouseMove(window, { clientX: 135 })
    expect(onResize.mock.calls).toEqual([[20], [15]]) // 上报的是相对上一次的位移增量

    fireEvent.mouseUp(window)
    expect(onResizeEnd).toHaveBeenCalledTimes(1)
    expect(document.body.style.cursor).toBe('') // 拖拽状态复位
  })

  it('拖动中组件卸载：监听器被拆除，不再上报（防泄漏）', () => {
    const onResize = vi.fn()
    const { container, unmount } = render(<ResizeHandle onResize={onResize} ariaLabel="拖我" />)

    fireEvent.mouseDown(container.firstElementChild!, { clientX: 0 })
    unmount()
    fireEvent.mouseMove(window, { clientX: 50 })
    fireEvent.mouseUp(window)

    expect(onResize).not.toHaveBeenCalled()
    expect(document.body.style.cursor).toBe('')
  })

  it('回调经 ref 转发：拖动期间父组件换新回调也生效', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { container, rerender } = render(<ResizeHandle onResize={first} ariaLabel="拖我" />)
    fireEvent.mouseDown(container.firstElementChild!, { clientX: 0 })

    rerender(<ResizeHandle onResize={second} ariaLabel="拖我" />)
    fireEvent.mouseMove(window, { clientX: 30 })

    expect(second).toHaveBeenCalledWith(30)
  })
})
