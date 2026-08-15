import { Button, Modal, Typography } from 'antd'
import type { FC } from 'react'
import styled from 'styled-components'

const { Text, Paragraph } = Typography

interface MacProcessTrustHintModalProps {
  open: boolean
  onClose: () => void
}

const MacProcessTrustHintModal: FC<MacProcessTrustHintModalProps> = ({ open, onClose }) => {
  const handleOpenAccessibility = () => {
    void window.api.shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    onClose()
  }

  const handleConfirm = async () => {
    void window.api.mac.requestProcessTrust()
    onClose()
  }

  return (
    <Modal
      title={'辅助功能权限'}
      open={open}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button type="link" style={{ color: 'var(--color-text-3)', fontSize: 12 }} onClick={handleOpenAccessibility}>
            {'打开辅助功能设置'}
          </Button>
          <Button type="primary" onClick={handleConfirm}>
            {'去设置'}
          </Button>
        </div>
      }
      centered
      destroyOnHidden>
      <ContentContainer>
        <Paragraph>
          <Text>
            划词助手需「<strong>辅助功能权限</strong>」才能正常工作。
          </Text>
        </Paragraph>
        <Paragraph>
          <Text>
            请点击「<strong>去设置</strong>」，并在稍后弹出的权限请求弹窗中点击 「<strong>打开系统设置</strong>」 按钮，
            然后在之后的应用列表中找到 「<strong>Cherry Studio</strong>」，并打开权限开关。
          </Text>
        </Paragraph>
        <Paragraph>
          <Text>完成设置后，请再次开启划词助手。</Text>
        </Paragraph>
      </ContentContainer>
    </Modal>
  )
}

const ContentContainer = styled.div`
  padding: 16px 0;
`

export default MacProcessTrustHintModal
