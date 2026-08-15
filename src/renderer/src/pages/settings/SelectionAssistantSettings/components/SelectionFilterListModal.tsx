import { isWin } from '@renderer/config/constant'
import { Button, Form, Input, Modal } from 'antd'
import type { FC } from 'react'
import { useEffect } from 'react'
import styled from 'styled-components'

interface SelectionFilterListModalProps {
  open: boolean
  onClose: () => void
  filterList?: string[]
  onSave: (list: string[]) => void
}

const SelectionFilterListModal: FC<SelectionFilterListModalProps> = ({ open, onClose, filterList = [], onSave }) => {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        filterList: (filterList || []).join('\n')
      })
    }
  }, [open, filterList, form])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const newList = (values.filterList as string)
        .trim()
        .toLowerCase()
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
      onSave([...new Set(newList)])
      onClose()
    } catch (error) {
      // validation failed
    }
  }

  return (
    <Modal
      title={'应用筛选名单'}
      open={open}
      onCancel={onClose}
      maskClosable={false}
      keyboard={true}
      destroyOnHidden
      footer={[
        <Button key="modal-cancel" onClick={onClose}>
          {'取消'}
        </Button>,
        <Button key="modal-save" type="primary" onClick={handleSave}>
          {'保存'}
        </Button>
      ]}>
      <UserTip>
        {isWin
          ? '请输入应用的执行文件名，每行一个，不区分大小写，可以模糊匹配。例如：chrome.exe、weixin.exe、Cherry Studio.exe等'
          : '请输入应用的Bundle ID，每行一个，不区分大小写，可以模糊匹配。例如：com.google.Chrome、com.apple.mail等'}
      </UserTip>
      <Form form={form} layout="vertical" initialValues={{ filterList: '' }}>
        <Form.Item name="filterList" noStyle>
          <StyledTextArea autoSize={{ minRows: 6, maxRows: 16 }} spellCheck={false} autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  )
}

const StyledTextArea = styled(Input.TextArea)`
  margin-top: 16px;
  width: 100%;
`

const UserTip = styled.div`
  font-size: 14px;
`

export default SelectionFilterListModal
