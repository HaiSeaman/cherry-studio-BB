import type { Model } from '@renderer/types'
import { describe, expect, it } from 'vitest'

import { isVideoModel } from '../video'

function makeModel(id: string): Model {
  return { id, name: id, provider: 'dashscope' } as Model
}

describe('isVideoModel', () => {
  it.each([
    'wan2.2-t2v-plus',
    'wan2.6-i2v-flash',
    'wanx-t2v',
    'doubao-seedance-1-0-lite-t2v-250428',
    'seedance-1.0-pro',
    'hunyuan-video-standard',
    'hunyuan-video'
  ])('命中视频模型 %s', (id) => {
    expect(isVideoModel(makeModel(id))).toBe(true)
  })

  it.each([
    'wan2.5-t2i',
    'qwen-image',
    'gpt-4o',
    'seedream-4.0',
    'doubao-pro-32k',
    'hunyuan-turbos-latest'
  ])('不命中非视频模型 %s', (id) => {
    expect(isVideoModel(makeModel(id))).toBe(false)
  })

  it('undefined 模型返回 false', () => {
    expect(isVideoModel(undefined)).toBe(false)
  })
})
