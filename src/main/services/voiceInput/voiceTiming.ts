/**
 * 语音输入的阶段耗时账本。
 *
 * 为什么要有它：主人反馈"说快了开头几个字会丢"。要判断这段丢失是不是麦克风启动太慢造成的，
 * 就得先量出「按下快捷键 → 第一块音频到达主进程」的真实毫秒数。
 * 这个数字还直接决定要不要把麦克风预热常开：预热能省掉这段延迟，但代价是麦克风指示灯一直亮着，
 * 所以先量再决定，不凭猜。
 */
export interface VoiceTimingMarks {
  /** 按下快捷键（主进程收到键盘钩子事件） */
  start?: number
  /** 第一块音频到达主进程（含渲染进程 getUserMedia + AudioContext + 100ms 分块缓冲） */
  firstAudio?: number
  /** 第一次识别结果返回 */
  firstResult?: number
  /** 松手，开始等最终结果 */
  finalizeStart?: number
  /** 最终文本上屏完成 */
  finalizeEnd?: number
}

/** 把各阶段时间戳拼成一行人类可读的耗时摘要（缺的节点显示 -） */
export function formatVoiceTiming(marks: VoiceTimingMarks): string {
  const span = (from?: number, to?: number): string =>
    from === undefined || to === undefined ? '-' : `${to - from}ms`

  return [
    `按下→首块音频 ${span(marks.start, marks.firstAudio)}`,
    `按下→首次识别 ${span(marks.start, marks.firstResult)}`,
    `松手→最终文本 ${span(marks.finalizeStart, marks.finalizeEnd)}`
  ].join('；')
}
