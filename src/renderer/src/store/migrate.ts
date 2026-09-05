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
      // 新增打卡入口默认补入（老用户持久化 settings 的 visible 里没有 habits）
      if (!icons.visible.includes('habits')) {
        icons.visible.push('habits')
      }
      // 新增知识库入口默认补入（老用户持久化 settings 的 visible 里没有 knowledge；用户已显式禁用的不强行加回）
      if (!icons.visible.includes('knowledge') && !(icons.disabled ?? []).includes('knowledge')) {
        icons.visible.push('knowledge')
      }
      // 新增电视（IPTV）入口默认补入（同上：显式禁用的不强行加回）
      if (!icons.visible.includes('iptv') && !(icons.disabled ?? []).includes('iptv')) {
        icons.visible.push('iptv')
      }
    }
    if (Array.isArray(icons.disabled)) {
      icons.disabled = icons.disabled.filter((i: string) => !DEPRECATED_SIDEBAR_ICONS.includes(i))
    }
  }

  // 老用户持久化的 notification 结构升级：
  // - v4 及更早：每个来源是布尔值（如 assistant:false），无声音配置；automation 键可能缺失
  // - 新结构：{ source: { enabled: boolean, sound: 'default'|'custom:<path>' } }，新增 paint 源
  // 这里把任意历史形态都规范为最新结构，保证 NotificationService 与设置页可读。
  if (settings.notification && typeof settings.notification === 'object') {
    const old = settings.notification
    const isLegacy = (v: unknown) => typeof v === 'boolean'
    settings.notification = Object.fromEntries(
      (['assistant', 'backup', 'update', 'automation', 'paint'] as const).map((source) => {
        const v = old[source]
        if (v && typeof v === 'object') {
          // 已是新结构（幂等）：原样保留，缺失字段补默认
          return [
            source,
            {
              enabled: (v as { enabled?: boolean }).enabled ?? false,
              sound: typeof (v as { sound?: string }).sound === 'string' ? (v as { sound?: string }).sound! : 'default'
            }
          ]
        }
        // 布尔（老数据）或 undefined → 默认音
        const enabled = isLegacy(v) ? v : source === 'automation'
        return [source, { enabled, sound: 'default' }]
      })
    )
  } else {
    settings.notification = {
      assistant: { enabled: false, sound: 'default' },
      backup: { enabled: false, sound: 'default' },
      update: { enabled: false, sound: 'default' },
      automation: { enabled: true, sound: 'default' },
      paint: { enabled: false, sound: 'default' }
    }
  }

  return state
}
