import PrivacyPopup from '@renderer/components/Popups/PrivacyPopup'
import { TopView } from '@renderer/components/TopView'
import { LATEST_PRIVACY_POLICY_VERSION } from '@renderer/config/constant'
import { useAppDispatch } from '@renderer/store'
import { setPrivacyPolicyVersion } from '@renderer/store/settings'
import { Button, Modal } from 'antd'
import type { FC } from 'react'
import { useCallback, useState } from 'react'
interface Props {
  resolve: (data: any) => void
}

const PopupContainer: FC<Props> = ({ resolve }) => {
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(true)

  const acknowledgeLatestPrivacyPolicy = useCallback(() => {
    dispatch(setPrivacyPolicyVersion(LATEST_PRIVACY_POLICY_VERSION))
  }, [dispatch])

  const handleShowPrivacyPolicy = useCallback(() => {
    setOpen(false)
    void PrivacyPopup.show({
      acceptButtonText: '我知道了',
      force: true,
      modal: true,
      onAccepted: acknowledgeLatestPrivacyPolicy,
      quitOnDecline: false,
      showDeclineButton: false
    })
  }, [acknowledgeLatestPrivacyPolicy])

  const handleAcknowledge = useCallback(() => {
    acknowledgeLatestPrivacyPolicy()
    setOpen(false)
  }, [acknowledgeLatestPrivacyPolicy])

  const onClose = () => {
    resolve({})
  }

  PrivacyPolicyUpdateNotice.hide = () => setOpen(false)

  return (
    <Modal
      title={'隐私协议更新'}
      open={open}
      afterClose={onClose}
      transitionName="animation-move-down"
      centered
      closable={false}
      keyboard={false}
      maskClosable={false}
      footer={
        <Button type="primary" onClick={handleAcknowledge}>
          {'我知道了'}
        </Button>
      }>
      <div>
        {'我们更新了隐私协议。请查看最新的'}
        <Button type="link" onClick={handleShowPrivacyPolicy} style={{ padding: 0, height: 'auto' }}>
          {'隐私协议'}
        </Button>
      </div>
    </Modal>
  )
}

const TopViewKey = 'PrivacyPolicyUpdateNotice'

export default class PrivacyPolicyUpdateNotice {
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
