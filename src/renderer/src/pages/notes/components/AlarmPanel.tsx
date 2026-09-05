import { db } from '@renderer/databases'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, Plus, RotateCcw, Volume2 } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import styled, { keyframes } from 'styled-components'

import { useCountdown } from '../hooks/useCountdown'
import { alarmScheduler } from '../services/alarmScheduler'
import { alarmSounds, soundLabel } from '../services/alarmSounds'
import { nextRingInfo } from '../services/schedule'
import { setAlarmVolume } from '../store/hubSettingsSlice'
import type { HubAlarm } from '../types'
import { mx, MXGhostPill, MXTabs, reduceMotion } from './mx'
import SoundPicker from './SoundPicker'

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const RING_CIRCUMFERENCE = 2 * Math.PI * 52

type AlarmTab = 'timer' | 'alarm' | 'calendar'

const pad2 = (n: number) => String(n).padStart(2, '0')
const clampNum = (v: string, max: number) => Math.min(Math.max(parseInt(v, 10) || 0, 0), max)
const fmtHMS = (s: number) => `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`
const fmtRingInfo = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒后` : `${sec} 秒后`)

interface AlarmPanelProps {
  ringing: { label: string; sound: string; fromTimer?: boolean } | null
}

/** 右上卡片：实时时钟 + 倒计时/定时闹钟子 tab + 音量（响铃由全局调度器驱动） */
const AlarmPanel: FC<AlarmPanelProps> = ({ ringing }) => {
  const dispatch = useAppDispatch()
  const alarmVolume = useAppSelector((s) => s.hubSettings.alarmVolume)
  const defaultSound = useAppSelector((s) => s.hubSettings.defaultSound)

  const [tab, setTab] = useState<AlarmTab>('timer')

  // 实时时钟
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // 音量应用到引擎（含挂载时恢复持久化音量）
  useEffect(() => {
    alarmSounds.setVolume(alarmVolume)
  }, [alarmVolume])

  // ---- 倒计时 ----
  const [timerLabel, setTimerLabel] = useState('')
  const [timerSound, setTimerSound] = useState('default')
  const [timerH, setTimerH] = useState('0')
  const [timerM, setTimerM] = useState('5')
  const [timerS, setTimerS] = useState('0')

  const customSounds = useAppSelector((s) => s.hubSettings.customSounds)

  // 结束时走全局调度器：响铃 + 系统通知 + 后台唤起主窗口（与闹钟同一引擎）
  const cd = useCountdown(() => alarmScheduler.fireExternal(timerLabel, timerSound))

  const stopAllRinging = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    e?.preventDefault()
    alarmScheduler.stopRinging()
    if (ringing?.fromTimer) {
      cd.reset()
    }
  }

  // ---- 定时闹钟 ----
  const alarms = useLiveQuery(async () => (await db.hub_alarms.toArray()) ?? [], [], [])
  const [alarmH, setAlarmH] = useState('7')
  const [alarmM, setAlarmM] = useState('30')
  const [alarmLabel, setAlarmLabel] = useState('')
  const [alarmSound, setAlarmSound] = useState(defaultSound)

  const addAlarm = async () => {
    await db.hub_alarms.add({
      h: clampNum(alarmH, 23),
      m: clampNum(alarmM, 59),
      s: 0,
      enabled: true,
      triggered: false,
      label: alarmLabel.trim(),
      sound: alarmSound
    })
    setAlarmLabel('')
  }

  const toggleAlarm = async (a: HubAlarm) => {
    await db.hub_alarms.update(a.id, { enabled: !a.enabled, triggered: false, lastTriggerKey: undefined })
  }

  const deleteAlarm = async (a: HubAlarm) => {
    await db.hub_alarms.delete(a.id)
  }

  // 定时闹钟（无 date）与日历闹钟（带 date）分组：互不混排
  const regularAlarms = (alarms ?? []).filter((a) => !a.date)
  const calAlarms = (alarms ?? [])
    .filter((a) => !!a.date)
    .sort(
      (a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0) || a.h * 3600 + a.m * 60 - (b.h * 3600 + b.m * 60)
    )
  const sortedAlarms = regularAlarms.slice().sort((a, b) => a.h * 3600 + a.m * 60 - (b.h * 3600 + b.m * 60))
  const anyRinging = ringing != null
  const timerProgress = cd.totalSec > 0 ? cd.remainSec / cd.totalSec : 0

  const renderAlarmItem = (a: HubAlarm, isCalendar: boolean) => {
    const info = nextRingInfo(a, now)
    return (
      <AlarmItem key={a.id} className={!a.enabled ? 'off' : ''}>
        <Toggle
          className={a.enabled ? 'on' : ''}
          onClick={() => void toggleAlarm(a)}
          role="switch"
          aria-checked={a.enabled}>
          <span />
        </Toggle>
        <AlarmInfo>
          <AlarmTime>
            {isCalendar ? `📅 ${a.date} ` : ''}
            {`${pad2(a.h)}:${pad2(a.m)}:${pad2(a.s)}`}
          </AlarmTime>
          <AlarmMeta>
            {[
              a.label || '闹钟',
              soundLabel(a.sound, customSounds),
              a.enabled && info != null ? fmtRingInfo(info) : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </AlarmMeta>
        </AlarmInfo>
        <DelBtn onClick={() => void deleteAlarm(a)} title={isCalendar ? '删除日历闹钟' : '删除闹钟'}>
          ✕
        </DelBtn>
      </AlarmItem>
    )
  }

  return (
    <Panel data-no-dnd>
      <ClockRow>
        <ClockTime
          className={
            anyRinging ? 'ringing' : ''
          }>{`${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`}</ClockTime>
        <ClockDate>
          {`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${WEEKDAYS[now.getDay()]}`}
        </ClockDate>
      </ClockRow>

      {anyRinging && (
        <CardRingingBar role="alert">
          <div className="alert-badge">
            <span className="dot-pulse" />
            <span className="alert-text">
              🔔 {ringing?.fromTimer ? '倒计时到期' : '闹钟响铃中'}
              {ringing?.label ? ` · ${ringing.label}` : ''}
            </span>
          </div>
          <CardStopBtn type="button" onClick={stopAllRinging} title="点击立即关闭闹钟">
            🔕 关闭闹钟
          </CardStopBtn>
        </CardRingingBar>
      )}

      <MXTabs
        value={tab}
        onChange={(v) => setTab(v)}
        options={[
          { value: 'timer', label: '倒计时' },
          { value: 'alarm', label: '定时闹钟', badge: regularAlarms.length },
          { value: 'calendar', label: '日历闹钟', badge: calAlarms.length }
        ]}
      />

      {tab === 'timer' ? (
        <TimerBody>
          <RingWrap>
            <svg width="116" height="116" viewBox="0 0 116 116">
              <circle cx="58" cy="58" r="52" fill="none" stroke={mx.border} strokeWidth="7" />
              <circle
                cx="58"
                cy="58"
                r="52"
                fill="none"
                stroke={mx.accent}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - timerProgress)}
                transform="rotate(-90 58 58)"
                style={{ transition: 'stroke-dashoffset 0.25s linear' }}
              />
            </svg>
            <RingText className={anyRinging && ringing?.fromTimer ? 'ringing' : ''}>{fmtHMS(cd.remainSec)}</RingText>
          </RingWrap>
          <InputsRow>
            {[
              { v: timerH, set: setTimerH, max: 99, label: '时' },
              { v: timerM, set: setTimerM, max: 59, label: '分' },
              { v: timerS, set: setTimerS, max: 59, label: '秒' }
            ].map((it) => (
              <NumInput key={it.label}>
                <input
                  type="number"
                  min={0}
                  max={it.max}
                  value={it.v}
                  onChange={(e) => it.set(e.target.value)}
                  disabled={cd.running}
                />
                <span>{it.label}</span>
              </NumInput>
            ))}
          </InputsRow>
          <ExtraRow>
            <input
              className="mx-text"
              placeholder="文字说明（可选）"
              maxLength={50}
              value={timerLabel}
              onChange={(e) => setTimerLabel(e.target.value)}
            />
            <SoundPicker value={timerSound} onChange={setTimerSound} />
          </ExtraRow>
          <ActionsRow>
            {cd.running ? (
              <MXGhostPill onClick={cd.pause}>
                <Pause size={13} /> 暂停
              </MXGhostPill>
            ) : cd.remainSec > 0 ? (
              <MXGhostPill onClick={cd.resume}>
                <Play size={13} /> 继续
              </MXGhostPill>
            ) : (
              <MXGhostPill
                onClick={() => cd.start(clampNum(timerH, 99), clampNum(timerM, 59), clampNum(timerS, 59))}
                disabled={anyRinging}>
                <Play size={13} /> 开始
              </MXGhostPill>
            )}
            <MXGhostPill
              onClick={() => {
                cd.reset()
                alarmScheduler.stopRinging()
              }}>
              <RotateCcw size={13} /> 重置
            </MXGhostPill>
          </ActionsRow>
        </TimerBody>
      ) : tab === 'alarm' ? (
        <AlarmBody>
          <AddRow>
            <NumInput small>
              <input type="number" min={0} max={23} value={alarmH} onChange={(e) => setAlarmH(e.target.value)} />
              <span>时</span>
            </NumInput>
            <NumInput small>
              <input type="number" min={0} max={59} value={alarmM} onChange={(e) => setAlarmM(e.target.value)} />
              <span>分</span>
            </NumInput>
            <input
              className="mx-text"
              placeholder="标签（可选）"
              maxLength={50}
              value={alarmLabel}
              onChange={(e) => setAlarmLabel(e.target.value)}
            />
            <SoundPicker value={alarmSound} onChange={setAlarmSound} />
            <AddBtn onClick={() => void addAlarm()}>
              <Plus size={13} /> 添加
            </AddBtn>
          </AddRow>
          <AlarmList>
            {sortedAlarms.length === 0 ? (
              <EmptyHint>还没有定时闹钟，设一个叫醒自己</EmptyHint>
            ) : (
              sortedAlarms.map((a) => renderAlarmItem(a, false))
            )}
          </AlarmList>
        </AlarmBody>
      ) : (
        <AlarmBody>
          <AlarmList>
            {calAlarms.length === 0 ? (
              <EmptyHint>日历闹钟会显示在这里，在日历页选中日期即可添加</EmptyHint>
            ) : (
              calAlarms.map((a) => renderAlarmItem(a, true))
            )}
          </AlarmList>
        </AlarmBody>
      )}

      <VolumeRow>
        <Volume2 size={15} />
        <input
          type="range"
          min={0}
          max={300}
          step={5}
          value={alarmVolume}
          aria-label="闹钟音量"
          onChange={(e) => dispatch(setAlarmVolume(Number(e.target.value)))}
        />
        <VolumeVal>{alarmVolume}%</VolumeVal>
      </VolumeRow>
    </Panel>
  )
}

const ringPulse = keyframes`
  0%, 100% { color: ${mx.accent}; }
  50% { color: ${mx.danger}; }
`

const Panel = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  box-shadow: ${mx.shadow};
  padding: 14px;
  overflow: hidden;
  color: ${mx.text};
`

const ClockRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0 2px;
`

const ClockTime = styled.div`
  font-size: 34px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 2px;
  background: ${mx.gradient};
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  &.ringing {
    animation: ${ringPulse} 0.8s ease-in-out infinite;
    -webkit-text-fill-color: initial;
  }
  ${reduceMotion}
`

const ClockDate = styled.div`
  font-size: 12px;
  color: ${mx.text3};
`

const TimerBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`

const RingWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`

const RingText = styled.div`
  position: absolute;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${mx.text};
  &.ringing {
    color: ${mx.danger};
    animation: ${ringPulse} 0.8s ease-in-out infinite;
  }
  ${reduceMotion}
`

const InputsRow = styled.div`
  display: flex;
  gap: 12px;
`

const NumInput = styled.label<{ small?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  font-size: 11px;
  color: ${mx.text3};
  input {
    width: ${(p) => (p.small ? '60px' : '72px')};
    text-align: center;
    border: 1px solid ${mx.border};
    border-radius: 10px;
    padding: 6px 24px 6px 6px;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: ${mx.text};
    background: ${mx.soft2};
    outline: none;
    &:focus {
      border-color: ${mx.accent};
      box-shadow: 0 0 0 3px ${mx.accentSoft};
    }
    &:disabled {
      opacity: 0.5;
    }
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
    }
  }
  > span {
    position: absolute;
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    color: ${mx.text3};
    pointer-events: none;
  }
`

const ExtraRow = styled.div`
  display: flex;
  gap: 8px;
  width: 100%;
  .mx-text {
    flex: 1;
    min-width: 0;
    border: 1px solid ${mx.border};
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 12px;
    color: ${mx.text};
    background: ${mx.soft2};
    outline: none;
    &:focus {
      border-color: ${mx.accent};
      box-shadow: 0 0 0 3px ${mx.accentSoft};
    }
  }
`

const ActionsRow = styled.div`
  display: flex;
  gap: 8px;
`

const AlarmBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
`

const AddRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  .mx-text {
    flex: 1;
    min-width: 90px;
    border: 1px solid ${mx.border};
    border-radius: 10px;
    padding: 7px 10px;
    font-size: 12px;
    color: ${mx.text};
    background: ${mx.soft2};
    outline: none;
    &:focus {
      border-color: ${mx.accent};
      box-shadow: 0 0 0 3px ${mx.accentSoft};
    }
  }
`

const AddBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  border-radius: 10px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: ${mx.gradient};
  cursor: pointer;
  transition: all 0.18s ease;
  &:hover {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }
`

const AlarmList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
`

const EmptyHint = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 0;
  font-size: 12px;
  color: ${mx.text3};
`

const AlarmItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  &:hover {
    background: ${mx.soft};
  }
  &.off {
    opacity: 0.55;
  }
`

const Toggle = styled.button`
  position: relative;
  width: 34px;
  height: 19px;
  border-radius: 999px;
  border: none;
  background: ${mx.border};
  cursor: pointer;
  transition: background 0.18s ease;
  flex-shrink: 0;
  span {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.18s ease;
    box-shadow: 0 1px 3px rgba(34, 49, 42, 0.2);
  }
  &.on {
    background: ${mx.accent};
    span {
      transform: translateX(15px);
    }
  }
`

const AlarmInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const AlarmTime = styled.div`
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${mx.text};
`

const AlarmMeta = styled.div`
  font-size: 10.5px;
  color: ${mx.text3};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const DelBtn = styled.button`
  border: none;
  background: none;
  color: ${mx.text3};
  font-size: 12px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  &:hover {
    color: ${mx.danger};
    background: rgba(239, 83, 80, 0.08);
  }
`

const CardRingingBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 10px;
  background: rgba(239, 83, 80, 0.08);
  border: 1px solid rgba(239, 83, 80, 0.28);
  box-shadow: 0 2px 8px rgba(239, 83, 80, 0.08);
  flex-shrink: 0;

  .alert-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .dot-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${mx.danger};
    box-shadow: 0 0 0 0 rgba(239, 83, 80, 0.7);
    animation: ${keyframes`
      0% {
        box-shadow: 0 0 0 0 rgba(239, 83, 80, 0.7);
      }
      70% {
        box-shadow: 0 0 0 6px rgba(239, 83, 80, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(239, 83, 80, 0);
      }
    `} 1.5s infinite;
    ${reduceMotion}
    flex-shrink: 0;
  }

  .alert-text {
    font-size: 12px;
    font-weight: 600;
    color: ${mx.danger};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const CardStopBtn = styled.button`
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #ef5350, #e53935);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(229, 57, 53, 0.28);
  flex-shrink: 0;
  transition: all 0.15s ease;

  &:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(229, 57, 53, 0.36);
  }

  &:active {
    transform: translateY(1px) scale(0.98);
    box-shadow: 0 1px 4px rgba(229, 57, 53, 0.2);
  }

  ${reduceMotion}
`

const VolumeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${mx.text2};
  input[type='range'] {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 5px;
    border-radius: 3px;
    background: ${mx.border};
    outline: none;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid ${mx.accent};
    cursor: pointer;
  }
`

const VolumeVal = styled.span`
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: ${mx.text3};
  min-width: 38px;
  text-align: right;
`

export default AlarmPanel
