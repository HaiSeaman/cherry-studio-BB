/**
 * videoService.ts Unit Tests
 * 视频生成服务层：成功流转 / 用户中止 / 失败 三种结局的块状态落库
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toSerializedError } from '@renderer/utils/error'

import { fetchVideoGeneration } from '../fetchVideoGeneration'
import { buildProgressText, generateVideo, saveGeneratedVideo } from '../videoService'

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    })
  }
}))

// Dexie 实例与消息数据源全部 mock，避免 IndexedDB 依赖
const blockUpdates: Array<Record<string, unknown>> = []
const topicUpdates: Array<Record<string, unknown>> = []

vi.mock('@renderer/databases', () => ({
  db: {
    topics: {
      add: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ id: 'topic-1', name: '新的视频会话' }),
      update: vi.fn((_id: string, changes: Record<string, unknown>) => {
        topicUpdates.push(changes)
        return Promise.resolve(1)
      })
    },
    message_blocks: {
      update: vi.fn((_id: string, changes: Record<string, unknown>) => {
        blockUpdates.push(changes)
        return Promise.resolve(1)
      })
    }
  }
}))

vi.mock('@renderer/services/db', () => ({
  dbService: {
    appendMessage: vi.fn().mockResolvedValue(undefined),
    updateMessage: vi.fn().mockResolvedValue(undefined)
  }
}))

const providerFixture = { id: 'dashscope', name: 'Bailian', apiKey: 'sk-test', apiHost: '', models: [] }

// 可变夹具：控制 imageSavePath 以测试自动保存分支
let savePathFixture: string | undefined

vi.mock('@renderer/store', () => ({
  default: {
    getState: () => ({
      llm: { providers: [providerFixture] },
      settings: { imageSavePath: savePathFixture },
      assistants: { assistants: [] }
    }),
    dispatch: vi.fn()
  },
  store: {
    getState: () => ({
      llm: { providers: [providerFixture] },
      settings: { imageSavePath: savePathFixture },
      assistants: { assistants: [] }
    }),
    dispatch: vi.fn()
  }
}))

vi.mock('@renderer/services/FileManager', () => ({
  default: {
    addFile: vi.fn().mockResolvedValue(undefined),
    getFileUrl: vi.fn().mockReturnValue('file:///storage/video.mp4')
  }
}))

vi.mock('@renderer/services/NotificationService', () => ({
  NotificationService: {
    getInstance: () => ({ send: vi.fn().mockResolvedValue(undefined) })
  }
}))

vi.mock('../fetchVideoGeneration', () => ({
  fetchVideoGeneration: vi.fn()
}))

const mockedFetchVideoGeneration = vi.mocked(fetchVideoGeneration)

// window.api（视频下载持久化 + 静默写盘）
beforeEach(() => {
  blockUpdates.length = 0
  topicUpdates.length = 0
  savePathFixture = undefined
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      file: {
        download: vi.fn().mockResolvedValue({ id: 'f1', name: 'video.mp4', path: '/storage/video.mp4' }),
        base64File: vi.fn().mockResolvedValue({ data: 'AAAA', mime: 'video/mp4' }),
        saveFileToDirectory: vi.fn().mockResolvedValue('D:/saves/video.mp4')
      }
    }
  })
  // 失焦分支不触发通知断言干扰
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

const baseParams = {
  modelId: 'wan2.6-t2v-plus',
  providerId: 'dashscope',
  prompt: '测试提示词'
}

describe('buildProgressText', () => {
  it('排队中显示等待文案，生成中显示已用时秒数', () => {
    expect(buildProgressText('queued', 0)).toContain('排队中')
    expect(buildProgressText('running', 3500)).toBe('🎬 生成中 4s')
  })
})

describe('toSerializedError', () => {
  it('Error 对象序列化保留 message 与 stack；非 Error 转通用结构', () => {
    const e = new Error('boom')
    const serialized = toSerializedError(e)
    expect(serialized.message).toBe('boom')
    expect(serialized.name).toBe('Error')
    // 非 Error 输入由 getErrorMessage 兜底，name 归一为 'Error'
    expect(toSerializedError('plain').name).toBe('Error')
    expect(toSerializedError(null).message).toBeTruthy()
  })
})

describe('generateVideo', () => {
  it('服务商不存在时显式报错且不发起生成', async () => {
    await expect(
      generateVideo({ ...baseParams, providerId: 'not-exist' } as never)
    ).rejects.toThrow('服务商已不存在')
    expect(mockedFetchVideoGeneration).not.toHaveBeenCalled()
  })

  it('成功：块落 SUCCESS 且本地持久化地址写入 metadata', async () => {
    mockedFetchVideoGeneration.mockResolvedValue('https://remote/video.mp4')

    const result = await generateVideo(baseParams)

    expect(result.topicId).toBeTruthy()
    const successUpdate = blockUpdates.find((u) => u.status === 'success')
    expect(successUpdate).toBeDefined()
    expect((successUpdate!.metadata as { localUrl: string }).localUrl).toBe('file:///storage/video.mp4')
  })

  it('下载失败时回退远程 URL（历史仍可展示）', async () => {
    mockedFetchVideoGeneration.mockResolvedValue('https://remote/video.mp4')
    ;(window.api.file.download as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'))

    await generateVideo(baseParams)

    const successUpdate = blockUpdates.find((u) => u.status === 'success')
    expect((successUpdate!.metadata as { localUrl: string }).localUrl).toBe('https://remote/video.mp4')
  })

  it('用户中止：块落 PAUSED 并上抛中止错误', async () => {
    const abortError = new DOMException('aborted', 'AbortError')
    mockedFetchVideoGeneration.mockRejectedValue(abortError)

    await expect(generateVideo(baseParams)).rejects.toBe(abortError)
    expect(blockUpdates.some((u) => u.status === 'paused')).toBe(true)
    expect(blockUpdates.some((u) => u.status === 'error')).toBe(false)
  })

  it('失败：块落 ERROR 并写入序列化错误', async () => {
    mockedFetchVideoGeneration.mockRejectedValue(new Error('余额不足'))

    await expect(generateVideo(baseParams)).rejects.toThrow('余额不足')
    const errorUpdate = blockUpdates.find((u) => u.status === 'error')
    expect(errorUpdate).toBeDefined()
    expect((errorUpdate!.error as { message: string }).message).toBe('余额不足')
  })

  it('onStatus 进度回调被透传给分发器', async () => {
    mockedFetchVideoGeneration.mockResolvedValue('https://r/v.mp4')

    await generateVideo(baseParams)

    expect(mockedFetchVideoGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        model: baseParams.modelId,
        prompt: baseParams.prompt,
        onStatus: expect.any(Function)
      })
    )
  })

  it('设置了保存路径时自动静默保存到该目录（不弹对话框）', async () => {
    savePathFixture = 'D:/saves'
    mockedFetchVideoGeneration.mockResolvedValue('https://r/v.mp4')

    await generateVideo(baseParams)

    expect(window.api.file.saveFileToDirectory).toHaveBeenCalledWith('video.mp4', 'AAAA', 'D:/saves')
  })

  it('未设置保存路径时不触发导出（仅保留在应用内部存储）', async () => {
    savePathFixture = undefined
    mockedFetchVideoGeneration.mockResolvedValue('https://r/v.mp4')

    await generateVideo(baseParams)

    expect(window.api.file.saveFileToDirectory).not.toHaveBeenCalled()
  })
})

describe('saveGeneratedVideo', () => {
  it('file 为空时直接返回，不读写文件', async () => {
    await expect(saveGeneratedVideo(undefined)).resolves.toBeUndefined()
    expect(window.api.file.saveFileToDirectory).not.toHaveBeenCalled()
  })
})
