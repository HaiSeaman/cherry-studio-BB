import { useCallback, useEffect, useRef, useState } from 'react'

import { audioEngine } from '../services/audioEngine'
import type { RadioStation } from '../types'

export type FmStatus = 'idle' | 'connecting' | 'playing' | 'paused' | 'error'

const PLAY_TIMEOUT_MS = 10_000
const ERROR_NEXT_DELAY_MS = 2_000

/** play() Promise 的良性中断（切换 src 打断上次播放等），忽略不当作错误 */
function isBenignPlayRejection(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  return e?.name === 'AbortError' || /interrupted/i.test(e?.message || '')
}

/**
 * FM 电台播放状态机（复刻音乐tab页.md §7.7）：
 * - play 后 10s 内未进入 playing 判失败
 * - 流错误延迟 2s 自动切下一台；连续失败达到列表总数则停止
 * - 网速：每秒采样 buffered 增量，无数据回退按码率估算
 */
export function useFmPlayer(stations: RadioStation[]) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<FmStatus>('idle')
  const statusRef = useRef(status)
  statusRef.current = status
  const [kbps, setKbps] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const stationsRef = useRef(stations)
  stationsRef.current = stations
  const currentUrlRef = useRef<string | null>(null)
  currentUrlRef.current = currentUrl
  const consecutiveErrors = useRef(0)
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorDelay = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speedTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimers = useCallback(() => {
    if (watchdog.current) clearTimeout(watchdog.current)
    watchdog.current = null
    if (errorDelay.current) clearTimeout(errorDelay.current)
    errorDelay.current = null
    if (speedTimer.current) clearInterval(speedTimer.current)
    speedTimer.current = null
  }, [])

  /** 流错误处理：计数 + 延迟自动切台（全部失败则停止） */
  const handleStreamError = useCallback(() => {
    const list = stationsRef.current
    consecutiveErrors.current += 1
    clearTimers()
    if (list.length === 0 || consecutiveErrors.current >= list.length) {
      setStatus('error')
      setErrorMsg('所有电台无法连接，请检查网络后重试')
      setCurrentUrl(null)
      audioEngine.stop()
      return
    }
    setStatus('error')
    errorDelay.current = setTimeout(() => {
      errorDelay.current = null
      nextRef.current(true)
    }, ERROR_NEXT_DELAY_MS)
  }, [clearTimers])

  const nextRef = useRef<(auto?: boolean) => void>(() => {})

  const play = useCallback(
    (url: string) => {
      clearTimers()
      setErrorMsg('')
      consecutiveErrors.current = 0
      setCurrentUrl(url)
      setStatus('connecting')
      audioEngine.load('fm', url)
      audioEngine.play().catch((err) => {
        if (!isBenignPlayRejection(err)) handleStreamError()
      })
      watchdog.current = setTimeout(() => {
        watchdog.current = null
        if (currentUrlRef.current === url) {
          audioEngine.pause()
          handleStreamError()
        }
      }, PLAY_TIMEOUT_MS)
    },
    [clearTimers, handleStreamError]
  )

  const next = useCallback(
    (_auto?: boolean) => {
      const list = stationsRef.current
      if (list.length === 0) return
      const idx = list.findIndex((s) => s.url === currentUrlRef.current)
      const nextIdx = idx < 0 ? 0 : (idx + 1) % list.length
      play(list[nextIdx].url)
    },
    [play]
  )
  nextRef.current = next

  const prev = useCallback(() => {
    const list = stationsRef.current
    if (list.length === 0) return
    const idx = list.findIndex((s) => s.url === currentUrlRef.current)
    const prevIdx = idx < 0 ? 0 : (idx - 1 + list.length) % list.length
    play(list[prevIdx].url)
  }, [play])

  const toggle = useCallback(() => {
    if (status === 'playing') {
      clearTimers()
      audioEngine.pause()
      setStatus('paused')
      return
    }
    if (status === 'paused' && currentUrlRef.current) {
      setStatus('connecting')
      audioEngine.play().catch((err) => {
        if (!isBenignPlayRejection(err)) handleStreamError()
      })
      watchdog.current = setTimeout(() => {
        watchdog.current = null
        handleStreamError()
      }, PLAY_TIMEOUT_MS)
      return
    }
    next()
  }, [status, clearTimers, handleStreamError, next])

  // 事件接线（一次）；网速采样在 playing 状态每秒刷新
  useEffect(() => {
    // 页面卸载后引擎继续播放（后台播放特性），重新挂载时恢复 UI 状态
    const snap = audioEngine.snapshot()
    if (snap.owner === 'fm' && snap.url && !snap.paused) {
      setCurrentUrl(snap.url)
      setStatus('playing')
    }

    const offs = [
      audioEngine.on('fm', 'playing', () => {
        consecutiveErrors.current = 0
        setStatus('playing')
        setErrorMsg('')
        if (watchdog.current) clearTimeout(watchdog.current)
        watchdog.current = null
        if (speedTimer.current) clearInterval(speedTimer.current)
        speedTimer.current = null
      }),
      audioEngine.on('fm', 'pause', () => {
        setStatus((s) => (s === 'playing' ? 'paused' : s))
      }),
      audioEngine.on('fm', 'error', () => {
        if (currentUrlRef.current) handleStreamError()
      }),
      audioEngine.on('fm', 'waiting', () => {
        setStatus((s) => (s === 'playing' ? 'connecting' : s))
      })
    ]
    const speedInterval = setInterval(() => {
      // 仅播放中采样网速：暂停/连接中不空转 setKbps 触发无谓渲染
      if (currentUrlRef.current && statusRef.current === 'playing') {
        const st = stationsRef.current.find((s) => s.url === currentUrlRef.current)
        setKbps(audioEngine.sampleBufferedKbps(st?.bitrate || 128))
      }
    }, 1000)
    audioEngine.onStop('fm', () => {
      clearTimers()
      setStatus('idle')
      setCurrentUrl(null)
      setKbps(0)
    })
    return () => {
      offs.forEach((off) => off())
      clearInterval(speedInterval)
      audioEngine.onStop('fm', null)
      clearTimers()
    }
  }, [clearTimers, handleStreamError])

  const currentStation = stations.find((s) => s.url === currentUrl) || null

  return { currentUrl, currentStation, status, kbps, errorMsg, play, toggle, prev, next }
}
