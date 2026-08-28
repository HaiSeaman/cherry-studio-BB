import { TopView } from '@renderer/components/TopView'
import { Modal } from 'antd'
import { useState } from 'react'

import MiniAppSettings from './MiniAppSettings'

interface Props {
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ resolve }) => {
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

  MinappSettingsPopup.hide = onCancel

  return (
    <Modal
      open={open}
      onOk={onOk}
      width="80vw"
      title={'小程序显示设置'}
      onCancel={onCancel}
      afterClose={onClose}
      footer={null}
      transitionName="animation-move-down"
      centered>
      <MiniAppSettings />
    </Modal>
  )
}

const TopViewKey = 'MinappSettingsPopup'

export default class MinappSettingsPopup {
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show() {
    return new Promise<any>((resolve) => {
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
