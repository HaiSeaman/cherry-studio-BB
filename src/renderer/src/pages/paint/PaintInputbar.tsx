import { loggerService } from '@logger'
import ModelSelector from '@renderer/components/ModelSelector'
import {
  isEmbeddingModel,
  isGeminiImageModel,
  isGenerateImageModel,
  isRerankModel,
  isVisionModel,
  SYSTEM_MODELS
} from '@renderer/config/models'
import {
  GEMINI_ASPECT_RATIOS,
  GEMINI_IMAGE_SIZES,
  GEMINI_PERSON_GENERATION,
  PAINT_BATCH_OPTIONS,
  PAINT_PIXEL_SIZE_GROUPS
} from '@renderer/config/paint'
import { getStoreProviders } from '@renderer/hooks/useStore'
import { getProviderByModel } from '@renderer/services/AssistantService'
import { getModelUniqId } from '@renderer/services/ModelService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { isSystemProvider, type Model } from '@renderer/types'
import { getErrorMessage, isAbortError } from '@renderer/utils/error'
import { convertToBase64 } from '@renderer/utils/image'
import { Button, Input, Modal, Select, Tooltip, Upload } from 'antd'
import { ImagePlus, Loader2, RefreshCw, Sparkles, Square, Wand2 } from 'lucide-react'
import { type FC, useState } from 'react'
import styled from 'styled-components'

import { abortCurrentGeneration, enhancePrompt, findModelByUniqId, generatePaintImage } from './services/paintService'
import { setActiveTopicId, setIsGenerating, setLastGeneration, setSelectedModel } from './store/paintSlice'

const logger = loggerService.withContext('PaintInputbar')

const PaintInputbar: FC = () => {
  const dispatch = useAppDispatch()
  const isGenerating = useAppSelector((s) => s.paint.isGenerating)
  const selectedModel = useAppSelector((s) => s.paint.selectedModel)
  const activeTopicId = useAppSelector((s) => s.paint.activeTopicId)
  const lastGeneration = useAppSelector((s) => s.paint.lastGeneration)

  const isGemini = selectedModel ? isGeminiImageModel(selectedModel) : false

  const [prompt, setPrompt] = useState('')
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  // 非 Gemini 模型：像素尺寸（如 1024x1024）
  const [imageSize, setImageSize] = useState<string>('1024x1024')
  // Gemini 模型：官方宽高比 + 分辨率 + 人物生成模式
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [geminiSize, setGeminiSize] = useState<string>('1K')
  const [personGeneration, setPersonGeneration] = useState<string | undefined>(undefined)
  const [batchSize, setBatchSize] = useState<number>(1)
  const [enhancing, setEnhancing] = useState(false)

  // 自定义尺寸弹窗
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [customHint, setCustomHint] = useState('')

  const handleModelChange = (value: string) => {
    dispatch(setSelectedModel(findModelByUniqId(value)))
  }

  const openCustomSize = (hint: string) => {
    setCustomHint(hint)
    setCustomValue('')
    setCustomOpen(true)
  }

  const confirmCustomSize = () => {
    const value = customValue.trim()
    if (!value) {
      return
    }
    if (isGemini) {
      // Gemini 自定义宽高比：x:y 数字格式
      if (!/^\d+:\d+$/.test(value)) {
        window.toast.warning('自定义宽高比格式：数字:数字，例如 7:3')
        return
      }
      setAspectRatio(value)
    } else {
      // 非 Gemini 自定义像素：宽x高 数字格式
      if (!/^\d+x\d+$/i.test(value)) {
        window.toast.warning('自定义尺寸格式：宽x高，例如 1536x1024')
        return
      }
      setImageSize(value.toLowerCase())
    }
    setCustomOpen(false)
  }

  /** 执行生成（正常生成 / 重新生成 / 编辑重生成统一入口） */
  const runGeneration = async (params: {
    model: ReturnType<typeof findModelByUniqId>
    prompt: string
    inputImages?: string[]
    imageSize: string
    aspectRatio?: string
    personGeneration?: string
    batchSize: number
    topicId?: string | null
    /** 生成成功后是否清空输入框（重新生成不清空用户正在输入的内容） */
    clearInput?: boolean
  }) => {
    const { model, clearInput = true } = params
    if (!model || isGenerating) {
      return
    }
    dispatch(setIsGenerating(true))
    try {
      const result = await generatePaintImage({ ...params, model })
      // 记录本次生成参数（供重新生成 / 编辑重生成使用）
      dispatch(
        setLastGeneration({
          modelId: model.id,
          prompt: params.prompt,
          imageSize: params.imageSize,
          ...(params.aspectRatio ? { aspectRatio: params.aspectRatio } : {}),
          ...(params.personGeneration ? { personGeneration: params.personGeneration } : {}),
          batchSize: params.batchSize,
          inputImages: params.inputImages
        })
      )
      // 无活跃会话时（自动创建的新会话）同步切换
      if (result.topicId !== activeTopicId) {
        dispatch(setActiveTopicId(result.topicId))
      }
      logger.debug('图片生成完成:', { count: result.images.length, topicId: result.topicId })
      if (clearInput) {
        setPrompt('')
        setUploadedImages([])
      }
      return result
    } catch (error) {
      if (isAbortError(error)) {
        // 用户主动停止生成
        window.toast.info('已停止生成')
        return null
      }
      window.toast.error({ title: getErrorMessage(error), timeout: 5000 })
      // 常见网关错误给出诊断提示，帮助用户定位问题
      const message = getErrorMessage(error)
      if (/bad gateway|502|failed after \d+ attempts/i.test(message)) {
        window.toast.warning(
          '生成失败常见原因：①所选模型不支持文生图（请选择 dall-e / gpt-image / flux / seedream 等绘画模型）②API 地址或密钥配置有误 ③API 中转服务不支持 /images/generations 端点'
        )
      }
      return null
    } finally {
      dispatch(setIsGenerating(false))
    }
  }

  /** 停止当前生成 */
  const handleStop = () => {
    abortCurrentGeneration()
  }

  const handleGenerate = () => {
    const model = selectedModel
    const content = prompt.trim()
    if (!model || !content) {
      return
    }
    void runGeneration({
      model,
      prompt: content,
      inputImages: uploadedImages,
      imageSize: isGemini ? geminiSize : imageSize,
      ...(isGemini ? { aspectRatio } : {}),
      ...(isGemini && personGeneration ? { personGeneration } : {}),
      batchSize: isGemini ? 1 : batchSize,
      topicId: activeTopicId
    })
  }

  /** 重新生成：复用上一次的提示词与参数 */
  const handleRegenerate = () => {
    const last = lastGeneration
    if (!last || isGenerating) {
      return
    }
    const model = findModelByUniqId(last.modelId)
    if (!model) {
      window.toast.warning('上次使用的模型已不存在，请重新选择模型')
      return
    }
    void runGeneration({
      model,
      prompt: last.prompt,
      inputImages: last.inputImages,
      imageSize: last.imageSize,
      aspectRatio: last.aspectRatio,
      personGeneration: last.personGeneration,
      batchSize: last.batchSize,
      topicId: activeTopicId,
      clearInput: false
    })
  }

  const handleEnhance = async () => {
    const content = prompt.trim()
    if (!content || enhancing) {
      return
    }
    setEnhancing(true)
    try {
      const optimized = await enhancePrompt(content)
      setPrompt(optimized)
      window.toast.success('提示词已优化，请确认后生成')
    } catch (error) {
      window.toast.error({ title: getErrorMessage(error), timeout: 5000 })
    } finally {
      setEnhancing(false)
    }
  }

  // 非 Gemini 尺寸下拉选项：分组像素尺寸 + 自定义
  const sizeOptions = [
    ...PAINT_PIXEL_SIZE_GROUPS.map((group) => ({
      label: group.label,
      options: [...group.options]
    })),
    { label: '自定义尺寸...', value: '__custom__' }
  ]

  // Gemini 宽高比下拉选项：官方比例 + 自定义
  const ratioOptions = [
    ...GEMINI_ASPECT_RATIOS.map((r) => ({ label: r, value: r })),
    { label: '自定义比例...', value: '__custom__' }
  ]

  return (
    <Container>
      {/* 第一行：模型 + 生成参数 */}
      <Toolbar>
        <ModelSelector
          // 只显示已启用的 provider（未启用即使配置了 API Key 也不显示）
          providers={getStoreProviders().filter((p) => p.enabled)}
          style={{ minWidth: 200 }}
          placeholder={'选择绘画模型'}
          // 用户自定义 provider 的模型全部显示；系统内置 provider 只显示绘画模型（避免默认文本模型干扰）
          predicate={(model) => {
            if (isEmbeddingModel(model) || isRerankModel(model)) {
              return false
            }
            // 只显示用户自己添加的模型（排除系统内置默认模型）
            if (!isUserAddedModel(model)) {
              return false
            }
            // 只显示视觉 / 图像生成模型
            return isGenerateImageModel(model) || isGeminiImageModel(model) || isVisionModel(model)
          }}
          value={selectedModel ? getModelUniqId(selectedModel) : undefined}
          onChange={handleModelChange}
        />
        {isGemini ? (
          <>
            <Tooltip title={'Gemini 官方宽高比'} mouseEnterDelay={0.5}>
              <Select
                size="small"
                style={{ width: 96 }}
                value={aspectRatio}
                onChange={(v) => {
                  if (v === '__custom__') {
                    openCustomSize('Gemini 自定义宽高比（数字:数字，如 7:3）')
                  } else {
                    setAspectRatio(v)
                  }
                }}
                options={ratioOptions}
              />
            </Tooltip>
            <Tooltip title={'Gemini 官方分辨率（大写 K）'} mouseEnterDelay={0.5}>
              <Select
                size="small"
                style={{ width: 80 }}
                value={geminiSize}
                onChange={setGeminiSize}
                options={GEMINI_IMAGE_SIZES.map((s) => ({ label: s, value: s }))}
              />
            </Tooltip>
            <Tooltip title={'人物生成模式（Gemini 官方）'} mouseEnterDelay={0.5}>
              <Select
                size="small"
                style={{ width: 120 }}
                value={personGeneration}
                placeholder={'人物模式'}
                allowClear
                onChange={setPersonGeneration}
                options={GEMINI_PERSON_GENERATION.map((p) => ({ label: p.label, value: p.value }))}
              />
            </Tooltip>
            <DisabledHint>{'Gemini 每次生成 1 张'}</DisabledHint>
          </>
        ) : (
          <>
            <Select
              size="small"
              style={{ width: 150 }}
              value={imageSize}
              onChange={(v) => {
                if (v === '__custom__') {
                  openCustomSize('自定义尺寸（宽x高，如 1536x1024）')
                } else {
                  setImageSize(v)
                }
              }}
              options={sizeOptions}
            />
            <Select
              size="small"
              style={{ width: 72 }}
              value={batchSize}
              onChange={setBatchSize}
              options={PAINT_BATCH_OPTIONS.map((n) => ({ label: `${n} 张`, value: n }))}
            />
          </>
        )}
      </Toolbar>
      {/* 第二行：提示词输入 */}
      <InputArea>
        <Input.TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={'描述你想要的画面，例如：一只在月光下奔跑的银白色狐狸，森林，超现实主义风格'}
          autoSize={{ minRows: 2, maxRows: 6 }}
          disabled={isGenerating}
        />
        {uploadedImages.length > 0 && (
          <UploadPreview>
            {uploadedImages.map((img, index) => (
              <PreviewItem key={index}>
                <img src={img} alt={`参考图${index + 1}`} />
                <PreviewClose onClick={() => setUploadedImages((prev) => prev.filter((_, i) => i !== index))}>
                  ×
                </PreviewClose>
              </PreviewItem>
            ))}
          </UploadPreview>
        )}
        {/* 第三行：操作按钮 */}
        <ButtonRow>
          <Upload
            accept="image/*"
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              if (uploadedImages.length >= 4) {
                window.toast.warning('参考图片最多上传 4 张')
                return false
              }
              void convertToBase64(file).then((dataUrl) => {
                if (typeof dataUrl === 'string') {
                  setUploadedImages((prev) => [...prev, dataUrl])
                }
              })
              return false
            }}>
            <Tooltip title={'上传参考图片（图生图）'} mouseEnterDelay={0.5}>
              <Button icon={<ImagePlus size={16} />} disabled={isGenerating}>
                {'上传图片'}
              </Button>
            </Tooltip>
          </Upload>
          <Tooltip title={'使用翻译模型优化提示词'} mouseEnterDelay={0.5}>
            <Button
              icon={enhancing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              onClick={handleEnhance}
              disabled={!prompt.trim() || isGenerating}>
              {'优化提示词'}
            </Button>
          </Tooltip>
          <Tooltip title={'使用上一次的提示词与参数重新生成'} mouseEnterDelay={0.5}>
            <Button
              icon={<RefreshCw size={16} />}
              onClick={handleRegenerate}
              disabled={!lastGeneration || isGenerating}>
              {'重新生成'}
            </Button>
          </Tooltip>
          {isGenerating ? (
            <Tooltip title={'停止当前生成'} mouseEnterDelay={0.3}>
              <GenerateButton type="primary" danger icon={<Square size={14} />} onClick={handleStop}>
                {'停止生成'}
              </GenerateButton>
            </Tooltip>
          ) : (
            <Tooltip
              title={!selectedModel ? '请先选择绘画模型' : !prompt.trim() ? '请输入提示词' : ''}
              mouseEnterDelay={0.3}>
              <GenerateButton
                type="primary"
                icon={<Wand2 size={16} />}
                onClick={handleGenerate}
                disabled={!selectedModel || !prompt.trim()}>
                {'生成图片'}
              </GenerateButton>
            </Tooltip>
          )}
        </ButtonRow>
      </InputArea>

      {/* 自定义尺寸弹窗 */}
      <Modal
        open={customOpen}
        title={isGemini ? '自定义宽高比' : '自定义尺寸'}
        okText={'确定'}
        cancelText={'取消'}
        centered
        onOk={confirmCustomSize}
        onCancel={() => setCustomOpen(false)}>
        <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>{customHint}</div>
        <Input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onPressEnter={confirmCustomSize}
          placeholder={isGemini ? '例如 7:3' : '例如 1536x1024'}
          autoFocus
        />
      </Modal>
    </Container>
  )
}

/**
 * 判断模型是否为「用户添加」的模型：
 * - 自定义 provider（非系统内置）：其全部模型都是用户添加的
 * - 系统 provider：排除内置默认模型（SYSTEM_MODELS），其余为用户添加
 *   （旧版持久化残留的系统 provider 若无默认模型定义，则全部视为用户添加）
 */
function isUserAddedModel(model: Model): boolean {
  const provider = getProviderByModel(model)
  if (!provider) {
    return false
  }
  if (!isSystemProvider(provider)) {
    return true
  }
  const defaultModels = SYSTEM_MODELS[provider.id as keyof typeof SYSTEM_MODELS]
  if (!defaultModels) {
    return true
  }
  return !defaultModels.some((m) => m.id === model.id)
}

const Container = styled.div`
  border-top: 0.5px solid var(--color-border);
  padding: 12px 20px 16px;
  background-color: var(--color-background);
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
`

const DisabledHint = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
  white-space: nowrap;
`

const InputArea = styled.div`
  max-width: 900px;
  margin: 0 auto;
`

const UploadPreview = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`

const PreviewItem = styled.div`
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  border: 0.5px solid var(--color-border);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const PreviewClose = styled.div`
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  line-height: 14px;
  text-align: center;
  font-size: 12px;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  cursor: pointer;
`

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
`

const GenerateButton = styled(Button)`
  margin-left: auto;
`

export default PaintInputbar
