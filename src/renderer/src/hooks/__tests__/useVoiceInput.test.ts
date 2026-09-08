import { describe, expect, it } from 'vitest'

import { concatPcm, resampleTo16k } from '../useVoiceInput'

describe('resampleTo16k', () => {
  it('48kHz 输入 6 个样本 → 输出 2 个样本（每 3 取均值）', () => {
    const out = resampleTo16k(new Float32Array([0, 0.5, 0.5, -0.5, -0.5, -1]), 48000)
    expect(out.length).toBe(2)
    // 第 1 组 [0,0.5,0.5] 均值 1/3 → int16 ≈ 10922
    expect(out[0]).toBe(Math.round((1 / 3) * 32767))
    // 第 2 组 [-0.5,-0.5,-1] 均值 -2/3 → int16 ≈ -21845
    expect(out[1]).toBe(Math.round((-2 / 3) * 32767))
  })

  it('16kHz 输入 → 原样输出（1:1）', () => {
    const out = resampleTo16k(new Float32Array([0.25, -0.25, 1, -1]), 16000)
    expect(out.length).toBe(4)
    expect(out[0]).toBe(Math.round(0.25 * 32767))
    expect(out[2]).toBe(32767)
    expect(out[3]).toBe(-32768)
  })

  it('超界样本被裁剪（clamp）', () => {
    const out = resampleTo16k(new Float32Array([2, -2]), 16000)
    expect(out[0]).toBe(32767)
    expect(out[1]).toBe(-32768)
  })

  it('空输入 → 空输出', () => {
    expect(resampleTo16k(new Float32Array(0), 48000).length).toBe(0)
  })

  it('44100Hz 输入输出长度按比例向下取整', () => {
    const out = resampleTo16k(new Float32Array(4410), 44100)
    expect(out.length).toBe(1600) // 4410 * 16000/44100 = 1600
  })
})

describe('concatPcm', () => {
  it('拼接两个 Int16 数组', () => {
    const out = concatPcm(new Int16Array([1, 2]), new Int16Array([3, 4, 5]))
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5])
  })

  it('空数组拼接不变', () => {
    expect(Array.from(concatPcm(new Int16Array(0), new Int16Array([7])))).toEqual([7])
  })
})