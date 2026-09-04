import { describe, expect, it } from 'vitest'

import type { ClipboardItem } from '../clipboardLogic'
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
} from '../clipboardLogic'

const text = (id: string, content: string, ts: number, pinned = false, fav = false): ClipboardItem => ({
  id,
  type: 'text',
  ts,
  pinned,
  fav,
  fingerprint: 't|' + content
})

describe('upsertAndEvict', () => {
  it('新条目插入最前', () => {
    const { items } = upsertAndEvict([text('a', 'A', 1), text('b', 'B', 2)], text('c', 'C', 3))
    expect(items.map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('指纹命中已有条目 → 保留位置与时间戳，不提升置顶（点击复制不再自动排序）', () => {
    const base = [text('a', 'A', 1, false, true), text('b', 'B', 2)]
    const { items } = upsertAndEvict(base, { ...text('x', 'A', 9) })
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('a')
    expect(items[0].fav).toBe(true) // 收藏标志随条目标签保留
    expect(items[0].ts).toBe(1) // 时间戳不被刷新为 9
    expect(items[1].id).toBe('b') // 位置不被提升
  })

  it('命中中间的条目也不改变其相对位置', () => {
    const base = [text('a', 'A', 3), text('b', 'B', 2), text('c', 'C', 1)]
    const { items } = upsertAndEvict(base, { ...text('x', 'B', 99) })
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(items.find((i) => i.id === 'b')?.ts).toBe(2)
  })

  it('超限淘汰最旧的非收藏非固定条目，收藏与固定永不被淘汰', () => {
    const items = [
      text('p', 'P', 0, true),
      text('f', 'F', 0, false, true),
      ...Array.from({ length: 5 }, (_, i) => text(`n${i}`, `N${i}`, i + 1))
    ]
    const { items: next, evicted } = upsertAndEvict(items, text('new', 'NEW', 99), 5)
    expect(next.some((i) => i.id === 'p')).toBe(true)
    expect(next.some((i) => i.id === 'f')).toBe(true)
    // 上限按未保护条目数计：2 保护 + 5 未保护 + 1 新条目 → 超额 1 条，淘汰 ts 最旧的 n0
    expect(evicted.map((i) => i.id)).toEqual(['n0'])
    expect(next.filter((i) => !i.fav && !i.pinned)).toHaveLength(5)
  })

  it('未超限不淘汰', () => {
    const { items, evicted } = upsertAndEvict([text('a', 'A', 1)], text('b', 'B', 2), 200)
    expect(evicted).toHaveLength(0)
    expect(items).toHaveLength(2)
  })
})

describe('pruneByTime', () => {
  const now = 1_000_000_000_000
  it('删除超期未收藏未固定条目；收藏与固定幸存', () => {
    const items = [
      text('old', 'O', now - 40 * 86400_000),
      text('favOld', 'F', now - 40 * 86400_000, false, true),
      text('pinOld', 'P', now - 40 * 86400_000, true),
      text('fresh', 'N', now - 1000)
    ]
    const { items: next, evicted } = pruneByTime(items, now, 30)
    expect(evicted.map((i) => i.id)).toEqual(['old'])
    expect(next.map((i) => i.id)).toEqual(['favOld', 'pinOld', 'fresh'])
  })
})

describe('pruneByCount', () => {
  it('超限仅淘汰未收藏未固定中最旧者（按 ts 而非列表位置）', () => {
    // 故意乱序插入：验证淘汰按 ts，不按数组位置
    const items = [text('mid', 'M', 50), text('old', 'O', 1), text('new', 'N', 90)]
    const { items: next, evicted } = pruneByCount(items, 2)
    expect(evicted.map((i) => i.id)).toEqual(['old'])
    expect(next.map((i) => i.id)).toEqual(['mid', 'new'])
  })
})

describe('partitionProtected', () => {
  it('清空时保留收藏与置顶，其余待删除', () => {
    const items = [
      text('a', 'A', 1),
      text('f', 'F', 2, false, true),
      text('p', 'P', 3, true),
      text('fp', 'FP', 4, true, true)
    ]
    const { keep, removed } = partitionProtected(items)
    expect(keep.map((i) => i.id)).toEqual(['f', 'p', 'fp'])
    expect(removed.map((i) => i.id)).toEqual(['a'])
  })

  it('空列表返回空', () => {
    const { keep, removed } = partitionProtected([])
    expect(keep).toHaveLength(0)
    expect(removed).toHaveLength(0)
  })
})

describe('sortForDisplay', () => {
  it('收藏/固定区在前（ts 倒序），其余按 ts 倒序', () => {
    const items = [text('a', 'A', 1), text('f2', 'P2', 8, false, true), text('b', 'B', 5), text('p1', 'P1', 3, true)]
    const sorted = sortForDisplay(items)
    expect(sorted.map((i) => i.id)).toEqual(['f2', 'p1', 'b', 'a'])
  })
})

describe('detectColor', () => {
  it('合法色号（带 #，3/6/8 位）识别并规范化大写', () => {
    expect(detectColor('#FF0000')).toBe('#FF0000')
    expect(detectColor('#ff00aa00')).toBe('#FF00AA00')
    expect(detectColor('#abc')).toBe('#AABBCC')
    expect(detectColor('  #Abc ')).toBe('#AABBCC')
    expect(detectColor('#2e9bd6')).toBe('#2E9BD6')
  })

  it('无 # 前缀 / 非法内容一律不是色号（防普通文本误判）', () => {
    for (const bad of ['hello', '#GGGGGG', '#12345', '12345', '2e9bd6', 'red', '#1234567', '']) {
      expect(detectColor(bad), bad).toBeNull()
    }
  })

  it('整段文本必须是色号：URL 结尾 #abc、句中含色号都不误判（回归：^ 锚点）', () => {
    expect(detectColor('https://x.com/page#abc')).toBeNull()
    expect(detectColor('颜色 #FF0000 真好看')).toBeNull()
    expect(detectColor('你好：#33ccff')).toBeNull()
  })
})

describe('stripHtmlText', () => {
  it('去标签与实体得到纯文本预览', () => {
    expect(stripHtmlText('<p>a&amp;<b>你好</b></p>')).toBe('a& 你好')
    expect(stripHtmlText('<!-- 注释 -->x')).toBe('x')
    expect(stripHtmlText('')).toBe('')
  })
})

describe('normalizeItems', () => {
  it('补齐缺失的 pinned/fav 布尔字段（兼容旧持久化数据）', () => {
    const raw = [
      { id: '1', fingerprint: 't|a', type: 'text', ts: 1, text: 'a' },
      { bad: true },
      { id: '2', fingerprint: 't|b', type: 'text', ts: 2, pinned: true, text: 'b' }
    ]
    const items = normalizeItems(raw)
    expect(items).toHaveLength(2)
    expect(items[0].pinned).toBe(false)
    expect(items[0].fav).toBe(false)
    expect(items[1].pinned).toBe(true)
    expect(items[1].fav).toBe(false)
  })
})

describe('parseFileNameW', () => {
  const encode = (paths: string[]): Buffer => Buffer.from(paths.join('\0') + '\0\0', 'utf16le')

  it('解析 UTF-16LE 双零结尾路径列表', () => {
    const paths = parseFileNameW(encode(['C:\\a\\报告.docx', 'D:\\图.png']))
    expect(paths).toEqual(['C:\\a\\报告.docx', 'D:\\图.png'])
  })

  it('单路径也能解析', () => {
    expect(parseFileNameW(encode(['C:\\x.txt']))).toEqual(['C:\\x.txt'])
  })

  it('空/坏输入返回 null（降级）', () => {
    expect(parseFileNameW(null)).toBeNull()
    expect(parseFileNameW(Buffer.alloc(0))).toBeNull()
    expect(parseFileNameW(Buffer.from([0, 0]))).toBeNull()
  })
})