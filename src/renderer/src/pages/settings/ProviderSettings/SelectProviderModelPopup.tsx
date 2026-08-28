import ModelSelector from '@renderer/components/ModelSelector'
import { TopView } from '@renderer/components/TopView'
import { isRerankModel } from '@renderer/config/models'
import { useTimer } from '@renderer/hooks/useTimer'
import { getModelUniqId } from '@renderer/services/ModelService'
import type { Model, Provider } from '@renderer/types'
import { Modal } from 'antd'
import { first } from 'lodash'
import { useCallback, useMemo, useState } from 'react'

interface ShowParams {
  provider: Provider
}

interface Props extends ShowParams {
  reject: (reason?: any) => void
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ provider, resolve, reject }) => {
  const [open, setOpen] = useState(true)
  const { setTimeoutTimer } = useTimer()

  // Keep the natural order of models
  const models = useMemo(() => provider.models.filter((m) => !isRerankModel(m)), [provider])

  const [model, setModel] = useState(first(models))

  const modelPredicate = useCallback((m: Model) => !isRerankModel(m), [])

  const defaultModelValue = useMemo(() => {
    return model ? getModelUniqId(model) : undefined
  }, [model])

  const onOk = () => {
    if (!model) {
      window.toast.error('请选择一个模型')
      return
    }
    setOpen(false)
    resolve(model)
  }

  const onCancel = () => {
    setOpen(false)
    setTimeoutTimer('onCancel', reject, 300)
  }

  const onClose = () => {
    TopView.hide(TopViewKey)
  }

  SelectProviderModelPopup.hide = onCancel

  return (
    <Modal
      title={'请选择要检测的模型'}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      transitionName="animation-move-down"
      width={400}
      centered>
      <ModelSelector
        providers={[provider]}
        predicate={modelPredicate}
        grouped={false}
        defaultValue={defaultModelValue}
        placeholder={'没有模型'}
        style={{ width: '100%' }}
        onChange={(value) => {
          setModel(models.find((m) => value === getModelUniqId(m)))
        }}
      />
    </Modal>
  )
}

const TopViewKey = 'SelectProviderModelPopup'

export default class SelectProviderModelPopup {
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show(props: ShowParams) {
    return new Promise<any>((resolve, reject) => {
      TopView.show(
        <PopupContainer
          {...props}
          reject={() => {
            reject()
            TopView.hide(TopViewKey)
          }}
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
