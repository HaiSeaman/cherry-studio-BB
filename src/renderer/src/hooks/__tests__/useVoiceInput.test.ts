import { describe, expect, it } from 'vitest'

import { CHUNK_SAMPLES, concatPcm, createPcmChunker, resampleTo16k } from '../useVoiceInput'

describe('resampleTo16k', () => {
  it('48kHz 输入 6 个样本 → 输出 2 个样本（长度按比例向下取整）', () => {
    const out = resampleTo16k(new Float32Array([0, 0.5, 0.5, -0.5, -0.5, -1]), 48000)
    expect(out.length).toBe(2)
    // 值不再逐字断言：抗混叠滤波在这么短的信号上会被首尾瞬态主导，断言具体数值等于锁死实现细节
    for (const v of out) expect(Number.isInteger(v)).toBe(true)
  })

  it('16kHz 输入 → 原样输出（1:1，不做任何滤波）', () => {
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

  it('低于目标采样率（8kHz 上采样）不产生 NaN（防御 end==start 除零）', () => {
    const out = resampleTo16k(new Float32Array([0.5, -0.5, 0.25, -0.25]), 8000)
    expect(out.length).toBe(8) // 4 * 16000/8000 = 8
    // 8k→16k 上采样 ratio=0.5，部分区间 end==start；修复前 sum/(end-start) 除零得 NaN 污染整段 PCM
    for (const v of out) {
      expect(Number.isNaN(v)).toBe(false)
    }
  })
})

/** 某个频率的正弦经过降采样后的残留幅度（1 = 完全保留，0 = 完全滤掉） */
const residualAt = (freq: number, inputRate: number): number => {
  const length = Math.floor(inputRate / 2) // 0.5 秒
  const input = new Float32Array(length)
  for (let i = 0; i < length; i++) input[i] = Math.sin((2 * Math.PI * freq * i) / inputRate)

  const out = resampleTo16k(input, inputRate)
  // 只统计中间 80%：避开滤波器的首尾瞬态
  const from = Math.floor(out.length * 0.1)
  const to = Math.floor(out.length * 0.9)
  let sum = 0
  for (let i = from; i < to; i++) sum += (out[i] / 32768) ** 2
  return Math.sqrt(sum / (to - from)) / Math.SQRT1_2 // 正弦的有效值 = 1/√2
}

describe('resampleTo16k 抗混叠（48k → 16k）', () => {
  it('超过 8kHz 奈奎斯特的分量必须被真正滤掉，不能折叠回可听频段', () => {
    // 修复前只是 3 点均值，10kHz 还能漏进 48.9%（等于给识别引擎喂了一层杂音）
    expect(residualAt(10000, 48000)).toBeLessThan(0.15)
  })

  it('语音主频与辅音区（1k / 3k / 6k）不能被削掉', () => {
    expect(residualAt(1000, 48000)).toBeGreaterThan(0.9)
    expect(residualAt(3000, 48000)).toBeGreaterThan(0.9)
    expect(residualAt(6000, 48000)).toBeGreaterThan(0.85)
  })

  it('恒定电平（直流）经过滤波后幅度不变：直流增益必须归一化为 1', () => {
    const out = resampleTo16k(new Float32Array(4800).fill(0.5), 48000)
    expect(out.at(-1)).toBe(Math.round(0.5 * 32767))
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

describe('createPcmChunker（按 100ms 分包送给主进程）', () => {
  it('16kHz 输入攒够一块就发，块长固定 100ms', () => {
    const chunks: Int16Array[] = []
    const chunker = createPcmChunker(16000, (chunk) => chunks.push(chunk))

    chunker.push(new Float32Array(CHUNK_SAMPLES))

    expect(chunks).toHaveLength(1)
    expect(chunks[0].length).toBe(CHUNK_SAMPLES)
  })

  it('不足一块先攒着，补齐后发整块，余量留到下一批', () => {
    const chunks: Int16Array[] = []
    const chunker = createPcmChunker(16000, (chunk) => chunks.push(chunk))

    chunker.push(new Float32Array(1000))
    expect(chunks).toHaveLength(0) // 不够一块不许发

    chunker.push(new Float32Array(1000)) // 累计 2000 → 发 1600，余 400
    expect(chunks).toHaveLength(1)

    chunker.push(new Float32Array(1200)) // 400 + 1200 = 1600 → 再发一块
    expect(chunks).toHaveLength(2)
    expect(chunks[1].length).toBe(CHUNK_SAMPLES)
  })

  it('flush 交出不足一块的余量（不丢尾音），且交完就清空', () => {
    const chunker = createPcmChunker(16000, () => {})

    chunker.push(new Float32Array(500))

    expect(chunker.flush().length).toBe(500)
    expect(chunker.flush().length).toBe(0)
  })

  it('48kHz 输入先降采样再分包：4800 个输入样本正好一块', () => {
    const chunks: Int16Array[] = []
    const chunker = createPcmChunker(48000, (chunk) => chunks.push(chunk))

    chunker.push(new Float32Array(4800)) // 4800 / 3 = 1600

    expect(chunks).toHaveLength(1)
    expect(chunks[0].buffer.byteLength).toBe(3200) // 16kHz 16bit 单声道 100ms = 3200 字节
  })

  it('一次送进来多块音频时全部按顺序发出', () => {
    const chunks: Int16Array[] = []
    const chunker = createPcmChunker(16000, (chunk) => chunks.push(chunk))

    chunker.push(new Float32Array(CHUNK_SAMPLES * 3 + 10))

    expect(chunks).toHaveLength(3)
    expect(chunker.flush().length).toBe(10)
  })
})