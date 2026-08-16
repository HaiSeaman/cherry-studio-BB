import { describe, expect, it, vi } from 'vitest'

import {
  fetchTrackMetadata,
  fixHistoryAfterDelete,
  fixIndexAfterDelete,
  fixIndexAfterMove,
  formatTime,
  nextIndexInPool,
  prevIndexInPool,
  pushShuffleHistory,
  toFileUrl
} from '../services/playLogic'

describe('formatTime', () => {
  it('格式化秒数为 m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(754)).toBe('12:34')
    expect(formatTime(-5)).toBe('0:00')
    expect(formatTime(NaN)).toBe('0:00')
  })
})

describe('nextIndexInPool', () => {
  const pool = [0, 1, 2, 3]

  it('顺序模式到尾回绕到池首', () => {
    expect(nextIndexInPool(pool, 2, 'sequential')).toBe(3)
    expect(nextIndexInPool(pool, 3, 'sequential')).toBe(0)
  })

  it('随机模式返回异于当前的索引', () => {
    for (let i = 0; i < 20; i++) {
      const n = nextIndexInPool(pool, 1, 'shuffle')
      expect(n).not.toBe(1)
      expect(pool).toContain(n)
    }
  })

  it('单元素池随机时返回自身', () => {
    expect(nextIndexInPool([5], 5, 'shuffle')).toBe(5)
  })

  it('空池返回 -1，current 不在池中从池首开始', () => {
    expect(nextIndexInPool([], 0, 'sequential')).toBe(-1)
    expect(nextIndexInPool(pool, -1, 'sequential')).toBe(0)
  })
})

describe('prevIndexInPool', () => {
  it('到首回绕到池尾', () => {
    expect(prevIndexInPool([0, 1, 2], 0)).toBe(2)
    expect(prevIndexInPool([0, 1, 2], 2)).toBe(1)
    expect(prevIndexInPool([], 0)).toBe(-1)
  })
})

describe('pushShuffleHistory', () => {
  it('移除已有同索引再入栈，上限 100', () => {
    let h = pushShuffleHistory([], 3)
    h = pushShuffleHistory(h, 5)
    h = pushShuffleHistory(h, 3)
    expect(h).toEqual([5, 3])
    for (let i = 0; i < 120; i++) h = pushShuffleHistory(h, i + 10)
    expect(h.length).toBe(100)
    expect(h[h.length - 1]).toBe(129)
  })
})

describe('fixIndexAfterDelete', () => {
  it('删前 current 前移；删后不变；删自身返回原位', () => {
    expect(fixIndexAfterDelete(2, 5)).toBe(4)
    expect(fixIndexAfterDelete(7, 5)).toBe(5)
    expect(fixIndexAfterDelete(5, 5)).toBe(5)
    expect(fixIndexAfterDelete(0, 0)).toBe(0)
  })
})

describe('fixHistoryAfterDelete', () => {
  it('等于 deleted 的删除，大于 deleted 的减一', () => {
    expect(fixHistoryAfterDelete([1, 3, 5, 7], 3)).toEqual([1, 4, 6])
    expect(fixHistoryAfterDelete([2, 4], 4)).toEqual([2])
  })
})

describe('fixIndexAfterMove', () => {
  it('当前曲被移动/前移交叉/后移交叉/无关移动 四种情况（照文档 §4.8）', () => {
    expect(fixIndexAfterMove(2, 6, 2)).toBe(6) // 当前曲被移动
    expect(fixIndexAfterMove(2, 6, 4)).toBe(3) // 前移越过当前 → current-1
    expect(fixIndexAfterMove(6, 2, 4)).toBe(5) // 后移到当前前 → current+1
    expect(fixIndexAfterMove(0, 5, 3)).toBe(2) // [A,B,C,D..]把A移到末尾，D 左移一位
    expect(fixIndexAfterMove(0, 1, 3)).toBe(3) // 移动完全在 current 之前不交叉 → 不变
  })
})

describe('toFileUrl', () => {
  it('Windows 反斜杠/中文/# 都正确编码', () => {
    expect(toFileUrl('D:\\Music\\晴天.mp3')).toBe('file:///D:/Music/%E6%99%B4%E5%A4%A9.mp3')
    expect(toFileUrl('C:/a b/song#1.mp3')).toBe('file:///C:/a%20b/song%231.mp3')
    expect(toFileUrl('/home/user/a.mp3')).toBe('file:///home/user/a.mp3')
  })
})

describe('fetchTrackMetadata', () => {
  it('IPC 失败时降级用文件名当标题', async () => {
    const api = { music: { readMetadata: vi.fn().mockResolvedValue({ success: false, error: 'x' }) } }
    vi.stubGlobal('window', { api })
    const meta = await fetchTrackMetadata('D:\\Music\\晴天 - 周杰伦.mp3')
    expect(meta.title).toBe('晴天 - 周杰伦')
    expect(meta.artist).toBe('')
    expect(meta.duration).toBe(0)
    vi.unstubAllGlobals()
  })

  it('IPC 成功时透传元数据', async () => {
    const api = {
      music: {
        readMetadata: vi.fn().mockResolvedValue({
          success: true,
          metadata: { title: 'T', artist: 'A', album: 'B', duration: 100, coverPath: 'c', thumbPath: 't' }
        })
      }
    }
    vi.stubGlobal('window', { api })
    const meta = await fetchTrackMetadata('D:/x.mp3')
    expect(meta.title).toBe('T')
    expect(meta.duration).toBe(100)
    vi.unstubAllGlobals()
  })
})
