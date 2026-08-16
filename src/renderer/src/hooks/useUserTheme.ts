import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { UserTheme } from '@renderer/store/settings'
import { setUserTheme } from '@renderer/store/settings'

/**
 * 用户自定义项：字体变量注入。
 * 主题色不再由用户自定义注入（改为 6 款内置主题，见 config/themes.ts + color.css）。
 */
export default function useUserTheme() {
  const userTheme = useAppSelector((state) => state.settings.userTheme)

  const dispatch = useAppDispatch()

  const initUserTheme = (theme: UserTheme = userTheme) => {
    // Set font family CSS variables
    document.documentElement.style.setProperty('--user-font-family', `'${theme.userFontFamily}'`)
    document.documentElement.style.setProperty('--user-code-font-family', `'${theme.userCodeFontFamily}'`)
  }

  return {
    initUserTheme,

    setUserTheme(userTheme: UserTheme) {
      dispatch(setUserTheme(userTheme))

      initUserTheme(userTheme)
    }
  }
}
