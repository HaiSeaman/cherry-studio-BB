import { loggerService } from '@logger'
import ModelSelector from '@renderer/components/ModelSelector'
import {
  isEmbeddingModel,
  isGeminiImageModel,
  isGeminiOfficialImageModel,
  isGenerateImageModel,
  isRerankModel,
  isVisionModel,
  SYSTEM_MODELS
} from '@renderer/config/models'
import {
  GEMINI_PERSON_GENERATION,
  PAINT_ASPECT_RATIOS,
  PAINT_BATCH_OPTIONS,
  PAINT_RESOLUTION_TIERS,
  resolvePaintPixelSize
} from '@renderer/config/paint'
import { useShortcut, useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { getProviderByModel } from '@renderer/services/AssistantService'
import { getModelUniqId } from '@renderer/services/ModelService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { isSystemProvider, type Model, type Topic } from '@renderer/types'
import { getErrorMessage, isAbortError } from '@renderer/utils/error'
import { convertToBase64 } from '@renderer/utils/image'
import { Button, Input, Modal, Select, Tooltip, Upload } from 'antd'
import { ImagePlus, Loader2, MessageSquareDiff, RefreshCw, Sparkles, Square, Wand2 } from 'lucide-react'
import { type FC, useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import { abortCurrentGeneration, enhancePrompt, findModelByUniqId, generatePaintImage } from './services/paintService'
import { setIsGenerating, setLastGeneration, setSelectedModel } from './store/paintSlice'

const logger = loggerService.withContext('PaintInputbar')

interface Props {
  /** 当前绘画会话话题 id（由工作台传入；为空时生成会自动建会话） */
  topicId: string | null
  /** 归属的生图助手 id（写入消息元数据，替代历史遗留的 'paint'） */
  assistantId?: string
  /** 自动新建会话后切换当前话题（由工作台传入 setActiveTopic） */
  onTopicChange?: (topic: Topic) => void
}

const PaintInputbar: FC<Props> = ({ topicId, assistantId, onTopicChange }) => {
  const dispatch = useAppDispatch()
  const isGenerating = useAppSelector((s) => s.paint.isGenerating)
  const selectedModel = useAppSelector((s) => s.paint.selectedModel)
  const lastGeneration = useAppSelector((s) => s.paint.lastGeneration)
  const storeProviders = useAppSelector((s) => s.llm.providers)

  const newTopicShortcut = useShortcutDisplay('new_topic')

  const handleCreateNewTopic = useCallback(() => {
    // 切换到全新默认生图话题并重置输入状态
    if (onTopicChange && assistantId) {
      onTopicChange(getDefaultTopic(assistantId))
    }
    setPrompt('')
    setUploadedImages([])
    dispatch(setLastGeneration(null))
  }, [assistantId, dispatch, onTopicChange])

  // 快捷键支持：新建话题
  useShortcut('new_topic', handleCreateNewTopic, {
    preventDefault: true,
    enableOnFormTags: true
  })

  // 与参数层（fetchPaintGeneration/AiProvider）一致：按 provider.type 判定 Gemini 官方接口
  const isGemini = selectedModel
    ? isGeminiOfficialImageModel(selectedModel, getProviderByModel(selectedModel)?.type)
    : false

  const [prompt, setPrompt] = useState('')
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  // 统一尺寸表达：宽高比 + 分辨率档位（所有模型家族共用一套下拉）
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [resolutionTier, setResolutionTier] = useState<string>('1K')
  // 非 Gemini 模型的自定义像素（设置后覆盖档位映射，选择预设档位时清除）
  const [customPixel, setCustomPixel] = useState<string | undefined>(undefined)
  const [personGeneration, setPersonGeneration] = useState<string | undefined>(undefined)
  const [batchSize, setBatchSize] = useState<number>(1)
  const [enhancing, setEnhancing] = useState(false)

  // 自定义尺寸弹窗（mode 区分：比例 / 像素）
  const [customOpen, setCustomOpen] = useState(false)
  const [customMode, setCustomMode] = useState<'ratio' | 'pixel'>('ratio')
  const [customValue, setCustomValue] = useState('')
  const [customHint, setCustomHint] = useState('')

  const handleModelChange = (value: string) => {
    dispatch(setSelectedModel(findModelByUniqId(value)))
    // 切换模型家族时清除自定义像素，避免泄漏到 Gemini 的档位下拉显示
    setCustomPixel(undefined)
  }

  const openCustomRatio = () => {
    setCustomMode('ratio')
    setCustomHint('自定义宽高比（数字:数字，如 7:3），对 Gemini 与百炼均生效')
    setCustomValue('')
    setCustomOpen(true)
  }

  const openCustomPixel = () => {
    setCustomMode('pixel')
    setCustomHint('自定义像素尺寸（宽x高，如 1536x1024），仅对非 Gemini 模型生效')
    setCustomValue('')
    setCustomOpen(true)
  }

  const confirmCustomSize = () => {
    const value = customValue.trim()
    if (!value) {
      return
    }
    if (customMode === 'ratio') {
      const match = /^(\d+):(\d+)$/.exec(value)
      if (!match || Number(match[1]) === 0 || Number(match[2]) === 0) {
        window.toast.warning('自定义宽高比格式：数字:数字（均需大于 0），例如 7:3')
        return
      }
      const ratioValue = Number(match[1]) / Number(match[2])
      if (ratioValue > 8 || ratioValue < 1 / 8) {
        window.toast.warning('比例超出模型支持范围（1:8 ~ 8:1）')
        return
      }
      setAspectRatio(value)
    } else {
      const match = /^(\d+)x(\d+)$/i.exec(value)
      if (!match || Number(match[1]) === 0 || Number(match[2]) === 0) {
        window.toast.warning('自定义尺寸格式：宽x高（均需大于 0），例如 1536x1024')
        return
      }
      setCustomPixel(value.toLowerCase())
    }
    setCustomOpen(false)
  }

  /**
   * 计算传给生成链路的尺寸参数：
   * - Gemini：直接用档位（1K/2K/4K/512，auto 传空由 SDK 省略）
   * - 其他模型：自定义像素优先，否则按「比例×档位」映射为合法像素
   */
  const resolveImageSize = (): string => {
    if (isGemini) {
      return resolutionTier === 'auto' ? '' : resolutionTier
    }
    return customPixel ?? resolvePaintPixelSize(aspectRatio, resolutionTier) ?? ''
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
      const result = await generatePaintImage({ ...params, model, ...(assistantId ? { assistantId } : {}) })
      // 无活跃会话时本次生成自动新建了会话：同步切换工作台当前话题，否则生成结果不可见
      if (result.topic && onTopicChange) {
        onTopicChange(result.topic)
      }
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
      imageSize: resolveImageSize(),
      ...(isGemini ? { aspectRatio } : {}),
      ...(isGemini && personGeneration ? { personGeneration } : {}),
      batchSize: isGemini ? 1 : batchSize,
      topicId
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
      topicId,
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

  // 统一比例下拉选项：常用比例 + 自定义
  const ratioOptions = [
    ...PAINT_ASPECT_RATIOS.map((r) => ({ label: r, value: r })),
    { label: '自定义比例...', value: '__custom__' }
  ]

  // 统一档位下拉选项：自动/1K/2K/4K/512（+ 非 Gemini 的自定义像素）
  const tierOptions = [
    ...PAINT_RESOLUTION_TIERS.map((t) => ({ label: t.label, value: t.value })),
    ...(isGemini ? [] : [{ label: '自定义像素...', value: '__custom__' }])
  ]

  // 非 Gemini 模型当前实际生效的像素（映射结果，展示给用户核对）
  const effectivePixel = isGemini ? undefined : (customPixel ?? resolvePaintPixelSize(aspectRatio, resolutionTier))

  // 稳定引用：避免每次渲染（如输入提示词）都触发 ModelSelector 全量重建选项
  const enabledProviders = useMemo(() => storeProviders.filter((p) => p.enabled), [storeProviders])
  const modelPredicate = useCallback((model: Model) => {
    if (isEmbeddingModel(model) || isRerankModel(model)) {
      return false
    }
    // 只显示用户自己添加的模型（排除系统内置默认模型）
    if (!isUserAddedModel(model)) {
      return false
    }
    // 只显示视觉 / 图像生成模型
    return isGenerateImageModel(model) || isGeminiImageModel(model) || isVisionModel(model)
  }, [])

  return (
    <Container>
      <InputArea>
        {/* 第一行：模型 + 生成参数 */}
        <Toolbar>
          <ModelSelector
            // 只显示已启用的 provider（未启用即使配置了 API Key 也不显示）
            providers={enabledProviders}
            style={{ minWidth: 200 }}
            placeholder={'选择绘画模型'}
            // 用户自定义 provider 的模型全部显示；系统内置 provider 只显示绘画模型（避免默认文本模型干扰）
            predicate={modelPredicate}
            value={selectedModel ? getModelUniqId(selectedModel) : undefined}
            onChange={handleModelChange}
          />
          {/* 统一尺寸选择：宽高比 + 分辨率档位（所有模型共用一套） */}
          <Tooltip title={'画面宽高比（Gemini 与百炼均支持；自定义比例输入 数字:数字）'} mouseEnterDelay={0.5}>
            <Select
              size="small"
              style={{ width: 96 }}
              value={aspectRatio}
              onChange={(v) => {
                if (v === '__custom__') {
                  openCustomRatio()
                } else {
                  setAspectRatio(v)
                }
              }}
              options={ratioOptions}
            />
          </Tooltip>
          <Tooltip
            title={
              isGemini
                ? 'Gemini 官方分辨率（1K/2K/4K；512 仅部分模型支持；自动=不指定）'
                : '分辨率档位自动换算为模型合法像素，超出上限自动就近取整；自动=由模型按提示词推荐'
            }
            mouseEnterDelay={0.5}>
            <Select
              size="small"
              style={{ width: 104 }}
              value={isGemini ? resolutionTier : (customPixel ?? resolutionTier)}
              onChange={(v) => {
                if (v === '__custom__') {
                  openCustomPixel()
                } else {
                  setCustomPixel(undefined)
                  setResolutionTier(v)
                }
              }}
              options={tierOptions}
            />
          </Tooltip>
          {isGemini ? (
            <>
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
              <Tooltip
                title={uploadedImages.length > 0 ? '图生图（图像编辑）固定生成 1 张' : undefined}
                mouseEnterDelay={0.5}>
                <Select
                  size="small"
                  style={{ width: 72 }}
                  value={uploadedImages.length > 0 ? 1 : batchSize}
                  onChange={setBatchSize}
                  disabled={uploadedImages.length > 0}
                  options={PAINT_BATCH_OPTIONS.map((n) => ({ label: `${n} 张`, value: n }))}
                />
              </Tooltip>
              {effectivePixel && <DisabledHint>{`→ ${effectivePixel}`}</DisabledHint>}
            </>
          )}
        </Toolbar>
        {/* 第二行：提示词输入 */}
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
          <Tooltip
            title={newTopicShortcut ? `新建话题 (${newTopicShortcut})` : '新建话题'}
            mouseEnterDelay={0.5}>
            <Button
              icon={<MessageSquareDiff size={16} />}
              onClick={handleCreateNewTopic}
              disabled={isGenerating}>
              {'新话题'}
            </Button>
          </Tooltip>
          <Upload
            accept="image/*"
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              if (uploadedImages.length >= 4) {
                window.toast.warning('参考图片最多上传 4 张')
                return false
              }
              void convertToBase64(file)
                .then((dataUrl) => {
                  if (typeof dataUrl !== 'string') {
                    return
                  }
                  // append 处兜底（updater 保持纯函数）：同批多选时 beforeUpload 闭包里的
                  // length 不更新，超出上限的图片在此处静默丢弃
                  setUploadedImages((prev) => (prev.length >= 4 ? prev : [...prev, dataUrl]))
                })
                .catch(() => {
                  window.toast.error('图片读取失败，请重试')
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
              title={!selectedModel ? '请先选择绘画模型' : !prompt.trim() ? '请输入提示词' : undefined}
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
        title={customMode === 'ratio' ? '自定义宽高比' : '自定义像素尺寸'}
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
          placeholder={customMode === 'ratio' ? '例如 7:3' : '例如 1536x1024'}
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
