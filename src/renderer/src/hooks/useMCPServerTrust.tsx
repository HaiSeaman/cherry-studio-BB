import ProtocolInstallWarningContent from '@renderer/pages/settings/MCPSettings/ProtocolInstallWarning'
import {
  ensureServerTrusted as ensureServerTrustedCore,
  getCommandPreview
} from '@renderer/pages/settings/MCPSettings/utils'
import type { MCPServer } from '@renderer/types'
import { modalConfirm } from '@renderer/utils'
import { useCallback } from 'react'

import { useMCPServers } from './useMCPServers'

/**
 * Hook for handling MCP server trust verification
 * Binds UI (modal dialog) to the core trust verification logic
 */
export const useMCPServerTrust = () => {
  const { updateMCPServer } = useMCPServers()
  /**
   * Request user confirmation to trust a server
   * Shows a warning modal with server command preview
   */
  const requestConfirm = useCallback(async (server: MCPServer): Promise<boolean> => {
    const commandPreview = getCommandPreview(server)
    return modalConfirm({
      title: '运行外部 MCP？',
      content: (
        <ProtocolInstallWarningContent
          message={'该 MCP 是通过协议从外部来源安装的，运行来历不明的工具可能对您的计算机造成危害。'}
          commandLabel={'启动命令'}
          commandPreview={commandPreview}
        />
      ),
      okText: '运行',
      cancelText: '取消',
      okButtonProps: { danger: true }
    })
  }, [])

  /**
   * Ensures a server is trusted before proceeding
   * Combines core logic with UI confirmation
   */
  const ensureServerTrusted = useCallback(
    async (server: MCPServer): Promise<MCPServer | null> => {
      return ensureServerTrustedCore(server, requestConfirm, updateMCPServer)
    },
    [requestConfirm, updateMCPServer]
  )

  return { ensureServerTrusted }
}
