import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChannelItem } from '../../components/ChannelItem'
import type { IptvChannel } from '../../types'

const channel: IptvChannel = {
  id: 1,
  playlistId: 1,
  name: 'CCTV-1 综合',
  url: 'http://example.com/cctv1.m3u8',
  logo: null,
  group: '央视',
  tvgId: 'CCTV1'
}

const baseProps = {
  channel,
  active: false,
  favorite: false,
  onPlay: vi.fn(),
  onToggleFavorite: vi.fn()
}

describe('ChannelItem', () => {
  it('渲染频道名与 Logo 兜底', () => {
    render(<ChannelItem {...baseProps} />)
    expect(screen.getByText('CCTV-1 综合')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument() // logo=null → 首字母
  })

  it('点击整行 → 触发播放回调', () => {
    const onPlay = vi.fn()
    render(<ChannelItem {...baseProps} onPlay={onPlay} />)
    fireEvent.click(screen.getByText('CCTV-1 综合'))
    expect(onPlay).toHaveBeenCalledWith(channel)
  })

  it('点击收藏星 → 触发收藏回调且不冒泡播放', () => {
    const onPlay = vi.fn()
    const onToggleFavorite = vi.fn()
    render(<ChannelItem {...baseProps} onPlay={onPlay} onToggleFavorite={onToggleFavorite} />)
    fireEvent.click(screen.getByLabelText('收藏'))
    expect(onToggleFavorite).toHaveBeenCalledWith(channel)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('已收藏 → 星标高亮 + aria-label 切换', () => {
    render(<ChannelItem {...baseProps} favorite />)
    expect(screen.getByLabelText('取消收藏')).toBeInTheDocument()
  })
})
