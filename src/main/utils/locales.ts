import ZhCn from './zh-cn.json'

const locales: Record<string, { translation: any }> = {
  'zh-CN': { translation: ZhCn }
}

/**
 * Get translation by key path (e.g., 'dialog.save_file')
 * 主进程固定使用中文（i18n 已移除）
 */
const t = (key: string): string => {
  const locale = locales['zh-CN']
  const keys = key.split('.')
  let result: any = locale.translation
  for (const k of keys) {
    result = result?.[k]
    if (result === undefined) {
      return key
    }
  }
  return typeof result === 'string' ? result : key
}

export { locales, t }
