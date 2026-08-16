import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 倒计时（时间戳法防系统休眠漂移）：开始/暂停/恢复/重置，250ms 刷新，归零回调
 */
export function useCountdown(onFinish: () => void) {
  const [remainSec, setRemainSec] = useState(0)
  const [totalSec, setTotalSec] = useState(0)
  const [running, setRunning] = useState(false)
  const endTsRef = useRef(0)
  const remainRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const stopTick = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const tick = useCallback(() => {
    const remain = Math.max(0, Math.round((endTsRef.current - Date.now()) / 1000))
    if (remain !== remainRef.current) {
      remainRef.current = remain
      setRemainSec(remain)
    }
    if (remain <= 0) {
      stopTick()
      setRunning(false)
      onFinishRef.current()
    }
  }, [stopTick])

  const start = useCallback(
    (h: number, m: number, s: number) => {
      const total = Math.max(1, Math.round(h * 3600 + m * 60 + s))
      setTotalSec(total)
      setRemainSec(total)
      remainRef.current = total
      endTsRef.current = Date.now() + total * 1000
      setRunning(true)
      stopTick()
      timerRef.current = setInterval(tick, 250)
    },
    [stopTick, tick]
  )

  const pause = useCallback(() => {
    if (!running) return
    stopTick()
    setRunning(false)
  }, [running, stopTick])

  const resume = useCallback(() => {
    if (running || remainRef.current <= 0) return
    endTsRef.current = Date.now() + remainRef.current * 1000
    setRunning(true)
    stopTick()
    timerRef.current = setInterval(tick, 250)
  }, [running, stopTick, tick])

  const reset = useCallback(() => {
    stopTick()
    setRunning(false)
    setRemainSec(0)
    setTotalSec(0)
    remainRef.current = 0
  }, [stopTick])

  useEffect(() => stopTick, [stopTick])

  return { remainSec, totalSec, running, start, pause, resume, reset }
}
