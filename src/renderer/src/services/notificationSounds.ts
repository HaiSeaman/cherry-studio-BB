/**
 * 通知提示音播放：
 * - 未配置本地文件（sound='default'）→ Web Audio 合成一段柔和"叮"提示音（无文件依赖，主/后台都能播）
 * - 配置了本地文件（sound='custom:<filePath>'）→ 经 IPC 读取二进制，decodeAudioData 播放一次
 * 与闹钟声音各自独立（各自持有 AudioContext），互不干扰。
 */
import { loggerService } from '@logger'

let audioCtx: AudioContext | null = null

function ensureCtx(): AudioContext | null {
  try {
    if (typeof AudioContext === 'undefined') return null
    if (!audioCtx) {
      audioCtx = new AudioContext()
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

/** 合成默认"叮"：两个正弦音阶上行，音量温和 */
function playDefaultBeep(): void {
  const ctx = ensureCtx()
  if (!ctx) return
  const t = ctx.currentTime
  const notes: [number, number, number][] = [
    // [频率, 起始时间, 时长]
    [880, 0, 0.18],
    [1174.66, 0.18, 0.28]
  ]
  const master = ctx.createGain()
  master.gain.value = 0.25
  master.connect(ctx.destination)
  const sources: OscillatorNode[] = []
  for (const [freq, start, dur] of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t + start)
    gain.gain.linearRampToValueAtTime(0.5, t + start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t + start)
    osc.stop(t + start + dur + 0.02)
    sources.push(osc)
  }
  // 播放完毕后断开节点，避免通知频繁触发时 AudioContext 节点堆积
  const endTime = t + notes[notes.length - 1][1] + notes[notes.length - 1][2] + 0.12
  setTimeout(
    () => {
      for (const s of sources) {
        try {
          s.disconnect()
        } catch {
          // 已断开的节点忽略
        }
      }
      try {
        master.disconnect()
      } catch {
        // 已断开的节点忽略
      }
    },
    Math.max(0, (endTime - ctx.currentTime) * 1000)
  )
}

async function playCustomFile(filePath: string): Promise<void> {
  const ctx = ensureCtx()
  if (!ctx) return
  try {
    const res = await window.api.music.readAudioFile(filePath)
    if (!res?.success || !res.data) {
      playDefaultBeep()
      return
    }
    const buf = res.data.buffer.slice(res.data.byteOffset, res.data.byteOffset + res.data.byteLength) as ArrayBuffer
    const audioBuf = await ctx.decodeAudioData(buf)
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = 0.8
    source.buffer = audioBuf
    source.connect(gain)
    gain.connect(ctx.destination)
    // 播放完毕断开节点，避免频繁通知时节点堆积
    source.onended = () => {
      try {
        source.disconnect()
      } catch {
        // 已断开的节点忽略
      }
      try {
        gain.disconnect()
      } catch {
        // 已断开的节点忽略
      }
    }
    source.start()
  } catch (e) {
    loggerService.withContext('notificationSounds').warn('播放自定义通知声音失败，回退默认音', e as Error)
    playDefaultBeep()
  }
}

/** 播放通知提示音（sound 形如 'custom:<path>' 时播放本地文件，否则默认叮） */
export function playNotificationSound(sound: string): void {
  if (sound.startsWith('custom:')) {
    const filePath = sound.slice('custom:'.length)
    void playCustomFile(filePath)
    return
  }
  playDefaultBeep()
}
