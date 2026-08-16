import { Volume2, VolumeX } from 'lucide-react'
import { type FC, useEffect } from 'react'
import styled from 'styled-components'

import { useAppDispatch, useAppSelector } from '@renderer/store'

import { audioEngine } from '../services/audioEngine'
import { setLastVolumeBeforeMute, setVolume } from '../store/musicSettingsSlice'

/** 本地音乐与 FM 电台共用的音量控制（值持久化在 musicSettings.volume） */
const VolumeControl: FC = () => {
  const dispatch = useAppDispatch()
  const volume = useAppSelector((s) => s.musicSettings.volume)
  const lastVolumeBeforeMute = useAppSelector((s) => s.musicSettings.lastVolumeBeforeMute)

  // 挂载时把持久化音量应用到共享引擎（本地/FM 任一先挂载即生效）
  useEffect(() => {
    audioEngine.setVolume(volume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyVolume = (v: number) => {
    audioEngine.setVolume(v)
    dispatch(setVolume(v))
  }

  const toggleMute = () => {
    if (volume > 0) {
      dispatch(setLastVolumeBeforeMute(volume))
      applyVolume(0)
    } else {
      applyVolume(lastVolumeBeforeMute > 0 ? lastVolumeBeforeMute : 80)
    }
  }

  return (
    <VolumeWrap>
      <VolIconBtn onClick={toggleMute} title={volume === 0 ? '取消静音' : '静音'}>
        {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </VolIconBtn>
      <VolumeTrack>
        <VolumeFill style={{ width: `${volume}%` }} />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          onChange={(e) => applyVolume(Number(e.target.value))}
          aria-label="音量"
        />
      </VolumeTrack>
    </VolumeWrap>
  )
}

const VolumeWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 110px;
`

const VolIconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-icon);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  &:hover {
    background: var(--color-background-mute);
  }
`

const VolumeTrack = styled.div`
  position: relative;
  flex: 1;
  height: 14px;
  display: flex;
  align-items: center;
  background: var(--color-border-soft);
  border-radius: 2px;
  cursor: pointer;

  input[type='range'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    opacity: 0;
    z-index: 2;
    cursor: pointer;
  }
`

const VolumeFill = styled.div`
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  border-radius: 2px;
  background: var(--color-primary);
  pointer-events: none;
`

export default VolumeControl
