import { soundDisplayName } from '@renderer/pages/settings/NotificationSoundRow'
import { describe, expect, it, vi } from 'vitest'

// 预置 renderer.setup 的 window.api 环境
describe('NotificationSoundRow 工具函数', () => {
  it('soundDisplayName 从 custom:<path> 提取文件名（含反斜杠路径）', () => {
    expect(soundDisplayName('custom:C:\\Users\\me\\sounds\\bell.mp3')).toBe('bell.mp3')
  })

  it('soundDisplayName 从 custom:<path> 提取文件名（含正斜杠路径）', () => {
    expect(soundDisplayName('custom:/home/user/sounds/ding.wav')).toBe('ding.wav')
  })

  it('soundDisplayName 对 default 返回 null', () => {
    expect(soundDisplayName('default')).toBeNull()
  })

  it('soundDisplayName 对空字符串返回 null', () => {
    expect(soundDisplayName('')).toBeNull()
  })
})

describe('通知声音播放', () => {
  it('自定义声音读取失败时回退默认（不抛错）', async () => {
    class MockAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      createGain() {
        return {
          gain: {
            value: 0,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          },
          connect: () => {}
        }
      }
      createOscillator() {
        return { type: '', frequency: { value: 0 }, connect: () => {}, start: () => {}, stop: () => {} }
      }
      resume() {
        return Promise.resolve()
      }
    }
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal('window', {
      api: {
        music: {
          readAudioFile: vi.fn().mockResolvedValue({ success: false })
        }
      }
    })
    // 仅验证不抛异常（解码路径在真实 AudioContext 下运行）
    const { playNotificationSound } = await import('@renderer/services/notificationSounds')
    expect(() => playNotificationSound('custom:C:\\missing.mp3')).not.toThrow()
  })
})
