import path from 'node:path'

import { readTextFileWithAutoEncoding } from '@main/utils/file'
import fs from 'fs/promises'

const MAX_SCAN_FILES = 2000
const MAX_SCAN_DEPTH = 10

export default class FileService {
  public static async readFile(_: Electron.IpcMainInvokeEvent, pathOrUrl: string, encoding?: BufferEncoding) {
    const path = pathOrUrl.startsWith('file://') ? new URL(pathOrUrl) : pathOrUrl
    if (encoding) return fs.readFile(path, { encoding })
    return fs.readFile(path)
  }

  /**
   * 自动识别编码，读取文本文件
   * @param _ event
   * @param pathOrUrl
   * @throws 路径不存在时抛出错误
   */
  public static async readTextFileWithAutoEncoding(_: Electron.IpcMainInvokeEvent, path: string): Promise<string> {
    return readTextFileWithAutoEncoding(path)
  }

  /**
   * 递归扫描目录，返回扩展名命中的文件（知识库文件夹导入用）。
   * 约束：≤2000 文件 / 深度 ≤10 / 跳过隐藏目录，防失控递归与超大目录。
   * @param extensions 小写含点扩展名白名单，如 ['.txt', '.md', '.pdf']（未传则全部文件）
   */
  public static async scanDir(
    _: Electron.IpcMainInvokeEvent,
    { folderPath, extensions, recursive = true }: { folderPath: string; extensions?: string[]; recursive?: boolean }
  ): Promise<{ success: boolean; files: { filePath: string; size: number }[]; truncated: boolean; error?: string }> {
    try {
      if (!path.isAbsolute(folderPath)) throw new Error('path must be absolute')
      const stat = await fs.stat(folderPath)
      if (!stat.isDirectory()) throw new Error('not a directory')

      const exts = (extensions ?? []).map((e) => e.toLowerCase())
      const files: { filePath: string; size: number }[] = []
      let truncated = false

      const walk = async (dir: string, depth: number): Promise<void> => {
        if (files.length >= MAX_SCAN_FILES) {
          truncated = true
          return
        }
        let entries
        try {
          entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          if (files.length >= MAX_SCAN_FILES) {
            truncated = true
            return
          }
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (recursive && depth < MAX_SCAN_DEPTH && !entry.name.startsWith('.')) {
              await walk(full, depth + 1)
            }
          } else if (entry.isFile()) {
            if (exts.length > 0 && !exts.includes(path.extname(entry.name).toLowerCase())) continue
            try {
              const st = await fs.stat(full)
              if (st.isFile()) files.push({ filePath: full, size: st.size })
            } catch {
              // 单文件 stat 失败跳过
            }
          }
        }
      }

      await walk(folderPath, 0)
      return { success: true, files, truncated }
    } catch (error) {
      return {
        success: false,
        files: [],
        truncated: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
