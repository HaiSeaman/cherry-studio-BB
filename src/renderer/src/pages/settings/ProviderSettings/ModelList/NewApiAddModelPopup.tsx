import { TopView } from '@renderer/components/TopView'
import { endpointTypeOptions } from '@renderer/config/endpointTypes'
import { isNotSupportTextDeltaModel } from '@renderer/config/models'
import { getDynamicLabelWidth } from '@renderer/hooks/useDynamicLabelWidth'
import { useProvider } from '@renderer/hooks/useProvider'
import type { EndpointType, Model, Provider } from '@renderer/types'
import { getDefaultGroupName } from '@renderer/utils'
import { isNewApiProvider } from '@renderer/utils/provider'
import type { FormProps } from 'antd'
import { Button, Flex, Form, Input, Modal, Select } from 'antd'
import { find } from 'lodash'
import { useState } from 'react'
interface ShowParams {
  title: string
  provider: Provider
  model?: Model
  endpointType?: EndpointType
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

type FieldType = {
  provider: string
  id: string
  name?: string
  group?: string
  endpointType?: EndpointType
}

const PopupContainer: React.FC<Props> = ({ title, provider, resolve, model, endpointType }) => {
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
      group: values.group ?? getDefaultGroupName(id),
      endpoint_type: isNewApiProvider(provider) ? values.endpointType : undefined
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
        labelCol={{ style: { width: getDynamicLabelWidth(['端点类型']) } }}
        labelAlign="left"
        colon={false}
        style={{ marginTop: 25 }}
        onFinish={onFinish}
        initialValues={
          model
            ? {
                id: model.id,
                name: model.name,
                group: model.group,
                endpointType: endpointType ?? 'openai'
              }
            : {
                endpointType: endpointType ?? 'openai'
              }
        }>
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
        <Form.Item
          name="endpointType"
          label={'端点类型'}
          tooltip={'选择 API 的端点类型格式'}
          rules={[{ required: true, message: '请选择端点类型' }]}>
          <Select placeholder={'选择端点类型'}>
            {endpointTypeOptions.map((opt) => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
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

export default class NewApiAddModelPopup {
  static hide() {
    TopView.hide('NewApiAddModelPopup')
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
        'NewApiAddModelPopup'
      )
    })
  }
}
