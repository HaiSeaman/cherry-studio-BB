import type { EndpointType } from '@renderer/types'

export const endpointTypeOptions: { label: string; value: EndpointType }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-response', label: 'OpenAI-Response' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'image-generation', label: '图像生成 (OpenAI)' },
  { value: 'jina-rerank', label: 'Jina 重排序' }
]
