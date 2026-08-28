import { loggerService } from '@logger'
import { AiProvider } from '@renderer/aiCore'
import { buildStreamTextParams } from '@renderer/aiCore/prepareParams'
import { db } from '@renderer/databases'
import { getStoreProviders } from '@renderer/hooks/useStore'
import { fetchMcpTools, fetchToolsForServers, getRotatedApiKey } from '@renderer/services/ApiService'
import { getAssistantById, getDefaultAssistant } from '@renderer/services/AssistantService'
import { dbService } from '@renderer/services/db'
import { NotificationService } from '@renderer/services/NotificationService'
import store from '@renderer/store'
import { addAssistant, addTopic } from '@renderer/store/assistants'
import type { Assistant, MCPTool, Model, Topic } from '@renderer/types'
import { getAssistantType } from '@renderer/types'
import { isAbortError } from '@renderer/utils/error'
import { createMainTextBlock, createMessage } from '@renderer/utils/messageUtils/create'
import type { AutomationRunStep, AutomationTask } from '@shared/automation'
import { stepCountIs } from 'ai'

import { buildSystemTools } from './systemTools'

const logger = loggerService.withContext('AutomationRunner')

/** 执行简报卡片的落地话题名（挂在任务绑定的助手下） */
export const REPORT_TOPIC_NAME = '运行日志'

/**
 * 老数据兜底：已有自动化任务但用户从未创建过自动化助手时（/automation 整页已下线），
 * 自动补一个默认「自动化」助手作为任务面板入口，任务仍按各自绑定的助手执行。
 * 幂等：存在任一 automation 助手即跳过。
 */
export async function ensureDefaultAutomationAssistant(): Promise<void> {
  try {
    const assistants = store.getState().assistants.assistants
    if (assistants.some((a) => getAssistantType(a) === 'automation')) return
    const tasks = await window.api.automation.getTasks()
    if (tasks.length === 0) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const topic = {
      id: crypto.randomUUID(),
      assistantId: id,
      name: REPORT_TOPIC_NAME,
      createdAt: now,
      updatedAt: now,
      messages: []
    } as Topic
    const assistant: Assistant = {
      ...getDefaultAssistant(),
      id,
      name: '自动化',
      emoji: '⚡',
      type: 'automation',
      topics: [topic]
    }
    await db.topics.add({ id: topic.id, messages: [] })
    store.dispatch(addAssistant(assistant))
  } catch (e) {
    logger.warn('补建自动化助手失败（不影响任务执行）:', e as Error)
  }
}

/** 单次运行最大步数（安全兜底，防止 AI 跑飞） */
const MAX_STEPS = 25
/** 单次运行总超时（毫秒） */
const RUN_TIMEOUT_MS = 10 * 60_000
/** 日志条目截断长度 */
const MAX_STEP_LEN = 1000

function trunc(s: string): string {
  return s.length > MAX_STEP_LEN ? s.slice(0, MAX_STEP_LEN) + '…[截断]' : s
}

/** 自动化运行上下文提示词：告诉模型这是无人值守的定时任务 */
function buildContextPrompt(task: AutomationTask): string {
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', { hour12: false })
  const lines = [
    '你正在作为定时自动化助手执行一个无人值守任务。',
    `当前时间：${timeStr}。任务名称：${task.name}。`,
    '规则：',
    '- 直接完成任务并给出简明结果；用户不会实时回复你',
    '- 只使用提供的工具，不要编造工具调用结果',
    '- 不要询问用户问题，遇到无法继续的情况直接说明原因并结束'
  ]
  if (task.workDir) {
    lines.push(`- 用户指定的输出目录：${task.workDir}（生成的文档等文件保存到该目录，除非用户指令另有说明）`)
  }
  if (task.linkedFiles && task.linkedFiles.length > 0) {
    lines.push(`- 用户指定的目标文件（按指令读取/修改）：\n${task.linkedFiles.map((f) => `  - ${f}`).join('\n')}`)
  }
  return lines.join('\n')
}

/**
 * 执行一次自动化任务（渲染进程）：
 * 组装 MCP 工具 + 已授权系统工具 → 走现有 AiProvider 流式链路 → 逐步回报日志。
 */
export async function executeAutomationTask(task: AutomationTask, runId: string): Promise<void> {
  const runStartedAt = Date.now()
  let stepCount = 0
  const pushStep = (type: AutomationRunStep['type'], content: string) => {
    stepCount += 1
    void window.api.automation.updateRun(runId, { time: Date.now(), type, content: trunc(content) })
  }

  const fail = async (error: string) => {
    pushStep('error', error)
    await window.api.automation.finishRun(runId, { status: 'failed', error })
    notify(task, false, error)
    await writeRunReport(task, runId, 'failed', false, error, runStartedAt, stepCount)
  }

  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  try {
    // 1. 解析执行配置：新任务直接用自带 model/prompt/mcpServerIds；
    //    老任务（无 model）回退到绑定助手的模型、提示词与 MCP 配置
    const legacy = !task.model && task.assistantId ? getAssistantById(task.assistantId) : undefined
    const model = (task.model ?? legacy?.model) as Model | undefined
    if (!model) {
      await fail('任务未设置模型（或老任务绑定的助手已删除），请编辑任务重新选择模型')
      return
    }
    const assistant: Assistant = task.model
      ? // 新任务：合成最小执行助手（默认设置 + 任务自定义提示词）
        { ...getDefaultAssistant(), id: task.assistantId ?? 'automation', model, prompt: task.prompt ?? '' }
      : // 老任务：沿用原助手（保留温度等设置）
        legacy!

    // 2. 模型有效性校验：按快照的 provider id 定位服务商并确认模型仍在（防模型/服务商被删后静默乱跑）
    const baseProvider = getStoreProviders().find((p) => p.id === model.provider)
    if (!baseProvider || !baseProvider.models.some((m) => m.id === model.id)) {
      await fail(`模型「${model.name}」不可用（服务商或模型可能已被删除），请编辑任务重新选择模型`)
      return
    }
    const provider = { ...baseProvider, apiKey: getRotatedApiKey(baseProvider) }

    // 3. 组装 MCP 工具：新任务按任务勾选的服务器（未启用/已删除的记提示并跳过）；老任务跟随助手配置
    let mcpTools: MCPTool[] = []
    if (task.useMcpTools) {
      if (task.model) {
        const allServers = store.getState().mcp.servers ?? []
        const selected = task.mcpServerIds ?? []
        const activeServers = allServers.filter((s) => s.isActive && selected.includes(s.id))
        for (const id of selected) {
          if (!activeServers.some((s) => s.id === id)) {
            const name = allServers.find((s) => s.id === id)?.name ?? id
            pushStep('notice', `MCP 服务器「${name}」未启用或已删除，本次运行已跳过`)
          }
        }
        mcpTools = await fetchToolsForServers(activeServers)
      } else {
        mcpTools = await fetchMcpTools(assistant)
      }
    }

    // 4. 超时控制
    const controller = new AbortController()
    timeoutTimer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS)

    // 5. 复用现有参数构建（系统提示词、温度、stopWhen、providerOptions、空闲超时等）
    const { params, modelId, capabilities, webSearchPluginConfig, idleTimeout } = await buildStreamTextParams(
      [{ role: 'user', content: task.instruction }],
      assistant,
      provider,
      {
        mcpTools,
        allowedTools: mcpTools.map((t) => t.id),
        requestOptions: { signal: controller.signal }
      }
    )

    // 6. 注入自动化上下文（附加在提示词之后）
    params.system = params.system ? `${params.system}\n\n${buildContextPrompt(task)}` : buildContextPrompt(task)

    // 7. 注入系统工具白名单 + 步数上限 + 逐步日志
    const systemTools = buildSystemTools(task.systemTools)
    if (Object.keys(systemTools).length > 0) {
      params.tools = { ...params.tools, ...systemTools }
    }
    params.stopWhen = stepCountIs(MAX_STEPS)
    params.onStepFinish = (step) => {
      if (step.text) pushStep('text', step.text)
      for (const call of step.toolCalls) {
        pushStep('tool_call', `${call.toolName}(${JSON.stringify(call.input)})`)
      }
      for (const result of step.toolResults) {
        const output = typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? '')
        pushStep('tool_result', `${result.toolName} → ${output}`)
      }
    }

    // 8. 执行
    const AI = new AiProvider(model, provider)
    const result = await AI.completions(modelId, params, {
      assistant,
      callType: 'automation',
      streamOutput: false,
      enableReasoning: capabilities.enableReasoning,
      isPromptToolUse: false,
      isSupportedToolUse: true,
      enableWebSearch: capabilities.enableWebSearch,
      enableGenerateImage: capabilities.enableGenerateImage,
      enableUrlContext: capabilities.enableUrlContext,
      webSearchPluginConfig,
      mcpTools,
      idleTimeout
    })

    if (timeoutTimer) clearTimeout(timeoutTimer)
    const output = result.getText() || '（无输出）'
    await window.api.automation.finishRun(runId, { status: 'success', output })
    notify(task, true, output)
    await writeRunReport(task, runId, 'success', false, output, runStartedAt, stepCount)
  } catch (e) {
    if (timeoutTimer) clearTimeout(timeoutTimer)
    const isTimeout = isAbortError(e)
    const error = e instanceof Error ? e.message : String(e)
    // 先记步骤再收尾：finishRun 后 updateRun 会被忽略
    pushStep('error', error)
    await window.api.automation.finishRun(runId, {
      status: isTimeout ? 'timeout' : 'failed',
      error
    })
    notify(task, false, error)
    await writeRunReport(task, runId, isTimeout ? 'timeout' : 'failed', isTimeout, error, runStartedAt, stepCount)
    logger.error('Automation run failed', e as Error)
  }
}

/**
 * 执行简报卡片：运行结束后向绑定助手的「运行日志」话题写一条 text 消息，
 * 用户可在自动化助手工作台的「运行记录」或该助手话题中随时回溯。
 * 简报写入失败不影响任务执行结果（静默降级）。
 */
async function writeRunReport(
  task: AutomationTask,
  runId: string,
  status: 'success' | 'failed' | 'timeout',
  isTimeout: boolean,
  detail: string,
  startedAt: number,
  stepCount: number
): Promise<void> {
  try {
    const assistant = getAssistantById(task.assistantId ?? '')
    if (!assistant) return

    let topic = (assistant.topics ?? []).find((t) => t.name === REPORT_TOPIC_NAME)
    if (!topic) {
      const now = new Date().toISOString()
      topic = {
        id: crypto.randomUUID(),
        assistantId: assistant.id,
        name: REPORT_TOPIC_NAME,
        createdAt: now,
        updatedAt: now,
        messages: []
      } as Topic
      // 先同步 dispatch 再写 db：两个并发运行同时到达此处时，第二个能在 Redux 里
      // 立即看到话题（addTopic 按 id 去重），避免 await 窗口内各建一个重复话题
      store.dispatch(addTopic({ assistantId: assistant.id, topic }))
      await db.topics.add({ id: topic.id, messages: [] })
    }

    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    const statusLabel = status === 'success' ? '✅ 成功' : isTimeout ? '⏱ 超时' : '❌ 失败'
    const summary = detail.length > 600 ? detail.slice(0, 600) + '…' : detail
    const text = [
      `⚡ 自动化执行简报 · ${task.name}`,
      `状态：${statusLabel}`,
      `耗时：${seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`} · 步骤：${stepCount}`,
      `运行 ID：${runId}（工作台 → 运行历史 查看完整时间线）`,
      status === 'success' ? `输出摘要：\n${summary}` : `错误信息：\n${summary}`
    ].join('\n')

    const message = createMessage('assistant', topic.id, assistant.id)
    const block = createMainTextBlock(message.id, text)
    message.blocks = [block.id]
    await dbService.appendMessage(topic.id, message, [block])
    await db.topics.update(topic.id, { updatedAt: new Date().toISOString() })
  } catch (e) {
    logger.warn('写入自动化执行简报失败（不影响任务结果）:', e as Error)
  }
}

/** 运行结束通知（受设置 → 通知 → 自动化 开关控制） */
function notify(task: AutomationTask, success: boolean, message: string): void {
  if (!task.notifyOnComplete) return
  void NotificationService.getInstance().send({
    id: `automation_${Date.now()}`,
    type: success ? 'success' : 'error',
    source: 'automation',
    title: `自动化任务${success ? '完成' : '失败'}：${task.name}`,
    message: message.slice(0, 200),
    timestamp: Date.now()
  })
}
