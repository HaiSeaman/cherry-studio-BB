import { loggerService } from '@logger'
import { Center, VStack } from '@renderer/components/Layout'
import { ProviderAvatarPrimitive } from '@renderer/components/ProviderAvatar'
import ProviderLogoPicker from '@renderer/components/ProviderLogoPicker'
import { TopView } from '@renderer/components/TopView'
import { PROVIDER_LOGO_MAP } from '@renderer/config/providers'
import ImageStorage from '@renderer/services/ImageStorage'
import type { Provider, ProviderType } from '@renderer/types'
import { compressImage, generateColorFromChar, getForegroundColor } from '@renderer/utils'
import { Divider, Dropdown, Form, Input, Modal, Popover, Select, Upload } from 'antd'
import type { ItemType } from 'antd/es/menu/interface'
import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

const logger = loggerService.withContext('AddProviderPopup')

interface Props {
  provider?: Provider
  resolve: (result: { name: string; type: ProviderType; apiHost?: string; logo?: string; logoFile?: File }) => void
}

/** 视频生成商家模板：作为「提供商类型」选项展示，选中后自动预填名称与官方 API 地址（创建后仍可在服务商设置里修改地址）。
 *  内部存储统一走 openai 类型（视频适配器按 apiHost 域名路由），不新增 ProviderType。 */
const VIDEO_TYPE_TEMPLATES: Record<string, { name: string; apiHost: string; hint: string }> = {
  'dashscope-video': {
    name: '百炼视频',
    apiHost: 'https://dashscope.aliyuncs.com',
    hint: 'API 地址已预填官方通用域名；若你有业务空间专属接入点，可改为 https://你的空间ID.cn-beijing.maas.aliyuncs.com（只填根域名，路径由程序拼接）。密钥填百炼 API Key。'
  },
  'ark-video': {
    name: '火山视频',
    apiHost: 'https://ark.cn-beijing.volces.com/api/v3',
    hint: 'API 地址已预填火山方舟官方接入点。密钥填方舟 API Key，模型名如 doubao-seedance-1-0-pro-250528。'
  },
  'hunyuan-video': {
    name: '混元视频',
    apiHost: 'https://vclm.tencentcloudapi.com',
    hint: 'API 密钥请按「SecretId:SecretKey」格式填写（半角冒号分隔），在腾讯云控制台 API 密钥管理中获取。模型走混元生视频 vclm 接口。'
  }
}

const PROVIDER_TYPE_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI-Response', value: 'openai-response' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Azure OpenAI', value: 'azure-openai' },
  { label: 'New API', value: 'new-api' },
  { label: 'CherryIN', value: 'cherryin-type' },
  { label: 'Ollama', value: 'ollama' },
  ...Object.keys(VIDEO_TYPE_TEMPLATES).map((key) => ({
    label: {
      'dashscope-video': '阿里云百炼 · 视频生成',
      'ark-video': '火山豆包 · 视频生成',
      'hunyuan-video': '腾讯混元 · 视频生成'
    }[key],
    value: key
  }))
]

const PopupContainer: React.FC<Props> = ({ provider, resolve }) => {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState(provider?.name || '')
  const [type, setType] = useState<ProviderType>(provider?.type || 'openai')
  const [displayType, setDisplayType] = useState<string>(provider?.type || 'openai')
  const [logo, setLogo] = useState<string | null>(null)
  const [logoPickerOpen, setLogoPickerOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const uploadRef = useRef<HTMLDivElement>(null)

  const videoTemplate = VIDEO_TYPE_TEMPLATES[displayType]

  useEffect(() => {
    if (provider?.id) {
      const loadLogo = async () => {
        try {
          const logoData = await ImageStorage.get(`provider-${provider.id}`)
          if (logoData) {
            setLogo(logoData)
          }
        } catch (error) {
          logger.error('Failed to load logo', error as Error)
        }
      }
      void loadLogo()
    }
  }, [provider])

  const onOk = async () => {
    setOpen(false)

    // 返回结果，但不包含文件对象，因为文件已经直接保存到 ImageStorage
    const result = {
      name: name.trim(),
      type,
      apiHost: videoTemplate?.apiHost,
      logo: logo || undefined
    }
    resolve(result)
  }

  const onCancel = () => {
    setOpen(false)
    resolve({ name: '', type: 'openai' })
  }

  const onClose = () => {
    resolve({
      name: name.trim(),
      type,
      apiHost: videoTemplate?.apiHost,
      logo: logo || undefined
    })
  }

  const buttonDisabled = name.trim().length === 0

  // 处理内置头像的点击事件
  const handleProviderLogoClick = async (providerId: string) => {
    try {
      const logoUrl = PROVIDER_LOGO_MAP[providerId]

      if (provider?.id) {
        await ImageStorage.set(`provider-${provider.id}`, logoUrl)
        const savedLogo = await ImageStorage.get(`provider-${provider.id}`)
        setLogo(savedLogo)
      } else {
        setLogo(logoUrl)
      }

      setLogoPickerOpen(false)
    } catch (error: any) {
      window.toast.error(error.message)
    }
  }

  const handleReset = async () => {
    try {
      setLogo(null)

      if (provider?.id) {
        await ImageStorage.set(`provider-${provider.id}`, '')
      }

      setDropdownOpen(false)
    } catch (error: any) {
      window.toast.error(error.message)
    }
  }

  const getInitials = () => {
    return name.charAt(0) || 'P'
  }

  const items = [
    {
      key: 'upload',
      label: (
        <Upload
          customRequest={() => {}}
          accept="image/png, image/jpeg, image/gif"
          itemRender={() => null}
          maxCount={1}
          onChange={async ({ file }) => {
            try {
              const _file = file.originFileObj as File
              let logoData: string | Blob

              if (_file.type === 'image/gif') {
                logoData = _file
              } else {
                logoData = await compressImage(_file)
              }

              if (provider?.id) {
                if (logoData instanceof Blob && !(logoData instanceof File)) {
                  const fileFromBlob = new File([logoData], 'logo.png', { type: logoData.type })
                  await ImageStorage.set(`provider-${provider.id}`, fileFromBlob)
                } else {
                  await ImageStorage.set(`provider-${provider.id}`, logoData)
                }
                const savedLogo = await ImageStorage.get(`provider-${provider.id}`)
                setLogo(savedLogo)
              } else {
                // 临时保存在内存中，等创建 provider 后会在调用方保存
                const tempUrl = await new Promise<string>((resolve) => {
                  const reader = new FileReader()
                  reader.onload = () => resolve(reader.result as string)
                  reader.readAsDataURL(logoData)
                })
                setLogo(tempUrl)
              }
              setDropdownOpen(false)
            } catch (error: any) {
              window.toast.error(error.message)
            }
          }}>
          <MenuItem ref={uploadRef}>{'图片上传'}</MenuItem>
        </Upload>
      ),
      onClick: (e: any) => {
        e.stopPropagation()
        uploadRef.current?.click()
      }
    },
    {
      key: 'builtin',
      label: <MenuItem>{'内置头像'}</MenuItem>,
      onClick: () => {
        setDropdownOpen(false)
        setLogoPickerOpen(true)
      }
    },
    {
      key: 'reset',
      label: <MenuItem>{'重置头像'}</MenuItem>,
      onClick: handleReset
    }
  ] satisfies ItemType[]

  // for logo
  const backgroundColor = generateColorFromChar(name)
  const color = name ? getForegroundColor(backgroundColor) : 'white'

  return (
    <Modal
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      width={360}
      closable={false}
      transitionName="animation-move-down"
      centered
      title={'添加提供商'}
      okButtonProps={{ disabled: buttonDisabled }}>
      <Divider style={{ margin: '8px 0' }} />

      <Center mt="10px" mb="20px">
        <VStack alignItems="center" gap="10px">
          <Dropdown
            menu={{ items }}
            trigger={['click']}
            open={dropdownOpen}
            align={{ offset: [0, 4] }}
            placement="bottom"
            onOpenChange={(visible) => {
              setDropdownOpen(visible)
              if (visible) {
                setLogoPickerOpen(false)
              }
            }}>
            <Popover
              content={<ProviderLogoPicker onProviderClick={handleProviderLogoClick} />}
              trigger="click"
              open={logoPickerOpen}
              onOpenChange={(visible) => {
                setLogoPickerOpen(visible)
                if (visible) {
                  setDropdownOpen(false)
                }
              }}
              placement="bottom">
              {logo ? (
                <ProviderLogo>
                  <ProviderAvatarPrimitive providerId={logo} providerName={name} logoSrc={logo} size={60} />
                </ProviderLogo>
              ) : (
                <ProviderInitialsLogo style={name ? { backgroundColor, color } : undefined}>
                  {getInitials()}
                </ProviderInitialsLogo>
              )}
            </Popover>
          </Dropdown>
        </VStack>
      </Center>

      <Form layout="vertical" style={{ gap: 8 }}>
        <Form.Item label={'提供商名称'} style={{ marginBottom: 8 }}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={'例如 OpenAI'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                void onOk()
              }
            }}
            maxLength={32}
          />
        </Form.Item>
        <Form.Item label={'提供商类型'} style={{ marginBottom: 0 }}>
          <Select
            value={displayType}
            onChange={(value: string) => {
              setDisplayType(value)
              // 视频商家模板内部统一存为 openai 类型；cherryin-type 映射到 new-api
              const videoTemplate = VIDEO_TYPE_TEMPLATES[value]
              if (videoTemplate) {
                setType('openai')
                if (!name.trim()) {
                  setName(videoTemplate.name)
                }
              } else {
                setType(value === 'cherryin-type' ? 'new-api' : (value as ProviderType))
              }
            }}
            options={PROVIDER_TYPE_OPTIONS}
          />
        </Form.Item>
        {videoTemplate && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6 }}>
            {videoTemplate.hint}
          </div>
        )}
      </Form>
    </Modal>
  )
}

const ProviderLogo = styled.div`
  cursor: pointer;
  width: 60px;
  height: 60px;
  border-radius: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  transition: opacity 0.3s ease;
  &:hover {
    opacity: 0.8;
  }
`

const ProviderInitialsLogo = styled.div`
  cursor: pointer;
  width: 60px;
  height: 60px;
  border-radius: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 500;
  transition: opacity 0.3s ease;
  background-color: var(--color-background-soft);
  border: 0.5px solid var(--color-border);
  &:hover {
    opacity: 0.8;
  }
`

const MenuItem = styled.div`
  width: 100%;
  text-align: center;
`

export default class AddProviderPopup {
  static hide() {
    TopView.hide('AddProviderPopup')
  }
  static show(provider?: Provider) {
    return new Promise<{
      name: string
      type: ProviderType
      apiHost?: string
      logo?: string
      logoFile?: File
    }>((resolve) => {
      TopView.show(
        <PopupContainer
          provider={provider}
          resolve={(v) => {
            resolve(v)
            this.hide()
          }}
        />,
        'AddProviderPopup'
      )
    })
  }
}
