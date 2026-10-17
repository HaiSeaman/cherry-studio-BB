import { loggerService } from '@logger'
import { containsSupportedVariables, replacePromptVariables } from '@renderer/utils/prompt'
import { useEffect, useState } from 'react'

const logger = loggerService.withContext('usePromptProcessor')

interface PromptProcessor {
  prompt: string
  modelName?: string
}

export function usePromptProcessor({ prompt, modelName }: PromptProcessor): string {
  const [processedPrompt, setProcessedPrompt] = useState(prompt)

  useEffect(() => {
    // prompt / modelName 流式变化会频繁重跑；旧的异步结果后返回会覆盖新结果。
    // 用 cancelled 只让「最后一次」生效，同时避免卸载后 setState。
    let cancelled = false

    const processPrompt = async () => {
      try {
        if (containsSupportedVariables(prompt)) {
          const result = await replacePromptVariables(prompt, modelName)
          if (!cancelled) setProcessedPrompt(result)
        } else {
          if (!cancelled) setProcessedPrompt(prompt)
        }
      } catch (error) {
        if (cancelled) return
        logger.error('Failed to process prompt variables, falling back:', error as Error)
        setProcessedPrompt(prompt)
      }
    }

    void processPrompt()

    return () => {
      cancelled = true
    }
  }, [prompt, modelName])

  return processedPrompt
}
