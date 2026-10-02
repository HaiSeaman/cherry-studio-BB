import { loggerService } from '@logger'
import { message } from 'antd'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

/** 目标采样率：16kHz（与服务商要求一致） */
export const TARGET_SAMPLE_RATE = 16000
/** 100ms 音频样本数 @16k（3200 字节 = 1600 个 Int16 样本） */
export const CHUNK_SAMPLES = 1600

const logger = loggerService.withContext('useVoiceInput')

/**
 * 「语音输入进行中」的全局标记：从按下快捷键开始，到主进程给出终态（done/error）为止。
 *
 * 用途：输入框在语音注入期间必须关掉自动高度 —— 受控 textarea 每变一次值，
 * rc-textarea 都要重新测量 scrollHeight（强制同步重排），一次识别结果就是十几次重排。
 *
 * 为什么不用 Redux：useVoiceInput 是挂在 App 顶层（Provider 之外）的，取不到 store；
 * 这里用一个极小的订阅表，任何组件都能安全订阅。
 */
let voiceInputActive = false
const activeListeners = new Set<() => void>()

export function isVoiceInputActive(): boolean {
  return voiceInputActive
}

export function subscribeVoiceInputActive(listener: () => void): () => void {
  activeListeners.add(listener)
  return () => activeListeners.delete(listener)
}

/** 组件用的订阅版本 */
export function useVoiceInputActive(): boolean {
  return useSyncExternalStore(subscribeVoiceInputActive, isVoiceInputActive)
}

function setVoiceInputActive(next: boolean): void {
  if (voiceInputActive === next) return
  voiceInputActive = next
  for (const listener of activeListeners) listener()
}

/** 抗混叠低通的抽头数：41 抽头 @48k 的过渡带约 3.9kHz，足以把 8kHz 以上压到可忽略 */
const ANTI_ALIAS_TAPS = 41
/** 低通截止频率：目标奈奎斯特（8kHz）留一点过渡带 */
const ANTI_ALIAS_CUTOFF_HZ = (TARGET_SAMPLE_RATE / 2) * 0.9

/** 按输入采样率设计低通 FIR（汉明窗 sinc），并把直流增益归一化为 1 */
function designAntiAliasFilter(inputRate: number): Float32Array {
  const center = (ANTI_ALIAS_TAPS - 1) / 2
  const coeffs = new Float32Array(ANTI_ALIAS_TAPS)
  let sum = 0
  for (let i = 0; i < ANTI_ALIAS_TAPS; i++) {
    const x = i - center
    const sinc =
      x === 0
        ? (2 * ANTI_ALIAS_CUTOFF_HZ) / inputRate
        : Math.sin((2 * Math.PI * ANTI_ALIAS_CUTOFF_HZ * x) / inputRate) / (Math.PI * x)
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (ANTI_ALIAS_TAPS - 1)) // 汉明窗
    coeffs[i] = sinc * window
    sum += coeffs[i]
  }
  for (let i = 0; i < ANTI_ALIAS_TAPS; i++) coeffs[i] /= sum
  return coeffs
}

let cachedFilterRate = 0
let cachedFilter: Float32Array | null = null

/** 同一个采样率反复用同一份系数（每块音频都要跑，不该每次重算） */
function getAntiAliasFilter(inputRate: number): Float32Array {
  if (cachedFilter && cachedFilterRate === inputRate) return cachedFilter
  cachedFilter = designAntiAliasFilter(inputRate)
  cachedFilterRate = inputRate
  return cachedFilter
}

/** 直接卷积（历史不足的部分按 0 处理：只在开头几十微秒有影响） */
function applyAntiAliasFilter(samples: Float32Array, coeffs: Float32Array): Float32Array {
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const from = Math.max(0, i - coeffs.length + 1)
    let acc = 0
    for (let j = from; j <= i; j++) acc += samples[j] * coeffs[i - j]
    out[i] = acc
  }
  return out
}

/**
 * 把任意采样率的 Float32 音频重采样为 16kHz 的 Int16 PCM（-1~1 → int16，超界裁剪）。
 *
 * 降采样前必须先抗混叠：只做分段均值的话，超过 8kHz 奈奎斯特的分量不会消失，
 * 而是折叠回可听频段变成一层假音（实测 10kHz 还能漏进 48.9%），
 * 同时 6kHz 的齿音被削掉 20% —— 识别引擎本来就靠辅音分辨字，这直接拉低准确率。
 */
export function resampleTo16k(samples: Float32Array, inputRate: number): Int16Array {
  if (inputRate <= 0 || samples.length === 0) return new Int16Array(0)
  // 上采样/1:1 不需要抗混叠
  const source =
    inputRate > TARGET_SAMPLE_RATE ? applyAntiAliasFilter(samples, getAntiAliasFilter(inputRate)) : samples
  const ratio = inputRate / TARGET_SAMPLE_RATE
  const outLen = Math.floor(source.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    // 抗混叠已由上面的低通完成，这里只取样。
    // 不能再做分段均值：均值本身也是个低通，两级串联会把 6kHz 的齿音二次削掉约 20%。
    const index = Math.min(Math.floor(i * ratio), source.length - 1)
    const clamped = Math.max(-1, Math.min(1, source[index]))
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

export interface PcmChunker {
  /** 送入一块原始音频（任意采样率），内部重采样并按 100ms 分包回调 */
  push: (block: Float32Array) => void
  /** 交出不足一块的余量（收尾用，避免丢尾音），交完清空 */
  flush: () => Int16Array<ArrayBuffer>
}

/**
 * 把任意采样率的音频块重采样成 16k 单声道 PCM，并按 100ms 一块回调出去。
 * 抽出来单独测：分包边界（不足一块不许发、够一块立刻发、余量留到下一批）最容易写错。
 */
export function createPcmChunker(
  sampleRate: number,
  onChunk: (chunk: Int16Array<ArrayBuffer>) => void
): PcmChunker {
  let accumulated: Int16Array = new Int16Array(0)

  return {
    push(block: Float32Array): void {
      accumulated = concatPcm(accumulated, resampleTo16k(block, sampleRate))
      while (accumulated.length >= CHUNK_SAMPLES) {
        onChunk(accumulated.slice(0, CHUNK_SAMPLES))
        accumulated = accumulated.slice(CHUNK_SAMPLES)
      }
    },

    flush(): Int16Array<ArrayBuffer> {
      // 复制一份交出去：调用方拿到的 .buffer 必须是恰好大小的（直接送 IPC，不能带上多余字节）
      const rest = accumulated.slice(0)
      accumulated = new Int16Array(0)
      return rest
    }
  }
}

/** 录音链路：AudioWorklet 与 ScriptProcessor 两种实现，对外只暴露「断开」 */
interface CaptureChain {
  disconnect: () => void
}

/** 采集处理器文件名必须与 worklet 里的 registerProcessor 名字一致 */
const WORKLET_PROCESSOR_NAME = 'voice-capture'

/**
 * worklet 从「同源静态文件」加载：文件放在 `src/renderer/public/` 下由 Vite 原样拷贝，
 * 运行时按 `document.baseURI` 解析出同源 URL。
 *
 * 为什么不放在 src 里 import：Vite 会把小于 4KB 的资源内联成 `data:` URL（构建产物实测如此），
 * 而页面 CSP 是 `script-src 'self'` —— data:/blob: 都会被拦掉，addModule 失败后只能退回
 * ScriptProcessor，等于白装这条优化。
 *
 * 懒算而不是模块级常量：模块求值时机可能早于 document 就绪。
 */
export function resolveWorkletUrl(): URL {
  return new URL('voiceCapture.worklet.js', document.baseURI)
}

/**
 * 首选：AudioWorklet。处理跑在音频线程，主线程忙的时候音频只会排队、不会丢。
 * 拿不到（打包路径不对 / 运行环境不支持）时返回 null，由调用方退回 ScriptProcessor。
 */
async function createWorkletChain(
  context: AudioContext,
  stream: MediaStream,
  onBlock: (block: Float32Array) => void
): Promise<CaptureChain | null> {
  try {
    await context.audioWorklet.addModule(resolveWorkletUrl())
    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, WORKLET_PROCESSOR_NAME)
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      onBlock(event.data)
    }
    source.connect(node)
    node.connect(context.destination)
    return {
      disconnect: () => {
        node.port.onmessage = null
        source.disconnect()
        node.disconnect()
      }
    }
  } catch (error) {
    logger.warn(`AudioWorklet 不可用，退回 ScriptProcessor：${(error as Error).message}`)
    return null
  }
}

/**
 * 回退：ScriptProcessorNode。它的回调跑在界面主线程上，主线程一忙音频就会被丢掉
 * （这正是"话说一半识别结果开始乱"的根源之一），所以只在 AudioWorklet 不可用时用。
 */
function createScriptProcessorChain(
  context: AudioContext,
  stream: MediaStream,
  onBlock: (block: Float32Array) => void
): CaptureChain {
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  processor.onaudioprocess = (event) => onBlock(event.inputBuffer.getChannelData(0))
  source.connect(processor)
  processor.connect(context.destination)
  return {
    disconnect: () => {
      processor.onaudioprocess = null
      source.disconnect()
      processor.disconnect()
    }
  }
}

interface CaptureRef {
  stream: MediaStream
  context: AudioContext
  chain: CaptureChain
  chunker: PcmChunker
}

/**
 * 全局语音输入录音：订阅主进程键盘钩子广播的 begin/end 事件，
 * getUserMedia 录音 → 重采样 16k Int16 PCM → 每 100ms 一块经 IPC 推给主进程。
 */
export function useVoiceInput(): void {
  const captureRef = useRef<CaptureRef | null>(null)
  /**
   * 录音轮次编号：每次开始录音 +1，每次结束也 +1（把还在路上的启动作废）。
   * getUserMedia 是异步的，开始/结束可能都落在它返回之前 —— 用一个布尔开关会分不清
   * 「这一轮被取消了」和「主人又按了一次开了新一轮」，于是两条录音链路都会建起来：
   * 前一条永远没人停（麦克风常亮、CPU 越用越高），两路音频还会同时推给同一个识别会话。
   */
  const sessionRef = useRef(0)

  const startCapture = useCallback(async () => {
    if (captureRef.current) return
    const session = ++sessionRef.current
    // 用外部变量接住「拿到一半」的资源：中途失败时要把它们自己收掉
    let stream: MediaStream | null = null
    let context: AudioContext | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      if (session !== sessionRef.current) {
        // 这一轮已经被取消（松手早于 getUserMedia 返回）或已被新一轮取代：直接释放，不建立录音链路
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      context = new AudioContext()
      const chunker = createPcmChunker(context.sampleRate, (chunk) => window.api.voiceInput.sendAudio(chunk.buffer))
      const onBlock = (block: Float32Array) => chunker.push(block)

      const chain =
        (await createWorkletChain(context, stream, onBlock)) ?? createScriptProcessorChain(context, stream, onBlock)

      // 建链路是异步的：期间主人可能已经松手，或者又按了一次开了新一轮
      if (session !== sessionRef.current) {
        chain.disconnect()
        stream.getTracks().forEach((track) => track.stop())
        void context.close().catch(() => undefined)
        return
      }

      captureRef.current = { stream, context, chain, chunker }
    } catch (error) {
      logger.error(`无法开始录音：${(error as Error).message}`)
      // 麦克风 / 音频上下文可能已经拿到一半了：必须在这里自己收掉，否则设备会一直开着
      stream?.getTracks().forEach((track) => track.stop())
      if (context) void context.close().catch(() => undefined)
      // 只有「还是当前这一轮」才清状态并提示 ——
      // 否则上一轮迟到的失败会把新一轮刚建好的链路引用清掉，那条链路就永远没人释放了
      if (session === sessionRef.current) {
        captureRef.current = null
        void message.error('无法访问麦克风，请检查系统设置中的麦克风权限与设备')
      }
    }
  }, [])

  const stopCapture = useCallback(() => {
    // 轮次 +1：把还在路上的 getUserMedia 作废，否则它返回后会再建一条没人管的录音链路
    sessionRef.current++
    const ref = captureRef.current
    captureRef.current = null
    if (ref) {
      // 收尾：剩余不足一块的音频也推出去（避免丢尾音）
      const rest = ref.chunker.flush()
      if (rest.length > 0) {
        window.api.voiceInput.sendAudio(rest.buffer)
      }
      ref.chain.disconnect()
      ref.stream.getTracks().forEach((track) => track.stop())
      void ref.context.close().catch(() => undefined)
    }
    // 无论录音是否真的启动过，都通知主进程收尾（防止识别会话悬挂）
    window.api.voiceInput.finalize()
  }, [])

  useEffect(() => {
    const offBegin = window.api.voiceInput.onBeginCapture(() => {
      setVoiceInputActive(true)
      void startCapture()
    })
    const offEnd = window.api.voiceInput.onEndCapture(() => stopCapture())
    const offState = window.api.voiceInput.onState((state) => {
      if (state === 'error') {
        void message.error('语音识别出错：请检查识别服务密钥与网络，或查看日志')
      }
      // 只有主进程给出终态才算这一轮结束：done 之前还要上屏最终校正，那期间同样不能打开自动高度。
      // error 必须一起处理，否则输入框会一直停在"不自动增高"的状态。
      if (state === 'done' || state === 'error') setVoiceInputActive(false)
    })
    return () => {
      offBegin()
      offEnd()
      offState()
    }
  }, [startCapture, stopCapture])
}