import { loggerService } from '@logger'
import { message } from 'antd'
import { useCallback, useEffect, useRef } from 'react'

/** 目标采样率：16kHz（与服务商要求一致） */
export const TARGET_SAMPLE_RATE = 16000
/** 100ms 音频样本数 @16k（3200 字节 = 1600 个 Int16 样本） */
export const CHUNK_SAMPLES = 1600

const logger = loggerService.withContext('useVoiceInput')

/**
 * 把任意采样率的 Float32 音频重采样为 16kHz 的 Int16 PCM（-1~1 → int16，超界裁剪）。
 * 降采样用分段均值，避免简单抽点损失幅度。
 */
export function resampleTo16k(samples: Float32Array, inputRate: number): Int16Array {
  if (inputRate <= 0 || samples.length === 0) return new Int16Array(0)
  const ratio = inputRate / TARGET_SAMPLE_RATE
  const outLen = Math.floor(samples.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), samples.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j]
    const avg = sum / (end - start)
    const clamped = Math.max(-1, Math.min(1, avg))
    out[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767)
  }
  return out
}

/** 拼接两个 PCM 块 */
export function concatPcm(a: Int16Array, b: Int16Array): Int16Array {
  const out = new Int16Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

interface CaptureRef {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  accumulated: Int16Array
}

/**
 * 全局语音输入录音：订阅主进程键盘钩子广播的 begin/end 事件，
 * getUserMedia 录音 → 重采样 16k Int16 PCM → 每 100ms 一块经 IPC 推给主进程。
 */
export function useVoiceInput(): void {
  const captureRef = useRef<CaptureRef | null>(null)
  /** 本轮录音是否已被要求停止（用于 end 早于录音启动完成的竞态：启动完成后立即释放，不推流） */
  const stoppedRef = useRef(false)

  const startCapture = useCallback(async () => {
    if (captureRef.current) return
    stoppedRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      if (stoppedRef.current) {
        // end 已在启动完成前到达：直接释放流，不建立录音链路
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const ref: CaptureRef = { stream, context, source, processor, accumulated: new Int16Array(0) }
      captureRef.current = ref

      processor.onaudioprocess = (event) => {
        const pcm = resampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate)
        let accumulated = concatPcm(ref.accumulated, pcm)
        while (accumulated.length >= CHUNK_SAMPLES) {
          const chunk = accumulated.slice(0, CHUNK_SAMPLES)
          accumulated = accumulated.slice(CHUNK_SAMPLES)
          window.api.voiceInput.sendAudio(chunk.buffer)
        }
        ref.accumulated = accumulated
      }

      source.connect(processor)
      processor.connect(context.destination)
    } catch (error) {
      // 麦克风权限被拒/设备不可用：结束本轮并提示（主进程会话由 finalize 收尾）
      captureRef.current = null
      logger.error(`无法开始录音：${(error as Error).message}`)
      void message.error('无法访问麦克风，请检查系统设置中的麦克风权限与设备')
    }
  }, [])

  const stopCapture = useCallback(() => {
    stoppedRef.current = true
    const ref = captureRef.current
    captureRef.current = null
    if (ref) {
      // 收尾：剩余不足一块的音频也推出去（避免丢尾音）
      if (ref.accumulated.length > 0) {
        window.api.voiceInput.sendAudio(ref.accumulated.slice(0).buffer)
      }
      ref.processor.disconnect()
      ref.source.disconnect()
      ref.stream.getTracks().forEach((track) => track.stop())
      void ref.context.close().catch(() => undefined)
    }
    // 无论录音是否真的启动过，都通知主进程收尾（防止识别会话悬挂）
    window.api.voiceInput.finalize()
  }, [])

  useEffect(() => {
    const offBegin = window.api.voiceInput.onBeginCapture(() => {
      void startCapture()
    })
    const offEnd = window.api.voiceInput.onEndCapture(() => stopCapture())
    const offState = window.api.voiceInput.onState((state) => {
      if (state === 'error') {
        void message.error('语音识别出错：请检查识别服务密钥与网络，或查看日志')
      }
    })
    return () => {
      offBegin()
      offEnd()
      offState()
    }
  }, [startCapture, stopCapture])
}