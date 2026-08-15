import { isWin } from '@renderer/config/constant'
import { IpcChannel } from '@shared/IpcChannel'
import { useEffect } from 'react'
export function useFullScreenNotice() {
  useEffect(() => {
    const cleanup = window.electron.ipcRenderer.on(IpcChannel.FullscreenStatusChanged, (_, isFullscreen) => {
      if (isWin && isFullscreen) {
        window.toast.info({
          title: '已进入全屏模式，按 F11 退出',
          timeout: 3000
        })
      }
    })

    return () => {
      cleanup()
    }
  }, [])
}

export default useFullScreenNotice
