import { loggerService } from '@logger'
import ModelSelector from '@renderer/components/ModelSelector'
import { useShortcut, useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { enhancePrompt } from '@renderer/pages/paint/services/paintService'
import { getProviderByModel } from '@renderer/services/AssistantService'
import { getModelUniqId } from '@renderer/services/ModelService'
import { useAppSelector } from '@renderer/store'
import type { Model, Topic } from '@renderer/types'
import { getErrorMessage, isAbortError } from '@renderer/utils/error'
import { convertToBase64 } from '@renderer/utils/image'
import { Button, Input, Select, Tooltip, Upload } from 'antd'
import { Clapperboard, ImagePlus, Loader2, PlayCircle, Sparkles, Square } from 'lucide-react'
import { type FC, useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import { abortCurrentVideoGeneration, createVideoTopic, generateVideo } from './services/videoService'

const logger = loggerService.withContext('VideoInputbar')

interface Props {
  /** 当前视频会话话题 id（由工作台传入；为空时生成会自动建会话） */
  topicId: string | null
  /** 归属的视频助手 id */
  assistantId?: string
  /** 是否正在生成（由工作台持有，历史列表需要同时感知） */
  isGenerating: boolean
  setIsGenerating: (v: boolean) => void
  /** 自动新建会话后切换当前话题（由工作台传入 setActiveTopic） */
  onTopicChange?: (topic: Topic) => void
}

/** 本地持久化的模型选择（跨会话保留） */
const SELECTED_MODEL_KEY = 'video:selected-model'

type SelectedModelRef = { modelId: string; providerId: string }

function loadSelectedModel(): SelectedModelRef | null {
  try {
    const raw = localStorage.getItem(SELECTED_MODEL_KEY)
    return raw ? (JSON.parse(raw) as SelectedModelRef) : null
  } catch {
    return null
  }
}

const VIDEO_DURATIONS = [
  { label: '5 秒', value: '5' },
  { label: '10 秒', value: '10' }
]

const VIDEO_RESOLUTIONS = [
  { label: '480P', value: '480p' },
  { label: '720P', value: '720p' },
  { label: '1080P', value: '1080p' }
]

const VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1']

/**
 * 视频生成输入栏：模型选择（仅视频模型）、提示词（可优化）、首帧参考图、时长/分辨率/宽高比胶囊、生成/停止
 */
const VideoInputbar: FC<Props> = ({ topicId, assistantId, isGenerating, setIsGenerating, onTopicChange }) => {
  const storeProviders = useAppSelector((s) => s.llm.providers)
  const newTopicShortcut = useShortcutDisplay('new_topic')

  const [prompt, setPrompt] = useState('')
  const [inputImage, setInputImage] = useState<string | undefined>(undefined)
  const [duration, setDuration] = useState<string>('5')
  const [resolution, setResolution] = useState<string>('720p')
  const [aspectRatio, setAspectRatio] = useState<string>('16:9')
  const [enhancing, setEnhancing] = useState(false)

  // 模型选择：存 {modelId, providerId} 引用，渲染时从 provider store 解析完整模型
  const [selected, setSelected] = useState<SelectedModelRef | null>(loadSelectedModel)

  // 从 store 解析当前选中的模型对象；服务商被删时自动失效
  const selectedModel = useMemo<Model | null>(() => {
    if (!selected) return null
    const provider = storeProviders.find((p) => p.id === selected.providerId)
    return provider?.models.find((m) => m.id === selected.modelId) ?? null
  }, [selected, storeProviders])

  // 稳定引用：避免每次渲染都触发 ModelSelector 全量重建选项
  const enabledProviders = useMemo(() => storeProviders.filter((p) => p.enabled), [storeProviders])
  // 不按模型名过滤：视频模型命名无统一规范（白名单会漏新模型），全部展示由用户自选；
  // 选到不支持的视频生成的模型时，生成入口会给出明确报错
  const modelPredicate = useCallback(() => true, [])

  const handleSelectModel = (model: Model | null) => {
    const next = model ? { modelId: model.id, providerId: model.provider } : null
    setSelected(next)
    try {
      if (next) {
        localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(next))
      } else {
        localStorage.removeItem(SELECTED_MODEL_KEY)
      }
    } catch (error) {
      logger.warn('保存模型选择失败:', error as Error)
    }
  }

  const handleCreateNewTopic = useCallback(async () => {
    // 生成期间禁止新建：切走到新会话后，在途生成的结果仍写回旧会话，
    // 用户眼前却是全新的空会话。按钮已 disabled，但 new_topic 快捷键走同一入口，必须在此拦截。
    if (isGenerating) {
      return
    }
    // 立即新建空白话题并挂载，旧话题安全保留在历史中
    if (onTopicChange && assistantId) {
      const newTopic = await createVideoTopic(assistantId)
      onTopicChange(newTopic)
    }
    setPrompt('')
    setInputImage(undefined)
  }, [assistantId, isGenerating, onTopicChange])

  useShortcut('new_topic', handleCreateNewTopic, {
    preventDefault: true,
    enableOnFormTags: true
  })

  /** 执行生成（唯一入口） */
  const handleGenerate = async () => {
    const content = prompt.trim()
    if (!selectedModel || !content || isGenerating) {
      return
    }
    setIsGenerating(true)
    try {
      if (!selected) {
        window.toast.warning('请先选择视频模型')
        return
      }
      const result = await generateVideo({
        modelId: selectedModel.id,
        providerId: selected.providerId ?? getProviderByModel(selectedModel)?.id ?? '',
        prompt: content,
        ...(inputImage ? { inputImage } : {}),
        duration,
        resolution,
        aspectRatio,
        topicId,
        ...(assistantId ? { assistantId } : {})
      })
      // 无活跃会话时本次生成自动新建了会话：同步切换工作台当前话题，否则生成结果不可见
      if (result.topic && onTopicChange) {
        onTopicChange(result.topic)
      }
      setPrompt('')
      setInputImage(undefined)
    } catch (error) {
      if (isAbortError(error)) {
        window.toast.info('已停止生成')
        return
      }
      window.toast.error({ title: getErrorMessage(error), timeout: 6000 })
    } finally {
      setIsGenerating(false)
    }
  }

  /** 停止当前生成（停止轮询并尽力取消远端任务） */
  const handleStop = () => {
    abortCurrentVideoGeneration()
  }

  /** 使用翻译模型优化提示词（复用生图的通用优化逻辑） */
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

  return (
    <Container>
      {/* 第一行：模型 + 生成参数 */}
      <Toolbar>
        <ModelSelector
          providers={enabledProviders}
          style={{ minWidth: 220 }}
          placeholder={'选择视频模型'}
          predicate={modelPredicate}
          value={selectedModel ? getModelUniqId(selectedModel) : undefined}
          onChange={(value) => {
            // 从全量 providers 中解析 uniqId 对应的模型对象
            for (const p of enabledProviders) {
              const found = p.models.find((m) => getModelUniqId(m) === value)
              if (found) {
                handleSelectModel(found)
                return
              }
            }
          }}
        />
        <Tooltip title={'视频时长'} mouseEnterDelay={0.5}>
          <Select
            size="small"
            style={{ width: 88 }}
            value={duration}
            onChange={setDuration}
            options={VIDEO_DURATIONS}
          />
        </Tooltip>
        <Tooltip title={'分辨率档位'} mouseEnterDelay={0.5}>
          <Select
            size="small"
            style={{ width: 92 }}
            value={resolution}
            onChange={setResolution}
            options={VIDEO_RESOLUTIONS}
          />
        </Tooltip>
        <Tooltip title={'画面宽高比'} mouseEnterDelay={0.5}>
          <Select
            size="small"
            style={{ width: 92 }}
            value={aspectRatio}
            onChange={setAspectRatio}
            options={VIDEO_ASPECT_RATIOS.map((r) => ({ label: r, value: r }))}
          />
        </Tooltip>
      </Toolbar>
      {/* 第二行：提示词输入 */}
      <Input.TextArea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={'描述你想要的画面，例如：黄昏的海边，无人机缓缓升起，金色阳光洒在波浪上'}
        autoSize={{ minRows: 2, maxRows: 6 }}
        disabled={isGenerating}
        onPressEnter={(e) => {
          if (!e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void handleGenerate()
          }
        }}
      />
      {inputImage && (
        <UploadPreview>
          <PreviewItem>
            <img src={inputImage} alt={'首帧参考图'} />
            <PreviewClose onClick={() => setInputImage(undefined)}>{'×'}</PreviewClose>
          </PreviewItem>
        </UploadPreview>
      )}
      {/* 第三行：操作按钮 */}
      <ButtonRow>
        <Tooltip title={newTopicShortcut ? `新建话题 (${newTopicShortcut})` : '新建话题'} mouseEnterDelay={0.5}>
          <Button icon={<Clapperboard size={16} />} onClick={() => void handleCreateNewTopic()} disabled={isGenerating}>
            {'新话题'}
          </Button>
        </Tooltip>
        <Upload
          accept="image/*"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => {
            void convertToBase64(file)
              .then((dataUrl) => {
                if (typeof dataUrl !== 'string') {
                  return
                }
                setInputImage(dataUrl)
              })
              .catch(() => {
                window.toast.error('图片读取失败，请重试')
              })
            return false
          }}>
          <Tooltip title={'上传首帧图片（图生视频）'} mouseEnterDelay={0.5}>
            <Button icon={<ImagePlus size={16} />} disabled={isGenerating}>
              {'首帧图片'}
            </Button>
          </Tooltip>
        </Upload>
        <Tooltip title={'使用翻译模型优化提示词'} mouseEnterDelay={0.5}>
          <Button
            icon={enhancing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            onClick={() => void handleEnhance()}
            disabled={!prompt.trim() || isGenerating || enhancing}>
            {'优化提示词'}
          </Button>
        </Tooltip>
        {isGenerating ? (
          <Button danger icon={<Square size={14} />} onClick={handleStop}>
            {'停止生成'}
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<PlayCircle size={16} />}
            onClick={() => void handleGenerate()}
            disabled={!selectedModel || !prompt.trim()}>
            {'生成视频'}
          </Button>
        )}
      </ButtonRow>
    </Container>
  )
}

const Container = styled.div`
  border-top: 0.5px solid var(--color-border);
  padding: 12px 20px 16px;
  background-color: var(--color-background);
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const UploadPreview = styled.div`
  display: flex;
  gap: 8px;
`

const PreviewItem = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  border: 0.5px solid var(--color-border);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const PreviewClose = styled.button`
  position: absolute;
  top: 0;
  right: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-bottom-left-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
`

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  button:last-child {
    margin-left: auto;
  }
`

export default VideoInputbar
