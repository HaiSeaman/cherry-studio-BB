import { loggerService } from '@logger'
import type { ClipboardItem, ClipboardLimits } from '@shared/IpcChannel'
import { IpcChannel } from '@shared/IpcChannel'
import { createHash, randomUUID } from 'crypto'
import type { NativeImage } from 'electron'
import { app, clipboard, nativeImage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

import {
  detectColor,
  normalizeItems,
  parseFileNameW,
  partitionProtected,
  pruneByCount,
  pruneByTime,
  sortForDisplay,
  stripHtmlText,
  upsertAndEvict
} from './clipboardLogic'
import { windowService } from './WindowService'

const logger = loggerService.withContext('ClipboardService')

/** 轮询间隔：Electron 无剪贴板变更事件，轮询是标准做法 */
const POLL_INTERVAL = 500
/** 单条文本上限：超过截断（保护 history.json 体积） */
const MAX_TEXT_LENGTH = 5000
/** 缩略图目标宽度（等比缩放） */
const THUMB_WIDTH = 240
/** 默认容量限制（需求4：条数 + 天数；收藏与置顶条目永不参与清理） */
const DEFAULT_LIMITS: ClipboardLimits = { maxItems: 500, maxDays: 30 }

/**
 * 主进程剪贴板历史服务（挂件剪贴板视图的后端）。
 * - 轮询捕获：文件路径 / 图片 / 富文本 HTML / 富文本 RTF / 文本（含十六进制色号识别）
 * - 数据:改写 memory + history.json；容量按 maxItems/maxDays 修剪（收藏与置顶不删）
 */
class ClipboardService {
  private items: ClipboardItem[] = []
  private limits: ClipboardLimits = { ...DEFAULT_LIMITS }
  private timer: NodeJS.Timeout | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private dir = ''
  private file = ''
  private limitsFile = ''
  private thumbsDir = ''
  /** 轮间变化闸门：与上一轮的快速特征相同则整轮跳过（防静止剪贴板反复入库/广播） */
  private lastCheapKey = ''
  /** 本次轮询待落盘的图片对象（仅新指纹图片才有值；capture 消费后置空） */
  private pendingImage: { image: NativeImage; size: { width: number; height: number }; png: Buffer } | null = null

  init(): void {
    this.dir = join(app.getPath('userData'), 'clipboard')
    this.file = join(this.dir, 'history.json')
    this.limitsFile = join(this.dir, 'limits.json')
    this.thumbsDir = join(this.dir, 'thumbs')
    try {
      if (!existsSync(this.thumbsDir)) mkdirSync(this.thumbsDir, { recursive: true })
      if (existsSync(this.file)) {
        const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf-8'))
        if (Array.isArray(parsed)) this.items = normalizeItems(parsed)
      }
      if (existsSync(this.limitsFile)) {
        const lim = JSON.parse(readFileSync(this.limitsFile, 'utf-8')) as Partial<ClipboardLimits>
        if (typeof lim.maxItems === 'number' && lim.maxItems > 0) this.limits.maxItems = Math.floor(lim.maxItems)
        if (typeof lim.maxDays === 'number' && lim.maxDays > 0) this.limits.maxDays = Math.floor(lim.maxDays)
      }
    } catch (error) {
      logger.warn('clipboard history load failed (start with empty)', { error })
      this.items = []
    }
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL)
    logger.info('clipboard service started', { items: this.items.length, limits: this.limits })
  }

  stop(): void {
    // 退出前把防抖中的待保存历史同步落盘（否则最后 800ms 内的变更会丢）
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      this.saveNow()
    }
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** 轮询一次：构造本轮快速特征 → 与上轮相同则整轮跳过 → 变化才入库（入库内含指纹去重提升） */
  private poll(): void {
    try {
      const formats = clipboard.availableFormats()
      let cheap: string | null = null
      let make: (() => ClipboardItem) | null = null

      // 1) 文件（Windows：FileNameW 宽字符路径列表）。路径串本身即指纹，零成本且精确
      //    解析失败（声明了格式但无数据）时降级继续尝试后续格式
      if (formats.includes('FileNameW')) {
        const paths = parseFileNameW(clipboard.readBuffer('FileNameW'))
        if (paths) {
          const fp = 'f|' + paths.join('|')
          cheap = fp
          make = () => ({ id: randomUUID(), type: 'files', ts: Date.now(), pinned: false, fav: false, fingerprint: fp, paths })
        }
      }
      // 2) 图片（需求5：完整保留原图 → PNG 原件落盘，见 capture）
      if (!make && formats.some((f) => f.startsWith('image/'))) {
        const image = clipboard.readImage()
        if (!image.isEmpty()) {
          const size = image.getSize()
          const png = image.toPNG()
          // ponytail: 图片指纹每轮重算（toPNG+md5），保证"同尺寸不同内容"连续截图不漏；
          // 实测 CPU 偏高时可改尺寸短路（接受同尺寸漏图）
          const fp = 'i|' + createHash('md5').update(png).digest('hex')
          cheap = fp
          if (this.items.every((i) => i.fingerprint !== fp)) {
            this.pendingImage = { image, size, png }
          }
          make = () => ({
            id: randomUUID(), type: 'image', ts: Date.now(), pinned: false, fav: false, fingerprint: fp,
            imageW: size.width, imageH: size.height
          })
        }
      }
      // 3) 富文本 HTML（需求5：完整保留原文；复制网页时通常与纯文本并存，优先富文本）
      if (!make && (formats.includes('text/html') || formats.includes('text/HTML'))) {
        const html = clipboard.readHTML()
        if (html) {
          cheap = 'h|' + html
          make = () => ({
            id: randomUUID(), type: 'html', ts: Date.now(), pinned: false, fav: false,
            fingerprint: 'h|' + html, html
          })
        }
      }
      // 4) 富文本 RTF（需求5：完整保留原文）
      if (!make && (formats.includes('text/rtf') || formats.includes('text/RTF'))) {
        const rtf = clipboard.readRTF()
        if (rtf) {
          cheap = 'r|' + rtf
          make = () => ({
            id: randomUUID(), type: 'rtf', ts: Date.now(), pinned: false, fav: false,
            fingerprint: 'r|' + rtf, rtf
          })
        }
      }
      // 5) 文本（兜底；十六进制色号识别为 color 类型，需求5）
      if (!make) {
        const text = clipboard.readText()
        if (text) {
          const clipped = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text
          const color = detectColor(clipped)
          if (color) {
            cheap = 'c|' + color
            make = () => ({
              id: randomUUID(), type: 'color', ts: Date.now(), pinned: false, fav: false,
              fingerprint: 'c|' + color, text: color
            })
          } else {
            cheap = 't|' + clipped
            make = () => ({
              id: randomUUID(), type: 'text', ts: Date.now(), pinned: false, fav: false,
              fingerprint: 't|' + clipped, text: clipped
            })
          }
        }
      }
      if (make && cheap && cheap !== this.lastCheapKey) {
        this.lastCheapKey = cheap
        this.capture(make())
      }
    } catch (error) {
      // 剪贴板被锁定（如某些密码管理器写入瞬间）等瞬时错误：忽略，下一轮重试
      logger.debug('clipboard poll error', { error })
    }
  }

  private capture(item: ClipboardItem): void {
    if (item.type === 'image' && this.pendingImage) {
      const { image, size, png } = this.pendingImage
      this.pendingImage = null
      // 需求5：完整保留原图 → 原件 PNG + 预览缩略图双文件
      const filePath = join(this.thumbsDir, `${item.id}.png`)
      const thumbPath = join(this.thumbsDir, `${item.id}.thumb.png`)
      try {
        writeFileSync(filePath, png)
        const thumb = size.width > THUMB_WIDTH ? image.resize({ width: THUMB_WIDTH }) : image
        writeFileSync(thumbPath, thumb.toPNG())
        item.imageFile = filePath
        item.thumbPath = thumbPath
      } catch (error) {
        logger.warn('image save failed, item degraded', { error })
      }
    }
    const { items, evicted } = upsertAndEvict(this.items, item, this.limits.maxItems)
    // 需求4：天数修剪（收藏/置顶双保护）
    const { items: pruned, evicted: byTime } = pruneByTime(items, Date.now(), this.limits.maxDays)
    this.items = pruned
    for (const e of [...evicted, ...byTime]) this.removeThumb(e)
    this.scheduleSave()
    this.broadcast()
  }

  private removeThumb(item: ClipboardItem): void {
    // 原件 + 缩略图两个文件一并清理
    for (const p of [item.thumbPath, item.imageFile]) {
      if (p && existsSync(p)) {
        try {
          rmSync(p)
        } catch {
          /* 删除失败留孤儿文件，无害 */
        }
      }
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveNow()
    }, 800)
  }

  private saveNow(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.items))
    } catch (error) {
      logger.warn('clipboard history save failed', { error })
    }
  }

  private persistLimits(): void {
    try {
      writeFileSync(this.limitsFile, JSON.stringify(this.limits))
    } catch (error) {
      logger.warn('clipboard limits save failed', { error })
    }
  }

  private broadcast(): void {
    windowService.getMusicWidget()?.webContents.send(IpcChannel.Clipboard_OnUpdate, sortForDisplay(this.items))
  }

  /** ================= IPC 处理（挂件端调用） ================= */

  getHistory(): ClipboardItem[] {
    return sortForDisplay(this.items)
  }

  copyItem(id: string): void {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    if (item.type === 'text' || item.type === 'color') {
      if (item.text) clipboard.writeText(item.text)
    } else if (item.type === 'html' && item.html) {
      // 富文本：回写 HTML（带纯文本兜底，目标应用两种都能用）
      clipboard.write({ html: item.html, text: stripHtmlText(item.html) })
    } else if (item.type === 'rtf' && item.rtf) {
      clipboard.writeRTF(item.rtf)
    } else if (item.type === 'image') {
      // 需求5：点击复制回【原图】（原件缺省时退化为缩略图）
      const src = item.imageFile && existsSync(item.imageFile) ? item.imageFile : item.thumbPath
      if (src && existsSync(src)) {
        const img = nativeImage.createFromPath(src)
        if (!img.isEmpty()) clipboard.writeImage(img)
      }
    } else if (item.type === 'files' && item.paths?.length) {
      // Electron 无写文件列表 API：写为换行分隔的路径文本（可粘贴，语义等价可回放）
      clipboard.writeText(item.paths.join('\n'))
    }
  }

  setPinned(id: string, pinned: boolean): void {
    const item = this.items.find((i) => i.id === id)
    if (!item || item.pinned === pinned) return
    item.pinned = pinned
    this.scheduleSave()
    this.broadcast()
  }

  setFav(id: string, fav: boolean): void {
    const item = this.items.find((i) => i.id === id)
    if (!item || item.fav === fav) return
    item.fav = fav
    this.scheduleSave()
    this.broadcast()
  }

  deleteItem(id: string): void {
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    this.removeThumb(item)
    this.items = this.items.filter((i) => i.id !== id)
    this.scheduleSave()
    this.broadcast()
  }

  /** 需求3：清空所有未收藏且未固定的条目（收藏与置顶的消息永不被删除，不受上限限制） */
  clearUnfav(): number {
    const { keep, removed } = partitionProtected(this.items)
    for (const item of removed) this.removeThumb(item)
    this.items = keep
    // 重置"轮间变化闸门"：清空后用户再次复制与历史相同的内容也能正常重新入库
    // （否则 lastCheapKey 仍是旧内容特征，poller 会整轮跳过，条目永久不出现）
    this.lastCheapKey = ''
    this.scheduleSave()
    this.broadcast()
    return removed.length
  }

  getLimits(): ClipboardLimits {
    return { ...this.limits }
  }

  setLimits(maxItems: number, maxDays: number): void {
    const items = Math.floor(Number(maxItems))
    const days = Math.floor(Number(maxDays))
    this.limits.maxItems = Number.isFinite(items) && items > 0 ? items : DEFAULT_LIMITS.maxItems
    this.limits.maxDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_LIMITS.maxDays
    // 立即按新上限修剪一次，保证"容量设置"即时生效（收藏/置顶双保护）
    const { items: pruned, evicted } = pruneByCount(this.items, this.limits.maxItems)
    const { items: byTime, evicted: evictedByTime } = pruneByTime(pruned, Date.now(), this.limits.maxDays)
    this.items = byTime
    for (const e of [...evicted, ...evictedByTime]) this.removeThumb(e)
    this.persistLimits()
    this.scheduleSave()
    this.broadcast()
  }
}

export const clipboardService = new ClipboardService()