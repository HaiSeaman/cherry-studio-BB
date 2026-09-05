/**
 * Web Audio 纯代码合成闹钟铃声（复刻便签和闹钟.md §6.2，无音频文件依赖）：
 * - AudioContext + masterGain（音量 0-300%，>100% 增益放大）
 * - 后台/最小化时 AudioContext 被自动挂起，每次 tick 主动 resume
 * - playNote：ADSR 包络（线性起音 → 指数衰减）
 */

export type AlarmSoundType = 'default' | 'apple' | 'android' | 'nokia' | 'crystal' | 'bird' | 'electronic'

import type { CustomSound } from '../store/hubSettingsSlice'

export const ALARM_SOUND_OPTIONS: { value: AlarmSoundType; label: string }[] = [
  { value: 'default', label: '默认叮咚' },
  { value: 'apple', label: '苹果风格' },
  { value: 'android', label: '安卓风格' },
  { value: 'nokia', label: '诺基亚经典' },
  { value: 'crystal', label: '清脆铃声' },
  { value: 'bird', label: '鸟鸣' },
  { value: 'electronic', label: '电子闹钟' }
]

/** 铃声展示名：内置选项查表，自定义声音查自定义列表 */
export function soundLabel(sound: string, customs: CustomSound[]): string {
  if (sound.startsWith('custom:')) {
    return customs.find((s) => `custom:${s.id}` === sound)?.name ?? '自定义声音'
  }
  return ALARM_SOUND_OPTIONS.find((o) => o.value === sound)?.label ?? sound
}

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let volumePercent = 100
let ringing = false
let tickTimer: ReturnType<typeof setTimeout> | null = null
let previewTimer: ReturnType<typeof setTimeout> | null = null

function ensureCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = volumePercent / 100
    masterGain.connect(audioCtx.destination)
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

/** 基础音符：0→vol 线性起音 → 指数衰减到 0.001 */
function playNote(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType = 'sine',
  vol = 0.3
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain)
  gain.connect(masterGain ?? ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

/** 鸟鸣啁啾：2200→2800Hz 频率滑变 */
function playChirp(ctx: AudioContext, startTime: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(2200, startTime)
  osc.frequency.linearRampToValueAtTime(2800, startTime + 0.08)
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12)
  osc.connect(gain)
  gain.connect(masterGain ?? ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + 0.15)
}

type SoundFn = (ctx: AudioContext) => number

/** 7 种铃声：每个函数播放一个循环周期并返回周期时长 ms */
const SOUND_FNS: Record<AlarmSoundType, SoundFn> = {
  default: (ctx) => {
    const t = ctx.currentTime
    playNote(ctx, 880, t, 0.25, 'sine', 0.35)
    playNote(ctx, 660, t + 0.4, 0.35, 'sine', 0.35)
    return 800
  },
  apple: (ctx) => {
    const t = ctx.currentTime
    playNote(ctx, 523.25, t, 0.22, 'triangle', 0.3) // C5
    playNote(ctx, 659.25, t + 0.3, 0.22, 'triangle', 0.3) // E5
    playNote(ctx, 783.99, t + 0.6, 0.28, 'triangle', 0.3) // G5
    return 900
  },
  android: (ctx) => {
    const t = ctx.currentTime
    playNote(ctx, 660, t, 0.2, 'square', 0.18)
    playNote(ctx, 440, t + 0.35, 0.3, 'square', 0.18)
    return 700
  },
  nokia: (ctx) => {
    const t = ctx.currentTime
    playNote(ctx, 659.25, t, 0.12, 'sine', 0.3) // E5
    playNote(ctx, 587.33, t + 0.15, 0.12, 'sine', 0.3) // D5
    playNote(ctx, 698.46, t + 0.3, 0.12, 'sine', 0.3) // F5
    playNote(ctx, 783.99, t + 0.45, 0.12, 'sine', 0.3) // G5
    playNote(ctx, 523.25, t + 0.75, 0.4, 'sine', 0.3) // C5（八分音符加长）
    return 1800
  },
  crystal: (ctx) => {
    const t = ctx.currentTime
    playNote(ctx, 1760, t, 0.28, 'sine', 0.22) // A6
    playNote(ctx, 2093, t + 0.4, 0.28, 'sine', 0.22) // C7
    return 800
  },
  bird: (ctx) => {
    const t = ctx.currentTime
    playChirp(ctx, t)
    playChirp(ctx, t + 0.2)
    playChirp(ctx, t + 0.4)
    return 700
  },
  electronic: (ctx) => {
    const t = ctx.currentTime
    playNote(ctx, 1000, t, 0.12, 'square', 0.16)
    playNote(ctx, 1000, t + 0.25, 0.12, 'square', 0.16)
    playNote(ctx, 1000, t + 0.5, 0.12, 'square', 0.16)
    return 800
  }
}

class AlarmSounds {
  /** 自定义声音缓存（id → 解码后的 AudioBuffer），经 setCustomBuffer 注入 */
  private customBuffers = new Map<string, AudioBuffer>()
  private customSource: AudioBufferSourceNode | null = null

  /** 解码自定义声音文件（IPC 读出的二进制） */
  async decodeCustom(data: Uint8Array): Promise<AudioBuffer | null> {
    try {
      const ctx = ensureCtx()
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      return await ctx.decodeAudioData(buf)
    } catch {
      return null
    }
  }

  setCustomBuffer(id: string, buffer: AudioBuffer): void {
    this.customBuffers.set(id, buffer)
  }

  hasCustomBuffer(id: string): boolean {
    return this.customBuffers.has(id)
  }

  removeCustomBuffer(id: string): void {
    this.customBuffers.delete(id)
  }

  /** 开始循环响铃；sound 形如 'custom:<id>' 时走自定义 buffer（未缓存回退默认叮咚） */
  start(sound: string): void {
    if (ringing) return
    const customId = sound.startsWith('custom:') ? sound.slice(7) : null
    const buffer = customId ? this.customBuffers.get(customId) : null
    const ctx = ensureCtx()
    ringing = true
    // 恢复主增益（上次 stop 时为瞬时静音而归零）
    if (masterGain) masterGain.gain.value = volumePercent / 100
    if (buffer) {
      this.playCustomLoop(ctx, buffer)
      return
    }
    const tick = () => {
      if (!ringing) return
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const fn = SOUND_FNS[(sound as AlarmSoundType) in SOUND_FNS ? (sound as AlarmSoundType) : 'default']
      const interval = fn(ctx)
      tickTimer = setTimeout(tick, interval)
    }
    tick()
  }

  /** 自定义声音循环播放（loop=true 单节点，stop 时断开） */
  private playCustomLoop(ctx: AudioContext, buffer: AudioBuffer): void {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(masterGain ?? ctx.destination)
    source.start()
    this.customSource = source
  }

  stop(): void {
    ringing = false
    if (tickTimer) clearTimeout(tickTimer)
    tickTimer = null
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = null
    // 立即静音主增益：本周期已排期的音符（最长约 1.2s）自然播完但不再可闻，关闭即安静
    if (masterGain) masterGain.gain.value = 0
    if (this.customSource) {
      try {
        this.customSource.stop()
      } catch {
        // 已停止的节点 stop 抛错，忽略
      }
      this.customSource.disconnect()
      this.customSource = null
    }
  }

  isRinging(): boolean {
    return ringing
  }

  /** 选择铃声时试听：响 1.5 秒自动停；闹钟响铃中直接忽略，避免掐断正在响的闹钟 */
  preview(sound: string): void {
    if (ringing) return
    this.start(sound)
    previewTimer = setTimeout(() => {
      previewTimer = null
      this.stop()
    }, 1500)
  }

  setVolume(percent: number): void {
    volumePercent = Math.min(Math.max(percent, 0), 300)
    if (masterGain) masterGain.gain.value = volumePercent / 100
  }

  getVolume(): number {
    return volumePercent
  }
}

export const alarmSounds = new AlarmSounds()
