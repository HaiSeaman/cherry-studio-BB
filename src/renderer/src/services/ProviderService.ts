import { getStoreProviders } from '@renderer/hooks/useStore'
import type { Model, Provider } from '@renderer/types'
import { getFancyProviderName } from '@renderer/utils'

export function getProviderName(model?: Model) {
  const provider = getProviderByModel(model)

  if (!provider) {
    return ''
  }

  return getFancyProviderName(provider)
}

//FIXME: 和 AssistantService.ts 中的同名函数冲突
export function getProviderByModel(model?: Model) {
  const id = model?.provider
  return getStoreProviders().find((p) => p.id === id)
}

export function isProviderSupportAuth(provider: Provider) {
  const supportProviders = ['302ai', 'silicon', 'aihubmix', 'ppio', 'tokenflux', 'aionly']
  return supportProviders.includes(provider.id)
}

export function isProviderSupportCharge(provider: Provider) {
  const supportProviders = ['302ai', 'silicon', 'aihubmix', 'ppio']
  return supportProviders.includes(provider.id)
}

export function getProviderById(id: string) {
  return getStoreProviders().find((p) => p.id === id)
}
