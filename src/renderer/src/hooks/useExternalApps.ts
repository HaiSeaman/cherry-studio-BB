import { useQuery } from '@tanstack/react-query'

export function useExternalApps() {
  return useQuery({
    queryKey: ['external-apps', 'installed'],
    queryFn: () => window.api.externalApps.detectInstalled(),
    staleTime: Infinity,
    retry: false
  })
}
