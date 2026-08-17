import { loggerService } from '@logger'
import { net } from 'electron'

const logger = loggerService.withContext('IpService')

/**
 * 获取用户的IP地址所在国家
 * @returns 返回国家代码，默认为'CN'
 */
export async function getIpCountry(): Promise<string> {
  try {
    // 添加超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const ipinfo = await net.fetch(`https://api.ipinfo.io/lite/me?token=5aa4105b40adbc`, {
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    const data = await ipinfo.json()
    // ipinfo.io /lite/me 返回字段为 country（如 "US"），兼容旧字段名 country_code
    const country = data.country ?? data.country_code ?? 'CN'
    logger.info(`Detected user IP address country: ${country}`)
    return country
  } catch (error) {
    logger.error('Failed to get IP address information:', error as Error)
    return 'CN'
  }
}

