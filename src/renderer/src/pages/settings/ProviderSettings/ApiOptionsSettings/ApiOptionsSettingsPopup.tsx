import { TopView } from '@renderer/components/TopView'
import { Modal } from 'antd'
import { useState } from 'react'

import ApiOptionsSettings from './ApiOptionsSettings'

interface ShowParams {
  providerId: string
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ providerId, resolve }) => {
  const [open, setOpen] = useState(true)

  const onOk = () => {
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  ApiOptionsSettingsPopup.hide = onCancel

  return (
    <Modal
      title={'API 设置'}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      transitionName="animation-move-down"
      styles={{ body: { padding: '20px 16px' } }}
      footer={null}
      centered>
      <ApiOptionsSettings providerId={providerId} />
    </Modal>
  )
}

const TopViewKey = 'ApiOptionsSettingsPopup'

export default class ApiOptionsSettingsPopup {
  static topviewId = 0
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show(props: ShowParams) {
    return new Promise<any>((resolve) => {
      TopView.show(
        <PopupContainer
          {...props}
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
