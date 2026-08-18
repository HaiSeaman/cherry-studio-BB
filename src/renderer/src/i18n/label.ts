/**
 * 对于需要动态获取的翻译文本：
 * 1. 储存 key -> 中文文本 的 keyMap
 * 2. 通过函数获取文本
 */

import type { BuiltinMCPServerName } from '@renderer/types'
import { BuiltinMCPServerNames } from '@renderer/types'

const getLabel = (keyMap: Record<string, string>, key: string, fallback?: string) => {
  return keyMap[key] ?? fallback ?? key
}

const providerKeyMap = {
  '302ai': '302.AI',
  aihubmix: 'AiHubMix',
  alayanew: 'Alaya NeW',
  anthropic: 'Anthropic',
  'aws-bedrock': 'AWS Bedrock',
  'azure-openai': 'Azure OpenAI',
  baichuan: '百川',
  'baidu-cloud': '百度云千帆',
  burncloud: 'BurnCloud',
  cephalon: 'Cephalon',
  cherryin: 'CherryIN',
  dashscope: '阿里云百炼',
  deepseek: '深度求索',
  dmxapi: 'DMXAPI',
  doubao: '火山引擎',
  fireworks: 'Fireworks',
  gemini: 'Gemini',
  'gitee-ai': '模力方舟',
  github: 'GitHub Models',
  gpustack: 'GPUStack',
  grok: 'Grok',
  groq: 'Groq',
  hunyuan: '腾讯混元',
  hyperbolic: 'Hyperbolic',
  infini: '无问芯穹',
  jina: 'Jina',
  lanyun: '蓝耘科技',
  lmstudio: 'LM Studio',
  minimax: 'MiniMax',
  mistral: 'Mistral',
  modelscope: 'ModelScope 魔搭',
  moonshot: '月之暗面',
  'new-api': 'New API',
  nvidia: '英伟达',
  o3: 'O3',
  ocoolai: 'ocoolAI',
  ovms: 'Intel OVMS',
  ollama: 'Ollama',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  perplexity: 'Perplexity',
  ph8: 'PH8',
  ppio: 'PPIO 派欧云',
  qiniu: '七牛云 AI 推理',
  qwenlm: 'QwenLM',
  silicon: '硅基流动',
  stepfun: '阶跃星辰',
  'tencent-cloud-ti': '腾讯云 TI',
  together: 'Together',
  tokenflux: 'TokenFlux',
  vertexai: 'Vertex AI',
  voyageai: 'Voyage AI',
  xirang: '天翼云息壤',
  yi: '零一万物',
  zhinao: '360 智脑',
  zhipu: '智谱开放平台',
  poe: 'Poe',
  aionly: '唯一AI (AiOnly)',
  longcat: '龙猫',
  huggingface: 'Hugging Face',
  sophnet: 'SophNet',
  gateway: 'Vercel AI Gateway',
  cerebras: 'Cerebras AI',
  mimo: 'Xiaomi MiMo',
  'minimax-global': 'MiniMax 海外版',
  zai: 'Z.ai'
} as const

/**
 * 获取内置供应商的本地化标签
 * @param id - 供应商的id
 * @returns 本地化后的供应商名称
 * @remarks
 * 该函数仅用于获取内置供应商的名称
 *
 * 对于可能处理自定义供应商的情况，使用 getProviderName 或 getFancyProviderName 更安全
 */
export const getProviderLabel = (id: string): string => {
  return getLabel(providerKeyMap, id)
}

const backupProgressKeyMap = {
  completed: '备份完成',
  compressing: '压缩文件...',
  copying_database: '复制数据库...',
  copying_files: '复制文件...',
  preparing: '准备备份...',
  preparing_compression: '准备压缩...',
  title: '备份进度',
  writing_data: '写入数据...'
} as const

export const getBackupProgressLabel = (key: string): string => {
  return getLabel(backupProgressKeyMap, key)
}

const restoreProgressKeyMap = {
  completed: '恢复完成',
  copying_files: '复制文件...',
  extracted: '解压成功',
  extracting: '解压备份...',
  preparing: '准备恢复...',
  reading_data: '读取数据...',
  restoring_data: '恢复文件...',
  restoring_database: '恢复数据库...',
  title: '恢复进度',
  validating: '验证备份...'
}

export const getRestoreProgressLabel = (key: string): string => {
  return getLabel(restoreProgressKeyMap, key)
}

const sidebarIconKeyMap = {
  assistants: '助手',
  store: '助手库',
  minapp: '小程序',
  paint: '图片生成',
  music: '音乐',
  notes: '闹钟便签'
} as const

export const getSidebarIconLabel = (key: string): string => {
  return getLabel(sidebarIconKeyMap, key)
}

const shortcutKeyMap = {
  action: '操作',
  actions: '操作',
  clear_shortcut: '清除快捷键',
  clear_topic: '清空消息',
  rename_topic: '重命名话题',
  copy_last_message: '复制上一条消息',
  edit_last_user_message: '编辑最后一条用户消息',
  enabled: '启用',
  exit_fullscreen: '退出全屏',
  label: '按键',
  mini_window: '快捷助手',
  new_topic: '新建话题',
  press_shortcut: '按下快捷键',
  reset_defaults: '重置默认快捷键',
  reset_defaults_confirm: '确定要重置所有快捷键吗？',
  reset_to_default: '重置为默认',
  search_message: '搜索消息',
  search_message_in_chat: '在当前对话中搜索消息',
  select_model: '选择模型',
  selection_assistant_select_text: '划词助手：取词',
  selection_assistant_toggle: '开关划词助手',
  screenshot: '屏幕截图',
  show_app: '显示 / 隐藏应用',
  show_settings: '打开设置',
  title: '快捷键',
  toggle_new_context: '清除上下文',
  toggle_show_assistants: '切换助手显示',
  toggle_show_topics: '切换话题显示',
  zoom_in: '放大界面',
  zoom_out: '缩小界面',
  zoom_reset: '重置缩放'
} as const

export const getShortcutLabel = (key: string): string => {
  return getLabel(shortcutKeyMap, key)
}

const selectionDescriptionKeyMap = {
  linux: '若使用了 xmodmap 或 xremap 等按键映射工具对修饰键进行了重映射，可能导致部分应用无法划词。',
  mac: '若使用了快捷键或键盘映射工具对 ⌘ 键进行了重映射，可能导致部分应用无法划词。',
  windows: '少数应用不支持通过 Ctrl 键划词。若使用了AHK等按键映射工具对 Ctrl 键进行了重映射，可能导致部分应用无法划词。'
} as const

export const getSelectionDescriptionLabel = (key: string): string => {
  return getLabel(selectionDescriptionKeyMap, key)
}

const mcpTypeKeyMap = {
  inMemory: '内置',
  sse: 'SSE',
  stdio: 'STDIO',
  streamableHttp: '流式'
} as const

export const getMcpTypeLabel = (key: string): string => {
  return getLabel(mcpTypeKeyMap, key)
}

const miniappsStatusKeyMap = {
  visible: '显示的小程序',
  disabled: '隐藏的小程序'
} as const

export const getMiniappsStatusLabel = (key: string): string => {
  return getLabel(miniappsStatusKeyMap, key)
}

const httpMessageKeyMap = {
  '400': '请求错误，请检查请求参数是否正确。如果修改了模型设置，请重置到默认设置',
  '401': '身份验证失败，请检查 API 密钥是否正确',
  '402': '需要支付。账户余额或额度已用完，请到服务商网站充值，或切换到其他服务商',
  '403': '禁止访问，请翻译具体报错信息查看原因，或联系服务商询问被禁止原因',
  '404': '模型不存在或者请求路径错误',
  '429': '请求速率超过限制，请稍后再试',
  '500': '服务器错误，请稍后再试',
  '502': '网关错误，请稍后再试',
  '503': '服务不可用，请稍后再试',
  '504': '网关超时，请稍后再试'
} as const

export const getHttpMessageLabel = (key: string): string => {
  return getLabel(httpMessageKeyMap, key)
}

const builtInMcpDescriptionKeyMap: Record<BuiltinMCPServerName, string> = {
  [BuiltinMCPServerNames.flomo]: '连接 flomo 通过 AI 快速记录笔记和想法。需要 flomo 账号授权。',
  [BuiltinMCPServerNames.mcpAutoInstall]: '自动安装 MCP 服务（测试版）',
  [BuiltinMCPServerNames.memory]:
    '基于本地知识图谱的持久性记忆基础实现。这使得模型能够在不同对话间记住用户的相关信息。需要配置 MEMORY_FILE_PATH 环境变量。',
  [BuiltinMCPServerNames.sequentialThinking]:
    '一个 MCP 服务器实现，提供了通过结构化思维过程进行动态和反思性问题解决的工具',
  [BuiltinMCPServerNames.braveSearch]:
    '一个集成了Brave 搜索 API 的 MCP 服务器实现，提供网页与本地搜索双重功能。需要配置 BRAVE_API_KEY 环境变量',
  [BuiltinMCPServerNames.fetch]: '用于获取 URL 网页内容的 MCP 服务器',
  [BuiltinMCPServerNames.filesystem]:
    '实现文件系统操作的模型上下文协议（MCP）的 Node.js 服务器。需要配置允许访问的目录',
  [BuiltinMCPServerNames.difyKnowledge]:
    'Dify 的 MCP 服务器实现，提供了一个简单的 API 来与 Dify 进行交互。需要配置 Dify Key',
  [BuiltinMCPServerNames.didiMCP]:
    '一个集成了滴滴 MCP 服务器实现，提供网约车服务包括地图搜索、价格预估、订单管理和司机跟踪。仅支持中国大陆地区。需要配置 DIDI_API_KEY 环境变量',
  [BuiltinMCPServerNames.browser]:
    '通过 Chrome DevTools 协议控制隐藏的 Electron 窗口，支持打开 URL、执行单行 JS、重置会话',
  [BuiltinMCPServerNames.nowledgeMem]:
    '需要本地运行 Nowledge Mem 应用。将 AI 对话、工具、笔记、智能体和文件保存在本地计算机的私有记忆中。请从 https://mem.nowledge.co/ 下载',
  [BuiltinMCPServerNames.hub]: 'MCP 中心'
} as const

export const getBuiltInMcpServerDescriptionLabel = (key: string): string => {
  return getLabel(builtInMcpDescriptionKeyMap, key, '无描述')
}
