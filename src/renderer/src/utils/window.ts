/**
 * 窗口相关的小工具。
 */

export const isFocused = () => {
  return document.hasFocus()
}

export const isOnHomePage = () => {
  return window.location.hash === '#/' || window.location.hash === '#' || window.location.hash === ''
}

/** 自定义 CSS 注入口的 DOM id（主窗口 / 快捷助手 / 划词工具栏共用一个） */
const CUSTOM_CSS_ELEMENT_ID = 'user-defined-custom-css'

/**
 * 把用户自定义 CSS 注入到当前页面。
 * 先移除旧节点再写入，保证设置变更时不会叠加多份样式。
 *
 * 主窗口、快捷助手、划词动作窗口各自是独立渲染进程，都需要单独注入，
 * 所以三个入口都调用这个函数（原本是三份一模一样的 useEffect 代码）。
 */
export function applyUserCustomCss(css: string | undefined | null): void {
  document.getElementById(CUSTOM_CSS_ELEMENT_ID)?.remove()

  if (!css) return

  const styleElement = document.createElement('style')
  styleElement.id = CUSTOM_CSS_ELEMENT_ID
  styleElement.textContent = css
  document.head.appendChild(styleElement)
}
