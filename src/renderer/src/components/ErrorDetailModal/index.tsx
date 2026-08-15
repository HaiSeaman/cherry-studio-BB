import CodeViewer from '@renderer/components/CodeViewer'
import GeneralPopup from '@renderer/components/Popups/GeneralPopup'
import { useCodeStyle } from '@renderer/context/CodeStyleProvider'
import type { DiagnosisContext, DiagnosisResult } from '@renderer/services/ErrorDiagnosisService'
import type { SerializedAiSdkError, SerializedAiSdkErrorUnion, SerializedError } from '@renderer/types/error'
import {
  isSerializedAiSdkAPICallError,
  isSerializedAiSdkDownloadError,
  isSerializedAiSdkError,
  isSerializedAiSdkErrorUnion,
  isSerializedAiSdkInvalidArgumentError,
  isSerializedAiSdkInvalidDataContentError,
  isSerializedAiSdkInvalidMessageRoleError,
  isSerializedAiSdkInvalidPromptError,
  isSerializedAiSdkInvalidToolInputError,
  isSerializedAiSdkJSONParseError,
  isSerializedAiSdkMessageConversionError,
  isSerializedAiSdkNoObjectGeneratedError,
  isSerializedAiSdkNoSpeechGeneratedError,
  isSerializedAiSdkNoSuchModelError,
  isSerializedAiSdkNoSuchProviderError,
  isSerializedAiSdkNoSuchToolError,
  isSerializedAiSdkRetryError,
  isSerializedAiSdkToolCallRepairError,
  isSerializedAiSdkTooManyEmbeddingValuesForCallError,
  isSerializedAiSdkTypeValidationError,
  isSerializedAiSdkUnsupportedFunctionalityError,
  isSerializedError
} from '@renderer/types/error'
import { formatAiSdkError, formatError, safeToString } from '@renderer/utils/error'
import { parseDataUrl } from '@shared/utils'
import { Button } from 'antd'
import { CheckCircle, Copy, Loader2, Stethoscope } from 'lucide-react'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import Scrollbar from '../Scrollbar'
import AIDiagnosisSectionWithStatus from './AIDiagnosisSection'

/**
 * Escape a string for safe injection via dangerouslySetInnerHTML.
 * Used for the error-cause fallback path where content is untrusted
 * (AI/API error responses may contain raw HTML).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface ErrorDetailContentProps {
  error?: SerializedError
  diagnosisContext?: DiagnosisContext
  blockId?: string
  cachedDiagnosis?: DiagnosisResult
}

const truncateLargeData = (data: string): { content: string; truncated: boolean; isLikelyBase64: boolean } => {
  const parsed = parseDataUrl(data)
  const isLikelyBase64 = parsed?.isBase64 ?? false

  if (!data || data.length <= 100_000) {
    return { content: data, truncated: false, isLikelyBase64 }
  }

  if (isLikelyBase64) {
    return {
      content: '[Base64 图片数据已截断]',
      truncated: true,
      isLikelyBase64: true
    }
  }

  return {
    content: data.slice(0, 100_000) + '\n\n... [数据已截断]',
    truncated: true,
    isLikelyBase64: false
  }
}

// --- Styled Components ---

const ErrorDetailContainer = styled(Scrollbar)`
  max-height: 60vh;
  padding-right: 5px;
`

const ErrorDetailList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const ErrorDetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const ErrorDetailLabel = styled.div`
  font-weight: 600;
  color: var(--color-text);
  font-size: 14px;
`

const ErrorDetailValue = styled.div`
  font-family: var(--code-font-family);
  font-size: 12px;
  padding: 8px;
  background: var(--color-code-background);
  border-radius: 4px;
  border: 1px solid var(--color-border);
  word-break: break-word;
  color: var(--color-text);
`

const StackTrace = styled.div`
  background: var(--color-background-soft);
  border: 1px solid var(--color-error);
  border-radius: 6px;
  padding: 12px;

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--code-font-family);
    font-size: 12px;
    line-height: 1.4;
    color: var(--color-error);
  }
`

const TruncatedBadge = styled.span`
  margin-left: 8px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: normal;
  color: var(--color-warning);
  background: var(--color-warning-bg, rgba(250, 173, 20, 0.1));
  border-radius: 4px;
`

// --- Sub-Components ---

const BuiltinError = memo(({ error }: { error: SerializedError }) => {
  return (
    <>
      {error.name && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'错误名称'}:</ErrorDetailLabel>
          <ErrorDetailValue className="selectable">{error.name}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
      {error.message && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'错误信息'}:</ErrorDetailLabel>
          <ErrorDetailValue className="selectable">{error.message}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
      {error.stack && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'堆栈信息'}:</ErrorDetailLabel>
          <StackTrace>
            <pre>{error.stack}</pre>
          </StackTrace>
        </ErrorDetailItem>
      )}
    </>
  )
})

const AiSdkErrorBase = memo(({ error }: { error: SerializedAiSdkError }) => {
  const { highlightCode } = useCodeStyle()
  const [highlightedString, setHighlightedString] = useState('')
  const [isTruncated, setIsTruncated] = useState(false)
  const cause = error.cause

  useEffect(() => {
    const highlight = async () => {
      try {
        const { content: truncatedCause, truncated, isLikelyBase64 } = truncateLargeData(cause || '')
        setIsTruncated(truncated)

        if (isLikelyBase64) {
          // Escape too: a misjudged "base64" cause must not be injected raw
          setHighlightedString(escapeHtml(truncatedCause))
          return
        }

        try {
          const parsed = JSON.parse(truncatedCause || '{}')
          const formatted = JSON.stringify(parsed, null, 2)
          const result = await highlightCode(formatted, 'json')
          setHighlightedString(result)
        } catch {
          // Fallback: escape the raw cause so it can never be interpreted as HTML
          // when injected via dangerouslySetInnerHTML below.
          setHighlightedString(escapeHtml(truncatedCause || ''))
        }
      } catch {
        setHighlightedString(escapeHtml(cause || ''))
      }
    }
    const timer = setTimeout(highlight, 0)

    return () => clearTimeout(timer)
  }, [highlightCode, cause])

  return (
    <>
      <BuiltinError error={error} />
      {cause && (
        <ErrorDetailItem>
          <ErrorDetailLabel>
            {'错误原因'}:{isTruncated && <TruncatedBadge>{'已截断'}</TruncatedBadge>}
          </ErrorDetailLabel>
          <ErrorDetailValue>
            <div
              className="markdown [&_pre]:bg-transparent! [&_pre_span]:whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: highlightedString }}
            />
          </ErrorDetailValue>
        </ErrorDetailItem>
      )}
    </>
  )
})

const TruncatedCodeViewer = memo(
  ({ value, label, language = 'json' }: { value: string; label: string; language?: string }) => {
    const { content, truncated, isLikelyBase64 } = truncateLargeData(value)

    return (
      <ErrorDetailItem>
        <ErrorDetailLabel>
          {label}:{truncated && <TruncatedBadge>{'已截断'}</TruncatedBadge>}
        </ErrorDetailLabel>
        {isLikelyBase64 ? (
          <ErrorDetailValue>{content}</ErrorDetailValue>
        ) : (
          <CodeViewer value={content} className="source-view selectable" language={language} expanded />
        )}
      </ErrorDetailItem>
    )
  }
)

const AiSdkError = memo(({ error }: { error: SerializedAiSdkErrorUnion }) => {
  return (
    <ErrorDetailList>
      {(isSerializedAiSdkAPICallError(error) || isSerializedAiSdkDownloadError(error)) && error.url && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'请求路径'}:</ErrorDetailLabel>
          <ErrorDetailValue className="selectable">{error.url}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkAPICallError(error) && error.responseBody && (
        <TruncatedCodeViewer value={error.responseBody} label={'响应内容'} />
      )}

      {(isSerializedAiSdkAPICallError(error) || isSerializedAiSdkDownloadError(error)) && error.statusCode && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'状态码'}:</ErrorDetailLabel>
          <ErrorDetailValue className="selectable">{error.statusCode}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkAPICallError(error) && (
        <>
          {error.responseHeaders && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'响应首部'}:</ErrorDetailLabel>
              <CodeViewer
                value={JSON.stringify(error.responseHeaders, null, 2)}
                className="source-view"
                language="json"
                expanded
              />
            </ErrorDetailItem>
          )}

          {error.requestBodyValues && (
            <TruncatedCodeViewer value={safeToString(error.requestBodyValues)} label={'请求体'} />
          )}

          {error.data && <TruncatedCodeViewer value={safeToString(error.data)} label={'数据'} />}
        </>
      )}

      {isSerializedAiSdkDownloadError(error) && error.statusText && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'状态文本'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.statusText}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidArgumentError(error) && error.parameter && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'参数'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.parameter}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {(isSerializedAiSdkInvalidArgumentError(error) || isSerializedAiSdkTypeValidationError(error)) && error.value && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'值'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.value)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidDataContentError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'内容'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.content)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidMessageRoleError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'角色'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.role}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidPromptError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'提示词'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.prompt)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidToolInputError(error) && (
        <>
          {error.toolName && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'工具名'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.toolName}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.toolInput && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'工具输入'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.toolInput}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {(isSerializedAiSdkJSONParseError(error) || isSerializedAiSdkNoObjectGeneratedError(error)) && error.text && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'文本'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.text}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkMessageConversionError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'原消息'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.originalMessage)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoSpeechGeneratedError(error) && error.responses && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'响应'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.responses.join(', ')}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoObjectGeneratedError(error) && (
        <>
          {error.response && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'响应'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.response)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.usage && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'用量'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.usage)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.finishReason && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'结束原因'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.finishReason}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {(isSerializedAiSdkNoSuchModelError(error) ||
        isSerializedAiSdkNoSuchProviderError(error) ||
        isSerializedAiSdkTooManyEmbeddingValuesForCallError(error)) &&
        error.modelId && (
          <ErrorDetailItem>
            <ErrorDetailLabel>{'模型 ID'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.modelId}</ErrorDetailValue>
          </ErrorDetailItem>
        )}

      {(isSerializedAiSdkNoSuchModelError(error) || isSerializedAiSdkNoSuchProviderError(error)) && error.modelType && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'模型类型'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.modelType}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoSuchProviderError(error) && (
        <>
          <ErrorDetailItem>
            <ErrorDetailLabel>{'提供商 ID'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.providerId}</ErrorDetailValue>
          </ErrorDetailItem>

          <ErrorDetailItem>
            <ErrorDetailLabel>{'可用提供商'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.availableProviders.join(', ')}</ErrorDetailValue>
          </ErrorDetailItem>
        </>
      )}

      {isSerializedAiSdkNoSuchToolError(error) && (
        <>
          <ErrorDetailItem>
            <ErrorDetailLabel>{'工具名'}:</ErrorDetailLabel>
            <ErrorDetailValue>{error.toolName}</ErrorDetailValue>
          </ErrorDetailItem>
          {error.availableTools && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'可用工具'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.availableTools?.join(', ') || '无'}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkRetryError(error) && (
        <>
          {error.reason && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'原因'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.reason}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.lastError && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'最后错误'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.lastError)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.errors && error.errors.length > 0 && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'错误'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.errors.map((e) => safeToString(e)).join('\n\n')}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkTooManyEmbeddingValuesForCallError(error) && (
        <>
          {error.provider && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'提供商'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.provider}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.maxEmbeddingsPerCall && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'每次调用的最大嵌入'}:</ErrorDetailLabel>
              <ErrorDetailValue>{error.maxEmbeddingsPerCall}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.values && (
            <ErrorDetailItem>
              <ErrorDetailLabel>{'值'}:</ErrorDetailLabel>
              <ErrorDetailValue>{safeToString(error.values)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkToolCallRepairError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'原错误'}:</ErrorDetailLabel>
          <ErrorDetailValue>{safeToString(error.originalError)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkUnsupportedFunctionalityError(error) && (
        <ErrorDetailItem>
          <ErrorDetailLabel>{'功能'}:</ErrorDetailLabel>
          <ErrorDetailValue>{error.functionality}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      <AiSdkErrorBase error={error} />
    </ErrorDetailList>
  )
})

// --- Main Content Component ---

const ErrorDetailContent: React.FC<ErrorDetailContentProps> = ({
  error,
  diagnosisContext,
  blockId,
  cachedDiagnosis
}) => {
  const [diagStatus, setDiagStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(cachedDiagnosis ? 'done' : 'idle')
  const diagSectionRef = useRef<{ runDiagnosis: () => void }>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInitialRenderRef = useRef(true)

  // Scroll to bottom when diagnosis status changes, but skip initial render
  useEffect(() => {
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false
      return
    }

    if (diagStatus !== 'idle') {
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
  }, [diagStatus])

  const copyErrorDetails = useCallback(() => {
    if (!error) {
      return
    }

    let errorText: string
    if (isSerializedAiSdkError(error)) {
      errorText = formatAiSdkError(error)
    } else if (isSerializedError(error)) {
      errorText = formatError(error)
    } else {
      errorText = safeToString(error)
    }

    void navigator.clipboard.writeText(errorText)
    window.toast.success('已复制')
  }, [error])

  const renderErrorDetails = (error?: SerializedError) => {
    if (!error) {
      return <div>{'未知错误'}</div>
    }

    if (isSerializedAiSdkErrorUnion(error)) {
      return <AiSdkError error={error} />
    }

    return (
      <ErrorDetailList>
        <BuiltinError error={error} />
      </ErrorDetailList>
    )
  }

  const handleDiagnose = () => {
    if (diagStatus === 'loading') return
    setDiagStatus('loading')
    diagSectionRef.current?.runDiagnosis()
  }

  const getDiagButtonText = () => {
    switch (diagStatus) {
      case 'loading':
        return '正在诊断' + '...'
      case 'done':
        return '已诊断'
      default:
        return 'AI 诊断'
    }
  }

  return (
    <>
      <ErrorDetailContainer ref={containerRef}>
        {renderErrorDetails(error)}
        {diagStatus !== 'idle' && (
          <AIDiagnosisSectionWithStatus
            key={blockId ?? error?.message}
            ref={diagSectionRef}
            error={error}
            status={diagStatus}
            onStatusChange={setDiagStatus}
            diagnosisContext={diagnosisContext}
            blockId={blockId}
            cachedDiagnosis={cachedDiagnosis}
          />
        )}
      </ErrorDetailContainer>
      <div className="my-2 mt-4 flex justify-end gap-2">
        <Button color="default" icon={<Copy size={14} />} onClick={copyErrorDetails}>
          {'复制'}
        </Button>
        <Button
          type="primary"
          disabled={diagStatus === 'loading'}
          icon={
            diagStatus === 'loading' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : diagStatus === 'done' ? (
              <CheckCircle size={14} />
            ) : (
              <Stethoscope size={14} />
            )
          }
          onClick={handleDiagnose}>
          {getDiagButtonText()}
        </Button>
      </div>
    </>
  )
}

export function showErrorDetailPopup(params: ErrorDetailContentProps) {
  void GeneralPopup.show({
    title: '错误详情',
    content: <ErrorDetailContent {...params} />,
    footer: null,
    width: '60vw',
    style: { maxWidth: '1200px', minWidth: '600px' }
  })
}

export { ErrorDetailContent }
export type { ErrorDetailContentProps }
