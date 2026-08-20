import { NotificationService } from '@renderer/services/NotificationService'
import type { AutomationSystemToolId } from '@shared/automation'
import { tool, type ToolSet } from 'ai'
import * as z from 'zod'

/** 工具结果文本截断长度 */
const MAX_RESULT_LEN = 2000

function truncate(text: string): string {
  return text.length > MAX_RESULT_LEN ? text.slice(0, MAX_RESULT_LEN) + '…[截断]' : text
}

function toolResultText(result: { ok: boolean; content?: string; error?: string; message?: string }): string {
  if (!result.ok) return `执行失败：${result.error ?? '未知错误'}`
  return result.content ?? result.message ?? '完成'
}

/**
 * 构建任务已授权的系统工具集（AI SDK tool 格式）。
 * 未授权的工具不会出现 —— AI 看不到即无法调用（白名单的第一道防线）。
 */
export function buildSystemTools(granted: AutomationSystemToolId[]): ToolSet {
  const tools: ToolSet = {}
  const has = (id: AutomationSystemToolId) => granted.includes(id)

  if (has('file_read')) {
    tools.system_file_read = tool({
      description: '读取指定路径的文本文件内容（最大 1MB）',
      inputSchema: z.object({ path: z.string().describe('文件的绝对路径') }),
      execute: async ({ path }) => {
        const r = await window.api.automation.sysFileRead(path)
        return toolResultText(r)
      }
    })
  }

  if (has('file_write')) {
    tools.system_file_write = tool({
      description: '将文本内容写入指定路径的文件（自动创建目录，覆盖已有内容）',
      inputSchema: z.object({
        path: z.string().describe('目标文件的绝对路径'),
        content: z.string().describe('要写入的完整文本内容')
      }),
      execute: async ({ path, content }) => {
        const r = await window.api.automation.sysFileWrite(path, content)
        return toolResultText(r)
      }
    })
  }

  if (has('file_list')) {
    tools.system_file_list = tool({
      description: '列出指定目录下的文件和子目录（最多 500 项）',
      inputSchema: z.object({ path: z.string().describe('目录的绝对路径') }),
      execute: async ({ path }) => {
        const r = await window.api.automation.sysFileList(path)
        if (!r.ok) return `执行失败：${r.error}`
        return truncate(r.entries!.map((e) => `${e.isDir ? '[目录]' : '[文件]'} ${e.name}`).join('\n') || '（空目录）')
      }
    })
  }

  if (has('notify')) {
    tools.system_notify = tool({
      description: '向用户发送系统通知（受设置中「自动化」通知开关控制）',
      inputSchema: z.object({
        title: z.string().describe('通知标题'),
        message: z.string().describe('通知内容')
      }),
      execute: async ({ title, message }) => {
        await NotificationService.getInstance().send({
          id: `automation_${Date.now()}`,
          type: 'info',
          source: 'automation',
          title: truncate(title),
          message: truncate(message),
          timestamp: Date.now()
        })
        return '通知已发送'
      }
    })
  }

  if (has('open_path')) {
    tools.system_open_path = tool({
      description: '用系统默认方式打开本地文件或程序',
      inputSchema: z.object({ path: z.string().describe('文件或程序的绝对路径') }),
      execute: async ({ path }) => {
        const err = await window.api.openPath(path)
        return err ? `打开失败：${err}` : `已打开：${path}`
      }
    })
  }

  if (has('open_url')) {
    tools.system_open_url = tool({
      description: '用默认浏览器打开网页链接',
      inputSchema: z.object({ url: z.string().describe('要打开的 URL（http/https）') }),
      execute: async ({ url }) => {
        try {
          await window.api.shell.openExternal(url)
          return `已打开网页：${url}`
        } catch (e) {
          return `打开失败：${(e as Error).message}`
        }
      }
    })
  }

  if (has('shutdown')) {
    tools.system_shutdown = tool({
      description:
        '关闭计算机。系统将在 60 秒后关机（用户可在 60 秒内执行 shutdown /a 取消）。高危操作，仅在任务明确要求时使用。',
      inputSchema: z.object({ reason: z.string().optional().describe('关机原因，将记入运行日志') }),
      execute: async ({ reason }) => {
        const r = await window.api.automation.sysPower('shutdown')
        return toolResultText(r) + (reason ? `（原因：${reason}）` : '')
      }
    })
  }

  if (has('restart')) {
    tools.system_restart = tool({
      description:
        '重启计算机。系统将在 60 秒后重启（用户可在 60 秒内执行 shutdown /a 取消）。高危操作，仅在任务明确要求时使用。',
      inputSchema: z.object({ reason: z.string().optional().describe('重启原因，将记入运行日志') }),
      execute: async ({ reason }) => {
        const r = await window.api.automation.sysPower('restart')
        return toolResultText(r) + (reason ? `（原因：${reason}）` : '')
      }
    })
  }

  if (has('lock')) {
    tools.system_lock = tool({
      description: '锁定计算机屏幕（立即执行）',
      inputSchema: z.object({ reason: z.string().optional().describe('锁屏原因，将记入运行日志') }),
      execute: async ({ reason }) => {
        const r = await window.api.automation.sysPower('lock')
        return toolResultText(r) + (reason ? `（原因：${reason}）` : '')
      }
    })
  }

  return tools
}
