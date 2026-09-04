import { loggerService } from '@logger'
import type { ProxyConfig } from 'electron'
import { app, session } from 'electron'
import { getSystemProxy } from 'os-proxy-config'

import { NodeProxyController } from './proxy/nodeProxy'

const logger = loggerService.withContext('ProxyManager')

export class ProxyManager {
  private config: ProxyConfig = { mode: 'direct' }
  private systemProxyInterval: NodeJS.Timeout | null = null
  private isSettingProxy = false
  private pendingConfig: ProxyConfig | null = null
  private nodeProxyController = new NodeProxyController(logger)

  private async monitorSystemProxy(): Promise<void> {
    this.clearSystemProxyMonitor()
    this.systemProxyInterval = setInterval(async () => {
      const currentProxy = await getSystemProxy()
      if (
        currentProxy?.proxyUrl.toLowerCase() === this.config?.proxyRules &&
        currentProxy?.noProxy.join(',').toLowerCase() === this.config?.proxyBypassRules?.toLowerCase()
      ) {
        return
      }

      logger.info(
        `system proxy changed: ${currentProxy?.proxyUrl}, this.config.proxyRules: ${this.config.proxyRules}, this.config.proxyBypassRules: ${this.config.proxyBypassRules}`
      )
      await this.configureProxy({
        mode: 'system',
        proxyRules: currentProxy?.proxyUrl.toLowerCase(),
        proxyBypassRules: currentProxy?.noProxy.join(',')
      })
    }, 1000 * 60)
  }

  private clearSystemProxyMonitor(): void {
    if (this.systemProxyInterval) {
      clearInterval(this.systemProxyInterval)
      this.systemProxyInterval = null
    }
  }

  async configureProxy(config: ProxyConfig): Promise<void> {
    // Never log proxyRules verbatim: a proxy URL may embed credentials
    // (http://user:pass@host) which would leak into the log file.
    logger.info(`configureProxy: mode=${config?.mode} rulesConfigured=${Boolean(config?.proxyRules)}`)

    // 上一次设置仍在进行中：记录本次请求，设置完成后重放"最新"配置，
    // 而不是直接 return 静默丢弃（并发调用的最后一个请求才是用户想要的结果）
    if (this.isSettingProxy) {
      this.pendingConfig = config
      return
    }

    this.isSettingProxy = true

    try {
      this.clearSystemProxyMonitor()
      if (config.mode === 'system') {
        const currentProxy = await getSystemProxy()
        if (currentProxy) {
          logger.info(`current system proxy: ${currentProxy.proxyUrl}, bypass rules: ${currentProxy.noProxy.join(',')}`)
          config.proxyRules = currentProxy.proxyUrl.toLowerCase()
          config.proxyBypassRules = currentProxy.noProxy.join(',')
        }
        void this.monitorSystemProxy()
      }

      this.setGlobalProxy(config)
      this.config = config
    } catch (error) {
      logger.error('Failed to config proxy:', error as Error)
      throw error
    } finally {
      this.isSettingProxy = false
      // 重放等待中的最新请求
      if (this.pendingConfig) {
        const next = this.pendingConfig
        this.pendingConfig = null
        this.configureProxy(next).catch((error) => {
          logger.error('Failed to apply pending proxy config:', error as Error)
        })
      }
    }
  }

  private setGlobalProxy(config: ProxyConfig) {
    this.nodeProxyController.configure({
      proxyRules: config.mode === 'direct' ? undefined : config.proxyRules,
      proxyBypassRules: config.proxyBypassRules
    })
    void this.setSessionsProxy(config)
  }

  private async setSessionsProxy(config: ProxyConfig): Promise<void> {
    const sessions = [session.defaultSession, session.fromPartition('persist:webview')]
    await Promise.all(sessions.map((session) => session.setProxy(config)))

    void app.setProxy(config)
  }
}

export const proxyManager = new ProxyManager()
