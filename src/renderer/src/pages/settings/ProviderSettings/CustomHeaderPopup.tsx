import CodeEditor from '@renderer/components/CodeEditor'
import { TopView } from '@renderer/components/TopView'
import { useProvider } from '@renderer/hooks/useProvider'
import type { Provider } from '@renderer/types'
import { Modal, Space } from 'antd'
import { useCallback, useState } from 'react'

import { SettingHelpText } from '..'

interface ShowParams {
  provider: Provider
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ provider, resolve }) => {
  const [open, setOpen] = useState(true)
  const { updateProvider } = useProvider(provider.id)

  const headers = JSON.stringify(provider.extra_headers || {}, null, 2)

  const [headerText, setHeaderText] = useState<string>(headers)

  const onUpdateHeaders = useCallback(() => {
    try {
      const headers = headerText.trim() ? JSON.parse(headerText) : {}

      updateProvider({ ...provider, extra_headers: headers })

      window.toast.success('保存成功')
    } catch (error) {
      window.toast.error('JSON 格式错误')
    }
  }, [headerText, provider, updateProvider])

  const onOk = () => {
    onUpdateHeaders()
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  CustomHeaderPopup.hide = onCancel

  return (
    <Modal
      title={'自定义请求头'}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      maskClosable={false}
      transitionName="animation-move-down"
      centered>
      <Space.Compact direction="vertical" style={{ width: '100%', marginTop: 5 }}>
        <SettingHelpText>{'自定义请求头 (json 格式)'}</SettingHelpText>
        <CodeEditor
          value={headerText}
          language="json"
          onChange={(value) => setHeaderText(value)}
          placeholder={`{\n  "Header-Name": "Header-Value"\n}`}
          height="60vh"
          expanded={false}
          wrapped
          options={{
            lint: true,
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            keymap: true
          }}
        />
      </Space.Compact>
    </Modal>
  )
}

const TopViewKey = 'CustomHeaderPopup'

export default class CustomHeaderPopup {
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
