import type { Model, SystemProviderId } from '@renderer/types'

export const qwenModel: Model = {
  id: 'qwen',
  name: 'Qwen',
  provider: 'cherryai',
  group: 'Qwen'
}

export const SYSTEM_MODELS: Partial<Record<SystemProviderId | 'defaultModel', Model[]>> = {
  defaultModel: [
    // Default assistant model
    qwenModel,
    // Default topic naming model
    qwenModel,
    // Default translation model
    qwenModel,
    // Default quick assistant model
    qwenModel
  ],
  ollama: [],
  ppio: [
    {
      id: 'deepseek/deepseek-v3.2',
      provider: 'ppio',
      name: 'DeepSeek V3.2',
      group: 'deepseek'
    },
    {
      id: 'minimax/minimax-m2',
      provider: 'ppio',
      name: 'MiniMax M2',
      group: 'minimaxai'
    },
    {
      id: 'qwen/qwen3-235b-a22b-instruct-2507',
      provider: 'ppio',
      name: 'Qwen3-235b-a22b-instruct-2507',
      group: 'qwen'
    },
    {
      id: 'qwen/qwen3-vl-235b-a22b-instruct',
      provider: 'ppio',
      name: 'Qwen3-vl-235b-a22b-instruct',
      group: 'qwen'
    },
    {
      id: 'qwen/qwen3-embedding-8b',
      provider: 'ppio',
      name: 'Qwen3 Embedding 8B',
      group: 'qwen'
    },
    {
      id: 'qwen/qwen3-reranker-8b',
      provider: 'ppio',
      name: 'Qwen3 Reranker 8B',
      group: 'qwen'
    }
  ],
  openai: [
    { id: 'gpt-5.4', provider: 'openai', name: ' GPT 5.4', group: 'gpt-5.4' },
    { id: 'gpt-5.4-pro', provider: 'openai', name: ' GPT 5.4 Pro', group: 'gpt-5.4' },
    { id: 'gpt-5.2', provider: 'openai', name: ' GPT 5.2', group: 'gpt-5.2' },
    { id: 'gpt-5.2-pro', provider: 'openai', name: ' GPT 5.2 Pro', group: 'gpt-5.2' },
    { id: 'gpt-5.1', provider: 'openai', name: ' GPT 5.1', group: 'gpt-5.1' },
    { id: 'gpt-5', provider: 'openai', name: ' GPT 5', group: 'gpt-5' },
    { id: 'gpt-5-pro', provider: 'openai', name: ' GPT 5 Pro', group: 'gpt-5' },
    { id: 'gpt-5-chat', provider: 'openai', name: ' GPT 5 Chat', group: 'gpt-5' },
    { id: 'gpt-image-1', provider: 'openai', name: ' GPT Image 1', group: 'gpt-image' }
  ],
  'azure-openai': [
    {
      id: 'gpt-4o',
      provider: 'azure-openai',
      name: ' GPT-4o',
      group: 'GPT 4o'
    },
    {
      id: 'gpt-4o-mini',
      provider: 'azure-openai',
      name: ' GPT-4o-mini',
      group: 'GPT 4o'
    }
  ],
  gemini: [
    {
      id: 'gemini-2.5-flash',
      provider: 'gemini',
      name: 'Gemini 2.5 Flash',
      group: 'Gemini 2.5'
    },
    {
      id: 'gemini-2.5-pro',
      provider: 'gemini',
      name: 'Gemini 2.5 Pro',
      group: 'Gemini 2.5'
    },
    {
      id: 'gemini-2.5-flash-image-preview',
      provider: 'gemini',
      name: 'Gemini 2.5 Flash Image',
      group: 'Gemini 2.5'
    },
    {
      id: 'gemini-3-pro-image-preview',
      provider: 'gemini',
      name: 'Gemini 3 Pro Image Preview',
      group: 'Gemini 3'
    },
    {
      id: 'gemini-3-pro-preview',
      provider: 'gemini',
      name: 'Gemini 3 Pro Preview',
      group: 'Gemini 3'
    },
    {
      id: 'gemini-3.1-pro-preview',
      provider: 'gemini',
      name: 'Gemini 3.1 Pro Preview',
      group: 'Gemini 3'
    }
  ],
  anthropic: [
    {
      id: 'claude-opus-4-7',
      provider: 'anthropic',
      name: 'Claude Opus 4.7',
      group: 'Claude 4.7'
    },
    {
      id: 'claude-opus-4-6',
      provider: 'anthropic',
      name: 'Claude Opus 4.6',
      group: 'Claude 4.6'
    },
    {
      id: 'claude-sonnet-4-6',
      provider: 'anthropic',
      name: 'Claude Sonnet 4.6',
      group: 'Claude 4.6'
    },
    {
      id: 'claude-sonnet-4-5',
      provider: 'anthropic',
      name: 'Claude Sonnet 4.5',
      group: 'Claude 4.5'
    },
    {
      id: 'claude-haiku-4-5',
      provider: 'anthropic',
      name: 'Claude Haiku 4.5',
      group: 'Claude 4.5'
    },
    {
      id: 'claude-opus-4-5',
      provider: 'anthropic',
      name: 'Claude Opus 4.5',
      group: 'Claude 4.5'
    }
  ],
  deepseek: [
    {
      id: 'deepseek-v4-flash',
      provider: 'deepseek',
      name: 'deepseek-v4-flash',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v4-pro',
      provider: 'deepseek',
      name: 'deepseek-v4-pro',
      group: 'DeepSeek'
    }
  ],
  zhipu: [
    {
      id: 'glm-5',
      provider: 'zhipu',
      name: 'GLM-5',
      group: 'GLM-5'
    },
    {
      id: 'glm-4.7',
      provider: 'zhipu',
      name: 'GLM-4.7',
      group: 'GLM-4.7'
    },
    {
      id: 'glm-4.5-flash',
      provider: 'zhipu',
      name: 'GLM-4.5-Flash',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.6',
      provider: 'zhipu',
      name: 'GLM-4.6',
      group: 'GLM-4.6'
    },
    {
      id: 'glm-4.6v',
      provider: 'zhipu',
      name: 'GLM-4.6V',
      group: 'GLM-4.6V'
    },
    {
      id: 'glm-4.6v-flash',
      provider: 'zhipu',
      name: 'GLM-4.6V-Flash',
      group: 'GLM-4.6V'
    },
    {
      id: 'glm-4.6v-flashx',
      provider: 'zhipu',
      name: 'GLM-4.6V-FlashX',
      group: 'GLM-4.6V'
    },
    {
      id: 'glm-4.7',
      provider: 'zhipu',
      name: 'GLM-4.7',
      group: 'GLM-4.7'
    },
    {
      id: 'glm-4.5',
      provider: 'zhipu',
      name: 'GLM-4.5',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.5-air',
      provider: 'zhipu',
      name: 'GLM-4.5-Air',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.5-airx',
      provider: 'zhipu',
      name: 'GLM-4.5-AirX',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.5v',
      provider: 'zhipu',
      name: 'GLM-4.5V',
      group: 'GLM-4.5V'
    },
    {
      id: 'embedding-3',
      provider: 'zhipu',
      name: 'Embedding-3',
      group: 'Embedding'
    },
    {
      id: 'cogView-4-250304',
      provider: 'zhipu',
      name: 'cogView-4',
      group: 'cogView'
    }
  ],
  moonshot: [
    {
      id: 'kimi-k2.5',
      provider: 'moonshot',
      name: 'Kimi K2.5',
      group: 'Kimi K2.5',
      owned_by: 'moonshot',
      capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }]
    },
    {
      id: 'kimi-k2.6',
      provider: 'moonshot',
      name: 'Kimi K2.6',
      group: 'Kimi K2.6',
      owned_by: 'moonshot',
      capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }]
    },
    {
      id: 'kimi-k2.7-code',
      provider: 'moonshot',
      name: 'Kimi K2.7 Code',
      group: 'Kimi K2.7',
      owned_by: 'moonshot',
      capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }]
    }
  ],
  dashscope: [
    { id: 'qwen3.5-plus', name: 'Qwen3.5-Plus', provider: 'dashscope', group: 'Qwen' },
    { id: 'qwen3.5-flash', name: 'Qwen3.5-Flash', provider: 'dashscope', group: 'Qwen' },
    { id: 'qwen3-max', name: 'Qwen3-Max', provider: 'dashscope', group: 'Qwen' },
    { id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'dashscope', group: 'Kimi' },
    { id: 'glm-5', name: 'GLM-5', provider: 'dashscope', group: 'GLM' },
    { id: 'MiniMax/MiniMax-M2.5', name: 'MiniMax M2.5', provider: 'dashscope', group: 'MiniMax' },
    { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', provider: 'dashscope', group: 'DeepSeek' },
    { id: 'wan2.6-t2v-plus', name: 'Wan2.6 T2V Plus', provider: 'dashscope', group: 'Video' },
    { id: 'wan2.6-t2v-flash', name: 'Wan2.6 T2V Flash', provider: 'dashscope', group: 'Video' },
    { id: 'wan2.6-i2v-plus', name: 'Wan2.6 I2V Plus', provider: 'dashscope', group: 'Video' },
    { id: 'wan2.6-i2v-flash', name: 'Wan2.6 I2V Flash', provider: 'dashscope', group: 'Video' }
  ],
  doubao: [
    {
      id: 'doubao-seedance-1-0-lite-t2v-250428',
      name: 'Seedance 1.0 Lite T2V',
      provider: 'doubao',
      group: 'Seedance'
    },
    {
      id: 'doubao-seedance-1-0-pro-t2v-250804',
      name: 'Seedance 1.0 Pro T2V',
      provider: 'doubao',
      group: 'Seedance'
    },
    {
      id: 'doubao-seedance-1-0-lite-i2v-250428',
      name: 'Seedance 1.0 Lite I2V',
      provider: 'doubao',
      group: 'Seedance'
    }
  ],
  hunyuan: [{ id: 'hunyuan-video', name: 'Hunyuan Video', provider: 'hunyuan', group: 'Video' }],
  mistral: [
    {
      id: 'pixtral-12b-2409',
      provider: 'mistral',
      name: 'Pixtral 12B [Free]',
      group: 'Pixtral'
    },
    {
      id: 'pixtral-large-latest',
      provider: 'mistral',
      name: 'Pixtral Large',
      group: 'Pixtral'
    },
    {
      id: 'ministral-3b-latest',
      provider: 'mistral',
      name: 'Mistral 3B [Free]',
      group: 'Mistral Mini'
    },
    {
      id: 'ministral-8b-latest',
      provider: 'mistral',
      name: 'Mistral 8B [Free]',
      group: 'Mistral Mini'
    },
    {
      id: 'codestral-latest',
      provider: 'mistral',
      name: 'Mistral Codestral',
      group: 'Mistral Code'
    },
    {
      id: 'mistral-large-latest',
      provider: 'mistral',
      name: 'Mistral Large',
      group: 'Mistral Chat'
    },
    {
      id: 'mistral-small-latest',
      provider: 'mistral',
      name: 'Mistral Small',
      group: 'Mistral Chat'
    },
    {
      id: 'open-mistral-nemo',
      provider: 'mistral',
      name: 'Mistral Nemo',
      group: 'Mistral Chat'
    },
    {
      id: 'mistral-embed',
      provider: 'mistral',
      name: 'Mistral Embedding',
      group: 'Mistral Embed'
    }
  ],
  openrouter: [
    {
      id: 'google/gemini-2.5-flash-image-preview',
      provider: 'openrouter',
      name: 'Google: Gemini 2.5 Flash Image',
      group: 'google'
    },
    {
      id: 'google/gemini-2.5-flash-preview',
      provider: 'openrouter',
      name: 'Google: Gemini 2.5 Flash Preview',
      group: 'google'
    },
    {
      id: 'qwen/qwen-2.5-7b-instruct:free',
      provider: 'openrouter',
      name: 'Qwen: Qwen-2.5-7B Instruct',
      group: 'qwen'
    },
    {
      id: 'deepseek/deepseek-chat',
      provider: 'openrouter',
      name: 'DeepSeek: V3',
      group: 'deepseek'
    },
    {
      id: 'mistralai/mistral-7b-instruct:free',
      provider: 'openrouter',
      name: 'Mistral: Mistral 7B Instruct',
      group: 'mistralai'
    }
  ],
  lanyun: [
    {
      id: '/maas/deepseek-ai/DeepSeek-R1-0528',
      name: 'deepseek-ai/DeepSeek-R1',
      provider: 'lanyun',
      group: 'deepseek-ai'
    },
    {
      id: '/maas/deepseek-ai/DeepSeek-V3-0324',
      name: 'deepseek-ai/DeepSeek-V3',
      provider: 'lanyun',
      group: 'deepseek-ai'
    },
    {
      id: '/maas/qwen/Qwen2.5-72B-Instruct',
      provider: 'lanyun',
      name: 'Qwen2.5-72B-Instruct',
      group: 'Qwen'
    },
    {
      id: '/maas/qwen/Qwen3-235B-A22B',
      name: 'Qwen/Qwen3-235B',
      provider: 'lanyun',
      group: 'Qwen'
    },
    {
      id: '/maas/minimax/MiniMax-M1-80k',
      name: 'MiniMax-M1-80k',
      provider: 'lanyun',
      group: 'MiniMax'
    },
    {
      id: '/maas/google/Gemma3-27B',
      name: 'Gemma3-27B',
      provider: 'lanyun',
      group: 'google'
    }
  ],
  'new-api': [],
  'aws-bedrock': []
}
