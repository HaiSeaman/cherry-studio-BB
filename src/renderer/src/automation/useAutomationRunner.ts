import { loggerService } from '@logger'
import { useEffect } from 'react'

import { executeAutomationTask } from './runner'

const logger = loggerService.withContext('useAutomationRunner')

/** 正在运行的任务（防同一任务重入） */
const runningTasks = new Set<string>()

/**
 * 顶层监听主进程的自动化任务触发（automation:trigger-run）。
 * 挂载在 App 顶层，主窗口隐藏（托盘）时监听依然有效。
 */
export function useAutomationRunner() {
  useEffect(() => {
    const off = window.api.automation.onTriggerRun(async ({ task, runId }) => {
      if (runningTasks.has(task.id)) {
        logger.warn('Automation task already running in renderer, ignoring trigger', { taskId: task.id })
        await window.api.automation.finishRun(runId, {
          status: 'failed',
          error: '该任务已有一次运行正在进行，本次触发已忽略'
        })
        return
      }
      runningTasks.add(task.id)
      try {
        await executeAutomationTask(task, runId)
      } finally {
        runningTasks.delete(task.id)
      }
    })
    return off
  }, [])
}
