/**
 * 主题注册表：4 款浅色（护眼低饱和）+ 2 款深色（低亮不刺眼）。
 * mode 决定 theme-mode 属性与 antd 算法；color 用于 antd token 与选择器色块。
 * 完整色板在 assets/styles/color.css 的 [theme-id] / [theme-mode] 分支中定义。
 */
export type ThemeId = 'oasis' | 'sky' | 'pink' | 'butter' | 'slate' | 'deepblue'

export interface ThemeInfo {
  id: ThemeId
  name: string
  mode: 'light' | 'dark'
  color: string
  /** 选择器色块用的渐变（与 mx.gradient 观感一致） */
  gradient: string
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'oasis',
    name: '晨间绿洲',
    mode: 'light',
    color: '#10B981',
    gradient: 'linear-gradient(135deg,#34D399,#10B981)'
  },
  { id: 'sky', name: '浅蓝晴空', mode: 'light', color: '#2E9BD6', gradient: 'linear-gradient(135deg,#63B9E4,#2E9BD6)' },
  {
    id: 'pink',
    name: '浅粉蔷薇',
    mode: 'light',
    color: '#CF7C9F',
    gradient: 'linear-gradient(135deg,#E3A8C0,#CF7C9F)'
  },
  {
    id: 'butter',
    name: '浅黄晨光',
    mode: 'light',
    color: '#C9973F',
    gradient: 'linear-gradient(135deg,#E0BC6F,#C9973F)'
  },
  {
    id: 'slate',
    name: '深灰暮色',
    mode: 'dark',
    color: '#6FBF9B',
    gradient: 'linear-gradient(135deg,#8FD4B4,#6FBF9B)'
  },
  {
    id: 'deepblue',
    name: '深蓝夜色',
    mode: 'dark',
    color: '#6FA8DC',
    gradient: 'linear-gradient(135deg,#93C1E8,#6FA8DC)'
  }
]

export const DEFAULT_THEME_ID: ThemeId = 'oasis'

export const getThemeInfo = (id: string): ThemeInfo => THEMES.find((t) => t.id === id) ?? THEMES[0]

export const getThemeMode = (id: string): 'light' | 'dark' => getThemeInfo(id).mode
