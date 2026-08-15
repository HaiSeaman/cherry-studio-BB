import { formatErrorMessage } from '@renderer/utils/error'
import { Button } from 'antd'
import { Alert, Space } from 'antd'
import type { ComponentType, ReactNode } from 'react'
import type { FallbackProps } from 'react-error-boundary'
import { ErrorBoundary } from 'react-error-boundary'
import styled from 'styled-components'
const DefaultFallback: ComponentType<FallbackProps> = (props: FallbackProps): ReactNode => {
  const { error } = props
  const debug = async () => {
    await window.api.devTools.toggle()
  }
  const reload = async () => {
    await window.api.reload()
  }
  return (
    <ErrorContainer>
      <Alert
        message={'似乎出现了一些问题...'}
        showIcon
        description={formatErrorMessage(error)}
        type="error"
        action={
          <Space>
            <Button size="small" onClick={debug}>
              {'打开调试面板'}
            </Button>
            <Button size="small" onClick={reload}>
              {'重新加载'}
            </Button>
          </Space>
        }
      />
    </ErrorContainer>
  )
}

const ErrorBoundaryCustomized = ({
  children,
  fallbackComponent
}: {
  children: ReactNode
  fallbackComponent?: ComponentType<FallbackProps>
}) => {
  return <ErrorBoundary FallbackComponent={fallbackComponent ?? DefaultFallback}>{children}</ErrorBoundary>
}

const ErrorContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 8px;
`

export { ErrorBoundaryCustomized as ErrorBoundary }
