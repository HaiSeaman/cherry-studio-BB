import AnthropicProviderLogo from '@renderer/assets/images/providers/anthropic.png'
import BailianProviderLogo from '@renderer/assets/images/providers/bailian.png'
import DeepSeekProviderLogo from '@renderer/assets/images/providers/deepseek.png'
import GoogleProviderLogo from '@renderer/assets/images/providers/google.png'
import MistralProviderLogo from '@renderer/assets/images/providers/mistral.png'
import MoonshotProviderLogo from '@renderer/assets/images/providers/moonshot.webp'
import OllamaProviderLogo from '@renderer/assets/images/providers/ollama.png'
import OpenAiProviderLogo from '@renderer/assets/images/providers/openai.png'
import OpenRouterProviderLogo from '@renderer/assets/images/providers/openrouter.png'
import ZhipuProviderLogo from '@renderer/assets/images/providers/zhipu.png'
import type { AtLeast, SystemProvider, SystemProviderId } from '@renderer/types'
import { OpenAIServiceTiers } from '@renderer/types'

import { qwenModel, SYSTEM_MODELS } from './models'

export const CHERRYAI_PROVIDER: SystemProvider = {
  id: 'cherryai' as SystemProviderId,
  name: 'CherryAI',
  type: 'openai',
  apiKey: '',
  apiHost: 'https://api.cherry-ai.com',
  models: [qwenModel],
  isSystem: true,
  enabled: true
}

export type SystemProviderConfigIds =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openrouter'
  | 'ollama'
  | 'zhipu'
  | 'dashscope'
  | 'moonshot'
  | 'mistral'

export const SYSTEM_PROVIDERS_CONFIG: Record<SystemProviderConfigIds, SystemProvider> = {
  zhipu: {
    id: 'zhipu',
    name: 'ZhiPu',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://open.bigmodel.cn/api/paas/v4/',
    anthropicApiHost: 'https://open.bigmodel.cn/api/anthropic',
    models: SYSTEM_MODELS.zhipu!,
    isSystem: true,
    enabled: false
  },
  deepseek: {
    id: 'deepseek',
    name: 'deepseek',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.deepseek.com',
    anthropicApiHost: 'https://api.deepseek.com/anthropic',
    models: SYSTEM_MODELS.deepseek!,
    isSystem: true,
    enabled: false
  },
  dashscope: {
    id: 'dashscope',
    name: 'Bailian',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
    anthropicApiHost: 'https://dashscope.aliyuncs.com/apps/anthropic',
    models: SYSTEM_MODELS.dashscope!,
    isSystem: true,
    enabled: false
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.moonshot.cn',
    anthropicApiHost: 'https://api.moonshot.cn/anthropic',
    models: SYSTEM_MODELS.moonshot!,
    isSystem: true,
    enabled: false
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://openrouter.ai/api/v1/',
    // Anthropic-compatible endpoint for Agent mode (Claude Code SDK)
    // https://openrouter.ai/docs/guides/guides/coding-agents/claude-code-integration
    anthropicApiHost: 'https://openrouter.ai/api',
    models: SYSTEM_MODELS.openrouter!,
    isSystem: true,
    enabled: false
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    type: 'ollama',
    apiKey: '',
    apiHost: 'http://localhost:11434',
    anthropicApiHost: 'http://localhost:11434',
    models: SYSTEM_MODELS.ollama!,
    isSystem: true,
    enabled: false
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: '',
    apiHost: 'https://api.anthropic.com',
    models: SYSTEM_MODELS.anthropic!,
    isSystem: true,
    enabled: false
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-response',
    apiKey: '',
    apiHost: 'https://api.openai.com',
    models: SYSTEM_MODELS.openai!,
    isSystem: true,
    enabled: false,
    serviceTier: OpenAIServiceTiers.auto
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    type: 'gemini',
    apiKey: '',
    apiHost: 'https://generativelanguage.googleapis.com',
    models: SYSTEM_MODELS.gemini!,
    isSystem: true,
    enabled: false,
    isVertex: false
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.mistral.ai',
    models: SYSTEM_MODELS.mistral!,
    isSystem: true,
    enabled: false
  }
} as const

export const INITIAL_STATE_EXCLUDED_PROVIDER_IDS = [] as const satisfies SystemProviderId[]

export const SYSTEM_PROVIDERS: SystemProvider[] = Object.values(SYSTEM_PROVIDERS_CONFIG)

export const PROVIDER_LOGO_MAP: AtLeast<SystemProviderConfigIds, string> = {
  openai: OpenAiProviderLogo,
  deepseek: DeepSeekProviderLogo,
  zhipu: ZhipuProviderLogo,
  ollama: OllamaProviderLogo,
  moonshot: MoonshotProviderLogo,
  openrouter: OpenRouterProviderLogo,
  dashscope: BailianProviderLogo,
  anthropic: AnthropicProviderLogo,
  gemini: GoogleProviderLogo,
  mistral: MistralProviderLogo,
  poe: 'poe' // use svg icon component
} as const

export function getProviderLogo(providerId: string) {
  return PROVIDER_LOGO_MAP[providerId as keyof typeof PROVIDER_LOGO_MAP]
}

type ProviderUrls = {
  api: {
    url: string
  }
  websites?: {
    official: string
    apiKey?: string
    docs: string
    models?: string
  }
}

export const PROVIDER_URLS: Record<SystemProviderConfigIds, ProviderUrls> = {
  openai: {
    api: {
      url: 'https://api.openai.com'
    },
    websites: {
      official: 'https://openai.com/',
      apiKey: 'https://platform.openai.com/api-keys',
      docs: 'https://platform.openai.com/docs',
      models: 'https://platform.openai.com/docs/models'
    }
  },
  gemini: {
    api: {
      url: 'https://generativelanguage.googleapis.com'
    },
    websites: {
      official: 'https://gemini.google.com/',
      apiKey: 'https://aistudio.google.com/app/apikey',
      docs: 'https://ai.google.dev/gemini-api/docs',
      models: 'https://ai.google.dev/gemini-api/docs/models/gemini'
    }
  },
  deepseek: {
    api: {
      url: 'https://api.deepseek.com'
    },
    websites: {
      official: 'https://deepseek.com/',
      apiKey: 'https://platform.deepseek.com/api_keys',
      docs: 'https://platform.deepseek.com/api-docs/',
      models: 'https://platform.deepseek.com/api-docs/'
    }
  },
  zhipu: {
    api: {
      url: 'https://open.bigmodel.cn/api/paas/v4/'
    },
    websites: {
      official: 'https://open.bigmodel.cn/',
      apiKey: 'https://open.bigmodel.cn/usercenter/apikeys',
      docs: 'https://docs.bigmodel.cn/',
      models: 'https://open.bigmodel.cn/modelcenter/square'
    }
  },
  moonshot: {
    api: {
      url: 'https://api.moonshot.cn'
    },
    websites: {
      official: 'https://www.moonshot.cn/',
      apiKey: 'https://platform.moonshot.cn/console/api-keys',
      docs: 'https://platform.moonshot.cn/docs/',
      models: 'https://platform.moonshot.cn/docs/intro#%E6%A8%A1%E5%9E%8B%E5%88%97%E8%A1%A8'
    }
  },
  dashscope: {
    api: {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/'
    },
    websites: {
      official: 'https://www.aliyun.com/product/bailian',
      apiKey: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
      docs: 'https://help.aliyun.com/zh/model-studio/getting-started/',
      models: 'https://bailian.console.aliyun.com/?tab=model#/model-market'
    }
  },
  openrouter: {
    api: {
      url: 'https://openrouter.ai/api/v1/'
    },
    websites: {
      official: 'https://openrouter.ai/',
      apiKey: 'https://openrouter.ai/settings/keys',
      docs: 'https://openrouter.ai/docs/quick-start',
      models: 'https://openrouter.ai/models'
    }
  },
  ollama: {
    api: {
      url: 'http://localhost:11434'
    },
    websites: {
      official: 'https://ollama.com/',
      docs: 'https://github.com/ollama/ollama/tree/main/docs',
      models: 'https://ollama.com/library'
    }
  },
  anthropic: {
    api: {
      url: 'https://api.anthropic.com'
    },
    websites: {
      official: 'https://anthropic.com/',
      apiKey: 'https://console.anthropic.com/settings/keys',
      docs: 'https://docs.anthropic.com/en/docs',
      models: 'https://docs.anthropic.com/en/docs/about-claude/models'
    }
  },
  mistral: {
    api: {
      url: 'https://api.mistral.ai'
    },
    websites: {
      official: 'https://mistral.ai',
      apiKey: 'https://console.mistral.ai/api-keys/',
      docs: 'https://docs.mistral.ai',
      models: 'https://docs.mistral.ai/getting-started/models/models_overview'
    }
  }
}
