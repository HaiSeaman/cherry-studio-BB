/**
 * 播放重连状态机（纯函数，可单测）：
 * 出错 → 若未达上限则按 1s/3s/5s 退避重试；第 3 次重试后仍出错 → failed；
 * 任一成功（playing）→ 全部复位。autoReconnect=false 时出错直接 failed。
 */

export type RetryState = {
  attempt: 0 | 1 | 2 | 3 // 已消耗的重试次数
  waitMs: number // 下一次退避等待毫秒数
  failed: boolean // 重试耗尽，最终失败
}

const WAIT_SCHEDULE = [1000, 3000, 5000] as const

export const initialRetry: RetryState = { attempt: 0, waitMs: 0, failed: false }

/** 播放出错：autoReconnect 关闭 → 直接失败；attempt<3 → 安排下一次退避；否则 → 最终失败 */
export function onRetryError(state: RetryState, autoReconnect: boolean): RetryState {
  if (!autoReconnect || state.attempt >= 3) return { attempt: state.attempt, waitMs: 0, failed: true }
  const attempt = (state.attempt + 1) as 1 | 2 | 3
  return { attempt, waitMs: WAIT_SCHEDULE[attempt - 1], failed: false }
}

/** 成功播放：复位 */
export function onRetryPlaying(_state: RetryState): RetryState {
  return initialRetry
}
