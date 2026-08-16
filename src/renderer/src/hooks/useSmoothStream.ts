import { useCallback, useEffect, useRef } from 'react'

interface UseSmoothStreamOptions {
  onUpdate: (text: string) => void
  streamDone: boolean
  minDelay?: number
  initialText?: string
}

const languages = ['en-US', 'de-DE', 'es-ES', 'zh-CN', 'zh-TW', 'ja-JP', 'ru-RU', 'el-GR', 'fr-FR', 'pt-PT', 'ro-RO']
const segmenter = new Intl.Segmenter(languages)

/**
 * 流式文本平滑渲染：
 * - 按 minDelay 节流合并（默认 66ms ≈ 15fps），避免每帧把全文交给下游（Markdown）重解析——
 *   60fps 全量重解析是流式卡顿主因
 * - 每次渲染排空整个队列：队列不积压，内存占用有界（不会随长回复增长）
 * - 队列空时不空转 rAF，由 addChunk 重新调度
 */
export const useSmoothStream = ({ onUpdate, streamDone, minDelay = 66, initialText = '' }: UseSmoothStreamOptions) => {
  const chunkQueueRef = useRef<string[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const displayedTextRef = useRef<string>(initialText)
  const lastUpdateTimeRef = useRef<number>(0)

  const addChunk = useCallback((chunk: string) => {
    const chars = Array.from(segmenter.segment(chunk)).map((s) => s.segment)
    chunkQueueRef.current.push(...chars)
    schedule()
  }, [])

  const reset = useCallback(
    (newText = '') => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      chunkQueueRef.current = []
      displayedTextRef.current = newText
      onUpdate(newText)
    },
    [onUpdate]
  )

  const renderLoopRef = useRef<(currentTime: number) => void>(() => {})

  const schedule = useCallback(() => {
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame((t) => renderLoopRef.current(t))
    }
  }, [])

  renderLoopRef.current = (currentTime: number) => {
    animationFrameRef.current = null
    if (chunkQueueRef.current.length === 0) {
      // 队列空：不空转；流结束且内容已全部渲染时保证最终状态
      if (streamDone) {
        onUpdate(displayedTextRef.current)
      }
      return
    }
    // 节流：距上次渲染不足 minDelay 则等下一帧
    if (currentTime - lastUpdateTimeRef.current < minDelay) {
      schedule()
      return
    }
    lastUpdateTimeRef.current = currentTime
    // 排空整个队列：合并窗口内到达的所有内容，一次渲染
    const charsToRender = chunkQueueRef.current
    chunkQueueRef.current = []
    displayedTextRef.current += charsToRender.join('')
    onUpdate(displayedTextRef.current)
    if (chunkQueueRef.current.length > 0) {
      schedule()
    }
  }

  useEffect(() => {
    // 流结束时若仍有排队内容（如最后一批尚未到渲染窗口），立即排空
    if (streamDone && chunkQueueRef.current.length > 0) {
      schedule()
    }
  }, [streamDone])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return { addChunk, reset }
}
