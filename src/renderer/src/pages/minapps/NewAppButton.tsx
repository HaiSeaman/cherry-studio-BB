import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { loadCustomMiniApp, ORIGIN_DEFAULT_MIN_APPS, updateAllMinApps } from '@renderer/config/minapps'
import { useMinapps } from '@renderer/hooks/useMinapps'
import type { MinAppType } from '@renderer/types'
import { Button, Form, Input, Modal, Radio, Upload } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import type { FC } from 'react'
import { useState } from 'react'
import styled from 'styled-components'

interface Props {
  size?: number
}

const logger = loggerService.withContext('NewAppButton')

const NewAppButton: FC<Props> = ({ size = 60 }) => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [logoType, setLogoType] = useState<'url' | 'file'>('url')
  const [form] = Form.useForm()
  const { minapps, updateMinapps } = useMinapps()

  const handleLogoTypeChange = (e: any) => {
    setLogoType(e.target.value)
    form.setFieldValue('logo', '')
    setFileList([])
  }

  const handleAddCustomApp = async (values: any) => {
    try {
      // 与 loadCustomMiniApp 一致：文件缺失（被删除）时按空列表处理，写入时自动重建，
      // 否则删除 custom-minapps.json 后保存永远失败
      let content: string
      try {
        content = await window.api.file.read('custom-minapps.json')
      } catch {
        content = '[]'
      }
      const customApps = JSON.parse(content)

      // Check for duplicate ID
      if (customApps.some((app: MinAppType) => app.id === values.id)) {
        window.toast.error(`发现重复的 ID: ${values.id}`)
        return
      }
      if (ORIGIN_DEFAULT_MIN_APPS.some((app: MinAppType) => app.id === values.id)) {
        window.toast.error(`与默认应用 ID 冲突: ${values.id}`)
        return
      }

      const newApp: MinAppType = {
        id: values.id,
        name: values.name,
        url: values.url,
        logo: form.getFieldValue('logo') || '',
        type: 'Custom',
        addTime: new Date().toISOString()
      }
      customApps.push(newApp)
      await window.api.file.writeWithId('custom-minapps.json', JSON.stringify(customApps, null, 2))
      window.toast.success('自定义小程序保存成功')
      setIsModalVisible(false)
      form.resetFields()
      setFileList([])
      const reloadedApps = [...ORIGIN_DEFAULT_MIN_APPS, ...(await loadCustomMiniApp())]
      updateAllMinApps(reloadedApps)
      updateMinapps([...minapps, newApp])
    } catch (error) {
      window.toast.error('自定义小程序保存失败')
      logger.error('Failed to save custom mini app:', error as Error)
    }
  }

  const handleFileChange = async (info: any) => {
    const file = info.fileList[info.fileList.length - 1]?.originFileObj
    setFileList(info.fileList.slice(-1))

    if (file) {
      try {
        const reader = new FileReader()
        reader.onload = (event) => {
          const base64Data = event.target?.result
          if (typeof base64Data === 'string') {
            window.toast.success('Logo 上传成功')
            form.setFieldValue('logo', base64Data)
          }
        }
        reader.readAsDataURL(file)
      } catch (error) {
        logger.error('Failed to read file:', error as Error)
        window.toast.error('Logo 上传失败')
      }
    }
  }

  return (
    <>
      <Container onClick={() => setIsModalVisible(true)}>
        <AddButton size={size}>
          <PlusOutlined />
        </AddButton>
        <AppTitle>{'自定义'}</AppTitle>
      </Container>
      <Modal
        title={'编辑自定义小程序'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          setFileList([])
        }}
        maskClosable={false}
        footer={null}
        transitionName="animation-move-down"
        centered>
        <Form form={form} onFinish={handleAddCustomApp} layout="vertical">
          <Form.Item name="id" label={'ID'} rules={[{ required: true, message: 'ID 是必填项' }]}>
            <Input placeholder={'请输入 ID'} />
          </Form.Item>
          <Form.Item name="name" label={'名称'} rules={[{ required: true, message: '名称是必填项' }]}>
            <Input placeholder={'请输入名称'} />
          </Form.Item>
          <Form.Item name="url" label={'URL'} rules={[{ required: true, message: 'URL 是必填项' }]}>
            <Input placeholder={'请输入 URL'} />
          </Form.Item>
          <Form.Item label={'Logo'}>
            <Radio.Group value={logoType} onChange={handleLogoTypeChange}>
              <Radio value="url">{'Logo URL'}</Radio>
              <Radio value="file">{'上传 Logo 文件'}</Radio>
            </Radio.Group>
          </Form.Item>
          {logoType === 'url' ? (
            <Form.Item name="logo" label={'Logo URL'}>
              <Input placeholder={'请输入 Logo URL'} />
            </Form.Item>
          ) : (
            <Form.Item label={'上传 Logo'}>
              <Upload
                accept="image/*"
                maxCount={1}
                fileList={fileList}
                onChange={handleFileChange}
                beforeUpload={() => false}>
                <Button icon={<UploadOutlined />}>{'上传'}</Button>
              </Upload>
            </Form.Item>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit">
              {'保存'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`

const AddButton = styled.div<{ size?: number }>`
  width: ${({ size }) => size || 60}px;
  height: ${({ size }) => size || 60}px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-soft);
  border: 1px dashed var(--color-border);
  color: var(--color-text-soft);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-background);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`

const AppTitle = styled.div`
  font-size: 12px;
  margin-top: 5px;
  color: var(--color-text-soft);
  text-align: center;
  user-select: none;
  white-space: nowrap;
`

export default NewAppButton
