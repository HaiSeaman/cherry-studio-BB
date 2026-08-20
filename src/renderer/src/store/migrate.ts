/**
 * redux-persist 持久化数据迁移（纯函数，可单测）。
 * redux-persist 对任何旧版本只调用最新 migrate 一次，本函数须覆盖全部历史版本的净效果：
 * - v0 → v1 曾为老用户补「自动化」图标（v4 已随入口下线反转，不再补）
 * - v2/v3/v4 陆续下线 music / paint / automation 侧边栏入口（并入中控台与助手工作台）
 */
export const DEPRECATED_SIDEBAR_ICONS = ['music', 'paint', 'automation']

export const migrate = async (state: any) => {
  if (!state) return state
  const settings = state?.settings
  if (!settings) return state

  const icons = settings.sidebarIcons
  if (icons) {
    if (Array.isArray(icons.visible)) {
      icons.visible = icons.visible.filter((i: string) => !DEPRECATED_SIDEBAR_ICONS.includes(i))
    }
    if (Array.isArray(icons.disabled)) {
      icons.disabled = icons.disabled.filter((i: string) => !DEPRECATED_SIDEBAR_ICONS.includes(i))
    }
  }

  // 老用户持久化的 notification 对象不含 automation 键（autoMergeLevel1 不会补嵌套默认值），
  // undefined 会被 NotificationService 当 false 拦截 → 这里补上设计默认值 true
  if (settings.notification && typeof settings.notification === 'object') {
    if (settings.notification.automation === undefined) {
      settings.notification.automation = true
    }
  } else {
    settings.notification = { assistant: false, backup: false, automation: true }
  }

  return state
}
