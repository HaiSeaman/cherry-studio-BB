import { importChatGPTConversations } from '@renderer/services/import'
import { Alert, Modal, Progress, Space, Spin } from 'antd'
import { useState } from 'react'

import { TopView } from '../TopView'

interface PopupResult {
  success?: boolean
}

interface Props {
  resolve: (data: PopupResult) => void
}

const PopupContainer: React.FC<Props> = ({ resolve }) => {
  const [open, setOpen] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const onOk = async () => {
    setSelecting(true)
    try {
      // Select ChatGPT JSON file
      const file = await window.api.file.open({
        filters: [{ name: 'ChatGPT Conversations', extensions: ['json'] }]
      })

      setSelecting(false)

      if (!file) {
        return
      }

      setImporting(true)

      // Parse file content
      const fileContent = typeof file.content === 'string' ? file.content : new TextDecoder().decode(file.content)

      // Import conversations
      const result = await importChatGPTConversations(fileContent)

      if (result.success) {
        window.toast.success(`成功导入 ${result.topicsCount} 个对话，共 ${result.messagesCount} 条消息`)
        setOpen(false)
      } else {
        window.toast.error(result.error || '导入失败，请检查文件格式')
      }
    } catch (error) {
      window.toast.error('导入失败，请检查文件格式')
      setOpen(false)
    } finally {
      setSelecting(false)
      setImporting(false)
    }
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  ImportPopup.hide = onCancel

  return (
    <Modal
      title={'导入 ChatGPT 对话'}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      okText={'选择文件'}
      okButtonProps={{ disabled: selecting || importing, loading: selecting }}
      cancelButtonProps={{ disabled: selecting || importing }}
      maskClosable={false}
      transitionName="animation-move-down"
      centered>
      {!selecting && !importing && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>{'仅导入对话文字，不携带图片和附件'}</div>
          <Alert
            message={'如何导出 ChatGPT 对话？'}
            description={
              <div>
                <p>{'1. 登录 ChatGPT，进入设置 > 数据控制 > 导出数据'}</p>
                <p>{'2. 等待邮件接收导出文件'}</p>
                <p>{'3. 解压下载的文件，找到 conversations.json'}</p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginTop: 12 }}
          />
        </Space>
      )}
      {selecting && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>{'正在选择文件...'}</div>
        </div>
      )}
      {importing && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Progress percent={100} status="active" strokeColor="var(--color-primary)" showInfo={false} />
          <div style={{ marginTop: 16 }}>{'正在导入对话...'}</div>
        </div>
      )}
    </Modal>
  )
}

const TopViewKey = 'ImportPopup'

export default class ImportPopup {
  static topviewId = 0
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show() {
    return new Promise<PopupResult>((resolve) => {
      TopView.show(
        <PopupContainer
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}
