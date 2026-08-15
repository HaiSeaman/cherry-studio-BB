import store, { useAppSelector } from '@renderer/store'

export function useRuntime() {
  return useAppSelector((state) => state.runtime)
}

export function modelGenerating() {
  const generating = store.getState().runtime.generating

  if (generating) {
    window.toast.warning('请等待当前回复完成后操作')
    return Promise.reject()
  }

  return Promise.resolve()
}
