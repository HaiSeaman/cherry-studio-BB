import FileManager from '@renderer/services/FileManager'
import type { FileMetadata } from '@renderer/types'
import { FILE_TYPE } from '@renderer/types'
import { createImageBlock } from '@renderer/utils/messageUtils/create'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// 回归测试：快捷助手（mini window）截图/OCR/翻译 图片消息的渲染路径
//
// Bug 背景（两层根因，缺一不可）：
//   1. 截图字节写入「临时目录」得到 FileMetadata（path 指向 tempDir），聊天里
//      ImageBlock 却按 `file://<filesPath>/<id><ext>` 取图 → 路径对不上。
//      修复：发送前 FileManager.uploadFiles 把附件复制进文件库（与主窗口一致）。
//   2. mini 窗口是独立渲染进程，runtime.filesPath 默认是空字符串（该 slice 在
//      persist blacklist 中，主窗口才由 useAppInit 初始化）→ getFilePath 拼出
//      file:///<id><ext> 无效路径 → 图片加载失败提示「本地文件可能已被清理」。
//      修复：mini 窗口启动时初始化 filesPath；FileManager 增加空 filesPath 回退。
// ---------------------------------------------------------------------------

const { storeFilesPath } = vi.hoisted(() => ({ storeFilesPath: { current: '' } }))

// 1x1 透明 PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

let tempDir: string
let storageDir: string

/** 模拟主进程 FileStorage.getFile 返回的元数据（createTempFile + write 之后） */
function makeTempImageMetadata(): FileMetadata {
  const filePath = path.join(tempDir, `temp_file_${crypto.randomUUID()}_screenshot.png`)
  fs.writeFileSync(filePath, PNG_BYTES)
  return {
    id: crypto.randomUUID(),
    origin_name: path.basename(filePath),
    name: path.basename(filePath),
    path: filePath,
    created_at: fs.statSync(filePath).birthtime.toISOString(),
    size: fs.statSync(filePath).size,
    ext: path.extname(filePath),
    type: FILE_TYPE.IMAGE,
    count: 1
  }
}

/** 模拟主进程 FileStorage.uploadFile：把源文件复制进文件库并用新 uuid 命名 */
function mockUploadFile(file: FileMetadata): FileMetadata {
  const uuid = crypto.randomUUID()
  const ext = path.extname(file.path).toLowerCase()
  const destPath = path.join(storageDir, uuid + ext)
  fs.copyFileSync(file.path, destPath)
  const stats = fs.statSync(destPath)
  return {
    id: uuid,
    origin_name: path.basename(file.path),
    name: uuid + ext,
    path: destPath,
    created_at: stats.birthtime.toISOString(),
    size: stats.size,
    ext: ext,
    type: FILE_TYPE.IMAGE,
    count: 1
  }
}

// 用真实 FileManager 逻辑（getFilePath / uploadFiles），只 mock 它依赖的 store 与 db。
// filesPath 用惰性 getter，测试内 beforeEach 随时更新指向真实临时存储目录。
vi.mock('@renderer/store', () => {
  const { configureStore } = require('@reduxjs/toolkit')
  return {
    default: configureStore({
      reducer: {
        runtime: (
          state = {
            get filesPath() {
              return storeFilesPath.current
            }
          }
        ) => state
      }
    })
  }
})

vi.mock('@renderer/databases', () => ({
  default: {
    files: {
      get: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn())
  }
}))

describe('快捷助手截图图片消息渲染路径', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-temp-'))
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-files-'))
    storeFilesPath.current = storageDir
    vi.stubGlobal('window', {
      api: {
        file: {
          upload: vi.fn(async (file: FileMetadata) => mockUploadFile(file))
        }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fs.rmSync(tempDir, { recursive: true, force: true })
    fs.rmSync(storageDir, { recursive: true, force: true })
  })

  it('临时截图文件直接作为消息附件时，ImageBlock 渲染路径不存在（bug 复现）', () => {
    const file = makeTempImageMetadata()
    const block = createImageBlock('msg-1', { file, status: MessageBlockStatus.SUCCESS })
    expect(block.type).toBe(MessageBlockType.IMAGE)

    // ImageBlock 渲染 src：`file://${FileManager.getFilePath(block.file)}`
    const renderedPath = FileManager.getFilePath(block.file!)
    expect(fs.existsSync(file.path)).toBe(true) // 原始临时文件确实存在
    expect(fs.existsSync(renderedPath)).toBe(false) // 但渲染路径指向不存在的文件 → 图裂
  })

  it('发送前先 uploadFiles 入库后，ImageBlock 渲染路径真实存在（修复保证）', async () => {
    const file = makeTempImageMetadata()
    const uploaded = await FileManager.uploadFiles([file])

    const block = createImageBlock('msg-1', { file: uploaded[0], status: MessageBlockStatus.SUCCESS })
    const renderedPath = FileManager.getFilePath(block.file!)
    expect(fs.existsSync(renderedPath)).toBe(true)
    // 上传后元数据的 id/path 必须与磁盘文件一致（name === id+ext）
    expect(path.basename(uploaded[0].path)).toBe(uploaded[0].id + uploaded[0].ext)
  })

  it('runtime.filesPath 未初始化（mini 窗口实际场景）时，getFilePath 回退到 file.path，图片仍可加载', async () => {
    // 模拟 mini 窗口启动初期：filesPath 尚未从主进程取到，保持空字符串
    storeFilesPath.current = ''

    const file = makeTempImageMetadata()
    const uploaded = await FileManager.uploadFiles([file])

    const renderedPath = FileManager.getFilePath(uploaded[0])
    expect(renderedPath).toBe(uploaded[0].path) // 回退到元数据里的磁盘绝对路径
    expect(fs.existsSync(renderedPath)).toBe(true) // 指向真实文件 → 不会出现「本地文件可能已被清理」
  })
})
