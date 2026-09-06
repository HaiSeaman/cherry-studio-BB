import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PlayerControls } from '../../components/PlayerControls'
import type { PlayerState } from '../../services/playerStore'
import { initialRetry } from '../../services/retryLogic'

const baseState: PlayerState = {
  current: null,
  engineType: 'native',
  status: 'idle',
  errorMsg: '',
  retry: initialRetry
}

const noop = () => {}

describe('PlayerControls 崩溃回归（老存档缺新字段）', () => {
  it('playMode 为 undefined 时渲染不崩溃（Cannot read properties of undefined (reading icon) 回归）', () => {
    render(
      <PlayerControls
        state={baseState}
        volume={80}
        maximized={false}
        isLocal={false}
        currentTime={0}
        duration={0}
        playbackRate={undefined as never}
        playMode={undefined as never}
        rotation={0}
        onToggle={noop}
        onVolume={noop}
        onToggleMute={noop}
        onFullscreen={noop}
        onToggleMaximize={noop}
        onRetry={noop}
        onSeek={noop}
        onRate={noop}
        onCycleMode={noop}
        onPrev={noop}
        onNext={noop}
        onRotate={noop}
        onSnapshot={noop}
        onPip={noop}
      />
    )
    // 页面关键控件仍在：播放按钮可寻址
    expect(screen.getByLabelText('播放/暂停')).toBeTruthy()
  })

  it('playMode 为未知值时同样兜底为顺序播放，不崩溃', () => {
    render(
      <PlayerControls
        state={baseState}
        volume={80}
        maximized={false}
        isLocal
        currentTime={12}
        duration={100}
        playbackRate={1}
        playMode={'bogus' as never}
        rotation={90}
        onToggle={noop}
        onVolume={noop}
        onToggleMute={noop}
        onFullscreen={noop}
        onToggleMaximize={noop}
        onRetry={noop}
        onSeek={noop}
        onRate={noop}
        onCycleMode={noop}
        onPrev={noop}
        onNext={noop}
        onRotate={noop}
        onSnapshot={noop}
        onPip={noop}
      />
    )
    expect(screen.getByTitle('播放模式：顺序播放（点击切换）')).toBeTruthy()
  })
})
