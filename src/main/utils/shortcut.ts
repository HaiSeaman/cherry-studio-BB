/**
 * Convert a shortcut recorded by JS keyboard event key values to the electron
 * global shortcut accelerator format.
 * see: https://www.electronjs.org/zh/docs/latest/api/accelerator
 */
export const convertShortcutFormat = (shortcut: string | string[]): string => {
  const accelerator = (() => {
    if (Array.isArray(shortcut)) {
      return shortcut
    } else {
      return shortcut.split('+').map((key) => key.trim())
    }
  })()

  return accelerator
    .map((key) => {
      switch (key) {
        // OLD WAY FOR MODIFIER KEYS, KEEP THEM HERE FOR REFERENCE
        // case 'Command':
        //   return 'CommandOrControl'
        // case 'Control':
        //   return 'Control'
        // case 'Ctrl':
        //   return 'Control'

        // NEW WAY FOR MODIFIER KEYS
        // you can see all the modifier keys in the same
        case 'CommandOrControl':
          return 'CommandOrControl'
        case 'Ctrl':
          return 'Ctrl'
        case 'Alt':
          return 'Alt' // Use `Alt` instead of `Option`. The `Option` key only exists on macOS, whereas the `Alt` key is available on all platforms.
        case 'Meta':
          return 'Meta' // `Meta` key is mapped to the Windows key on Windows and Linux, `Cmd` on macOS.
        case 'Shift':
          return 'Shift'

        // For backward compatibility with old data
        case 'Command':
        case 'Cmd':
          return 'CommandOrControl'
        case 'Control':
          return 'Ctrl'

        case 'ArrowUp':
          return 'Up'
        case 'ArrowDown':
          return 'Down'
        case 'ArrowLeft':
          return 'Left'
        case 'ArrowRight':
          return 'Right'
        case 'AltGraph':
          return 'AltGr'
        case 'Slash':
          return '/'
        case 'Semicolon':
          return ';'
        case 'BracketLeft':
          return '['
        case 'BracketRight':
          return ']'
        case 'Backslash':
          return '\\'
        case 'Quote':
          return "'"
        case 'Comma':
          return ','
        case 'Minus':
          return '-'
        case 'Equal':
          return '='
        default:
          return key
      }
    })
    .join('+')
}
