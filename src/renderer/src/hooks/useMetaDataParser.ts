import { useCallback, useEffect, useRef, useState } from 'react'

export function useMetaDataParser<T extends string>(
  link: string,
  properties: readonly T[],
  options?: {
    timeout?: number
  }
) {
  const { timeout = 5000 } = options || {}

  const [metadata, setMetadata] = useState<Record<T, string>>({} as Record<T, string>)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)

  const parseMetadata = useCallback(async () => {
    if (!link) return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(link, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)])
      })
      const htmlContent = await response.text()
      const parsedMetadata = {} as Record<T, string>

      const doc = new DOMParser().parseFromString(htmlContent, 'text/html')
      doc.querySelectorAll('meta').forEach((meta) => {
        const metaKey = meta.getAttribute('name') || meta.getAttribute('property')
        if (!metaKey || !properties.includes(metaKey as T)) return
        parsedMetadata[metaKey as T] = meta.getAttribute('content') || ''
      })

      setMetadata(parsedMetadata)
    } catch (err) {
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      setError(err instanceof Error ? err : new Error('Failed to fetch HTML'))
    } finally {
      // 只有「当前这轮请求」才能关掉 loading：上一轮被 abort 的请求
      // 也会走到 finally，若不加判断会把新一轮刚设的 true 抹成 false
      if (abortControllerRef.current === controller) {
        setIsLoading(false)
      }
    }
  }, [link, properties, timeout])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    metadata,
    isLoading,
    error,
    parseMetadata
  }
}
