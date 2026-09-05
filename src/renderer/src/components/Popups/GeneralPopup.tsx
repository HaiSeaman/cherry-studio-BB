import { TopView } from '@renderer/components/TopView'
import type { ModalProps } from 'antd'
import { Modal as AntdModal } from 'antd'
import type { ReactNode } from 'react'
import { useState } from 'react'
import styled from 'styled-components'

interface ShowParams extends ModalProps {
  content: ReactNode
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ content, resolve, onOk: restOnOk, onCancel: restOnCancel, ...rest }) => {
  const [open, setOpen] = useState(true)

  const onOk: NonNullable<ModalProps['onOk']> = (e) => {
    setOpen(false)
    // 调用方传入的 onOk 不应被默认关闭逻辑覆盖
    restOnOk?.(e)
  }

  const onCancel: NonNullable<ModalProps['onCancel']> = (e) => {
    setOpen(false)
    // 调用方传入的 onCancel 不应被默认关闭逻辑覆盖
    restOnCancel?.(e)
  }

  const onClose = () => {
    resolve({})
  }

  GeneralPopup.hide = () => {
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      centered
      transitionName="animation-move-down"
      {...rest}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}>
      {content}
    </Modal>
  )
}

const Modal = styled(AntdModal)`
  .ant-modal-close {
    top: 8px;
  }
`

const TopViewKey = 'GeneralPopup'

/** 在这个 Popup 中展示任意内容 */
export default class GeneralPopup {
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
