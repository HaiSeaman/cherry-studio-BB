import { TopView } from '@renderer/components/TopView'
import { isNotSupportTextDeltaModel } from '@renderer/config/models'
import { useProvider } from '@renderer/hooks/useProvider'
import type { Model, Provider } from '@renderer/types'
import { getDefaultGroupName } from '@renderer/utils'
import type { FormProps } from 'antd'
import { Button, Flex, Form, Input, Modal } from 'antd'
import { find } from 'lodash'
import { useState } from 'react'
interface ShowParams {
  title: string
  provider: Provider
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

type FieldType = {
  provider: string
  id: string
  name?: string
  group?: string
}

const PopupContainer: React.FC<Props> = ({ title, provider, resolve }) => {
  const [open, setOpen] = useState(true)
  const [form] = Form.useForm()
  const { addModel, models } = useProvider(provider.id)
  const onOk = () => {
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  const onAddModel = (values: FieldType) => {
    const id = values.id.trim()

    if (find(models, { id })) {
      window.toast.error('模型已存在')
      return
    }

    const model: Model = {
      id,
      provider: provider.id,
      name: values.name ? values.name : id.toUpperCase(),
      group: values.group ?? getDefaultGroupName(id)
    }

    addModel({ ...model, supported_text_delta: !isNotSupportTextDeltaModel(model) })

    return true
  }

  const onFinish: FormProps<FieldType>['onFinish'] = (values) => {
    const id = values.id.trim().replaceAll('，', ',')

    if (id.includes(',')) {
      const ids = id.split(',')
      ids.forEach((id) => onAddModel({ id, name: id } as FieldType))
      resolve({})
      return
    }

    if (onAddModel(values)) {
      resolve({})
    }
  }

  return (
    <Modal
      title={title}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      maskClosable={false}
      afterClose={onClose}
      footer={null}
      transitionName="animation-move-down"
      centered>
      <Form
        form={form}
        labelCol={{ flex: '110px' }}
        labelAlign="left"
        colon={false}
        style={{ marginTop: 25 }}
        onFinish={onFinish}>
        <Form.Item name="id" label={'模型 ID'} tooltip={'例如 gpt-3.5-turbo'} rules={[{ required: true }]}>
          <Input
            placeholder={'必填 例如 gpt-3.5-turbo'}
            spellCheck={false}
            maxLength={200}
            onChange={(e) => {
              form.setFieldValue('name', e.target.value)
              form.setFieldValue('group', getDefaultGroupName(e.target.value, provider.id))
            }}
          />
        </Form.Item>
        <Form.Item name="name" label={'模型名称'} tooltip={'例如 GPT-4'}>
          <Input placeholder={'例如 GPT-4'} spellCheck={false} />
        </Form.Item>
        <Form.Item name="group" label={'分组名称'} tooltip={'例如 ChatGPT'}>
          <Input placeholder={'例如 ChatGPT'} spellCheck={false} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 8, textAlign: 'center' }}>
          <Flex justify="end" align="center" style={{ position: 'relative' }}>
            <Button type="primary" htmlType="submit" size="middle">
              {'添加模型'}
            </Button>
          </Flex>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default class AddModelPopup {
  static hide() {
    TopView.hide('AddModelPopup')
  }
  static show(props: ShowParams) {
    return new Promise<any>((resolve) => {
      TopView.show(
        <PopupContainer
          {...props}
          resolve={(v) => {
            resolve(v)
            this.hide()
          }}
        />,
        'AddModelPopup'
      )
    })
  }
}
