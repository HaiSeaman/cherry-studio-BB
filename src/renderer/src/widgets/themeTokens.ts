/** 挂件主题 token 应用：把主窗口推送来的主题 token 写入挂件 CSS 变量（跟随主程序配色） */

export type WidgetThemeTokens = {
  primary?: string
  background?: string
  backgroundSoft?: string
  border?: string
  text?: string
  text2?: string
  text3?: string
  mode?: string
}

/**
 * 应用主题 token 到 :root CSS 变量。
 * - 主窗口按 `--color-*` 变量给出实际色值 → 映射到挂件的语义变量（--accent/--bg/--soft 等）
 * - mode 决定是否覆盖深浅基色（主窗口主题与系统深浅可能不同）
 */
export function applyThemeTokens(tokens: WidgetThemeTokens): void {
  const root = document.documentElement
  const css = (name: string, value?: string) => {
    if (value) root.style.setProperty(name, value)
  }
  // 主色 / 强调
  css('--accent', tokens.primary)
  css('--accent-strong', tokens.primary ? shade(tokens.primary, -0.08) : undefined)
  css('--accent-soft', tokens.primary ? hexToRgba(tokens.primary, 0.12) : undefined)
  css('--gradient', tokens.primary ? `linear-gradient(135deg, ${shade(tokens.primary, 0.15)}, ${tokens.primary})` : undefined)
  // 背景 / 卡片 / 文本
  css('--bg', tokens.background)
  css('--card-solid', tokens.background)
  css('--card', tokens.background)
  css('--soft', tokens.backgroundSoft)
  css('--softer', tokens.background)
  css('--border', tokens.border)
  css('--text', tokens.text)
  css('--text-2', tokens.text2)
  css('--text-3', tokens.text3)
}

/** 十六进制颜色微调亮度（delta ∈ [-1,1]，>0 变亮 / <0 变暗）；非 #rrggbb 返回原值 */
function shade(hex: string, delta: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const num = parseInt(m[1], 16)
  const r = Math.round(clamp(((num >> 16) & 255) * (1 + delta)))
  const g = Math.round(clamp(((num >> 8) & 255) * (1 + delta)))
  const b = Math.round(clamp((num & 255) * (1 + delta)))
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return `rgba(16, 185, 129, ${alpha})`
  const num = parseInt(m[1], 16)
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

const clamp = (v: number) => Math.min(255, Math.max(0, v))
