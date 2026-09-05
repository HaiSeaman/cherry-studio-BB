import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Logo } from '../../components/Logo'

describe('Logo', () => {
  it('有 logo 地址时渲染 img', () => {
    render(<Logo name="CCTV-1" logo="http://logo/cctv1.png" />)
    const img = screen.getByRole('img', { name: 'CCTV-1' })
    expect(img).toHaveAttribute('src', 'http://logo/cctv1.png')
  })

  it('logo 为 null → 直接显示首字母兜底', () => {
    render(<Logo name="广西卫视" logo={null} />)
    expect(screen.getByText('广')).toBeInTheDocument()
  })

  it('logo 加载失败（onError）→ 显示首字母兜底', () => {
    render(<Logo name="CCTV-1" logo="http://broken/logo.png" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('失败后换新 logo（虚拟列表复用实例）→ 重新显示 img，不误兜底', () => {
    const { rerender } = render(<Logo name="CCTV-1" logo="http://broken/logo.png" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('C')).toBeInTheDocument()
    // 同一实例切换到新频道的可用 logo
    rerender(<Logo name="广西卫视" logo="http://logo/good.png" />)
    expect(screen.getByRole('img', { name: '广西卫视' })).toHaveAttribute('src', 'http://logo/good.png')
  })

  it('空名 → "?" 兜底', () => {
    render(<Logo name=" " logo={null} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
