import { describe, expect, it } from 'vitest'

import { buildFinishTaskMessage, buildRunTaskMessage, newTaskId, parseServerEvent } from '../qwen'

const TASK_ID = 'abc123'

describe('qwen 实时语音识别协议（官方 WebSocket 原始协议）', () => {
  it('buildRunTaskMessage 构造符合官方格式的 run-task 报文', () => {
    const msg = JSON.parse(buildRunTaskMessage(TASK_ID, 'qwen-audio-3.0-asr-flash-streaming', 16000, 'pcm'))
    expect(msg.header).toEqual({ action: 'run-task', task_id: TASK_ID, streaming: 'duplex' })
    expect(msg.payload).toEqual({
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model: 'qwen-audio-3.0-asr-flash-streaming',
      parameters: { sample_rate: 16000, format: 'pcm' },
      input: {}
    })
  })

  it('buildFinishTaskMessage 构造 finish-task 报文', () => {
    const msg = JSON.parse(buildFinishTaskMessage(TASK_ID))
    expect(msg.header).toEqual({ action: 'finish-task', task_id: TASK_ID, streaming: 'duplex' })
    expect(msg.payload).toEqual({ input: {} })
  })

  it('parseServerEvent 解析 task-started', () => {
    expect(parseServerEvent(JSON.stringify({ header: { event: 'task-started' } }))).toEqual({ event: 'task-started' })
  })

  it('parseServerEvent 解析 result-generated 并取出 sentence 字段（text/begin/end/heartbeat）', () => {
    const raw = JSON.stringify({
      header: { event: 'result-generated' },
      payload: {
        output: {
          sentence: {
            begin_time: 170,
            end_time: 920,
            text: '好，我知道了',
            sentence_end: true,
            sentence_id: 1
          }
        }
      }
    })
    expect(parseServerEvent(raw)).toEqual({
      event: 'result-generated',
      sentence: { text: '好，我知道了', sentenceBegin: false, sentenceEnd: true, heartbeat: false }
    })
  })

  it('parseServerEvent 解析句首中间结果（sentence_begin=true）与心跳包（heartbeat=true）', () => {
    const begin = parseServerEvent(
      JSON.stringify({
        header: { event: 'result-generated' },
        payload: { output: { sentence: { text: '', sentence_begin: true, sentence_end: false, sentence_id: 1 } } }
      })
    )
    expect(begin).toEqual({
      event: 'result-generated',
      sentence: { text: '', sentenceBegin: true, sentenceEnd: false, heartbeat: false }
    })

    const heartbeat = parseServerEvent(
      JSON.stringify({
        header: { event: 'result-generated' },
        payload: { output: { sentence: { text: '', heartbeat: true, sentence_id: 0 } } }
      })
    )
    expect(heartbeat).toEqual({
      event: 'result-generated',
      sentence: { text: '', sentenceBegin: false, sentenceEnd: false, heartbeat: true }
    })
  })

  it('parseServerEvent 解析 task-finished', () => {
    expect(parseServerEvent(JSON.stringify({ header: { event: 'task-finished' } }))).toEqual({
      event: 'task-finished'
    })
  })

  it('parseServerEvent 解析 task-failed 并取出错误信息', () => {
    const raw = JSON.stringify({ header: { event: 'task-failed', error_message: '模型不存在' } })
    expect(parseServerEvent(raw)).toEqual({ event: 'task-failed', errorMessage: '模型不存在' })
  })

  it('parseServerEvent 对未知事件返回 unknown', () => {
    expect(parseServerEvent(JSON.stringify({ header: { event: 'whatever' } }))).toEqual({ event: 'unknown' })
  })

  it('newTaskId 生成 32 位十六进制字符串', () => {
    expect(newTaskId()).toMatch(/^[0-9a-f]{32}$/)
  })
})