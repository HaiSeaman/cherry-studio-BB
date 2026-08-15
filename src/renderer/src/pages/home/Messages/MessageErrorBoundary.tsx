import { isProd } from '@renderer/config/constant'
import { Alert } from 'antd'
import React from 'react'
interface Props {
  fallback?: React.ReactNode
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

const ErrorFallback = ({ fallback, error }: { fallback?: React.ReactNode; error?: Error }) => {
  // 如果有详细错误信息，添加到描述中
  const errorDescription =
    !isProd && error
      ? `${'消息内容渲染失败，请检查消息内容格式是否正确'}: ${error.message}`
      : '消息内容渲染失败，请检查消息内容格式是否正确'

  return fallback || <Alert message={'渲染错误'} description={errorDescription} type="error" showIcon />
}

class MessageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback fallback={this.props.fallback} error={this.state.error} />
    }
    return this.props.children
  }
}

export default MessageErrorBoundary
