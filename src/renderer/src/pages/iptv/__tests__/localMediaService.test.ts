import { describe, expect, it } from 'vitest'

import {
  clampRate,
  formatTime,
  hasResumePoint,
  isLocalUrl,
  isVideoFile,
  localFileUrl,
  nextLocalIndex,
  stepIndex
} from '../services/localMediaService'

describe('isLocalUrl（本地协议判定）', () => {
  it('file:// 前缀判定，空值安全', () => {
    expect(isLocalUrl('file:///D:/a.mp4')).toBe(true)
    expect(isLocalUrl('http://x/live.m3u8')).toBe(false)
    expect(isLocalUrl(null)).toBe(false)
    expect(isLocalUrl(undefined)).toBe(false)
  })
})

describe('hasResumePoint（断点有效性）', () => {
  it('超过 5 秒且未临近片尾 → 有效', () => {
    expect(hasResumePoint(30, 600)).toBe(true)
    expect(hasResumePoint(595, 600)).toBe(false) // 临近片尾
    expect(hasResumePoint(3, 600)).toBe(false) // 开头
  })
  it('时长未知时视为有效（起播路径兜底）', () => {
    expect(hasResumePoint(120, 0)).toBe(true)
  })
})

describe('clampRate（倍速夹取）', () => {
  it('范围 0.25-4', () => {
    expect(clampRate(1.5)).toBe(1.5)
    expect(clampRate(0.1)).toBe(0.25)
    expect(clampRate(9)).toBe(4)
  })
})

describe('localFileUrl（本地路径 → file:// URL）', () => {
  it('Windows 反斜杠路径 + 中文/空格/# 逐段编码，盘符冒号保留', () => {
    expect(localFileUrl('D:\\Movies\\我的 电影#1.mp4')).toBe(
      'file:///D:/Movies/%E6%88%91%E7%9A%84%20%E7%94%B5%E5%BD%B1%231.mp4'
    )
  })

  it('正斜杠路径原样分段', () => {
    expect(localFileUrl('C:/Videos/a b/c.mkv')).toBe('file:///C:/Videos/a%20b/c.mkv')
  })

  it('POSIX 路径', () => {
    expect(localFileUrl('/home/user/我的视频/x.webm')).toBe(
      'file:///home/user/%E6%88%91%E7%9A%84%E8%A7%86%E9%A2%91/x.webm'
    )
  })

  it('UNC 网络路径 → file://host/share/x', () => {
    expect(localFileUrl('\\\\NAS\\media\\a.mp4')).toBe('file://NAS/media/a.mp4')
  })
})

describe('isVideoFile（扩展名过滤）', () => {
  it('识别主流视频容器，大小写不敏感', () => {
    expect(isVideoFile('D:\\a.MP4')).toBe(true)
    expect(isVideoFile('/x/y.mkv')).toBe(true)
    expect(isVideoFile('b.WebM')).toBe(true)
    expect(isVideoFile('c.mov')).toBe(true)
    expect(isVideoFile('d.ts')).toBe(true)
  })

  it('拒绝非视频扩展名', () => {
    expect(isVideoFile('e.txt')).toBe(false)
    expect(isVideoFile('f.mp3')).toBe(false)
    expect(isVideoFile('g.m3u8')).toBe(false)
    expect(isVideoFile('noext')).toBe(false)
  })
})

describe('formatTime（秒 → 时间文本）', () => {
  it('分秒与跨小时', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(65)).toBe('01:05')
    expect(formatTime(3671)).toBe('1:01:11')
  })
  it('非法值兜底', () => {
    expect(formatTime(Number.NaN)).toBe('--:--')
    expect(formatTime(-1)).toBe('--:--')
  })
})

describe('nextLocalIndex（播完自动连播策略）', () => {
  it('order：顺序推进，末尾停止（null）', () => {
    expect(nextLocalIndex(0, 3, 'order')).toBe(1)
    expect(nextLocalIndex(2, 3, 'order')).toBeNull()
  })

  it('loopOne：原地循环', () => {
    expect(nextLocalIndex(1, 3, 'loopOne')).toBe(1)
  })

  it('shuffle：换一个且不越界；单视频原地', () => {
    for (let i = 0; i < 50; i++) {
      const next = nextLocalIndex(1, 3, 'shuffle')
      expect(next).not.toBe(1)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(3)
    }
    expect(nextLocalIndex(0, 1, 'shuffle')).toBe(0)
  })

  it('空列表/越界当前值 → null', () => {
    expect(nextLocalIndex(0, 0, 'order')).toBeNull()
    expect(nextLocalIndex(5, 3, 'order')).toBeNull()
  })
})

describe('stepIndex（手动上一个/下一个，环绕）', () => {
  it('前进与后退', () => {
    expect(stepIndex(0, 3, 1)).toBe(1)
    expect(stepIndex(2, 3, 1)).toBe(0) // 末尾环绕到开头
    expect(stepIndex(0, 3, -1)).toBe(2) // 开头环绕到末尾
  })
  it('未在播放（-1）时下一步 = 第一个', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0)
  })
  it('空列表 → null', () => {
    expect(stepIndex(0, 0, 1)).toBeNull()
  })
})
