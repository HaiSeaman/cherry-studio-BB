import { convertShortcutFormat } from '@main/utils/shortcut'
import { describe, expect, it } from 'vitest'

describe('convertShortcutFormat', () => {
  it('converts modifier + key arrays to electron accelerators', () => {
    expect(convertShortcutFormat(['Alt', 'Shift', 'A'])).toBe('Alt+Shift+A')
    expect(convertShortcutFormat(['CommandOrControl', 'E'])).toBe('CommandOrControl+E')
    expect(convertShortcutFormat(['Ctrl', 'Shift', '1'])).toBe('Ctrl+Shift+1')
  })

  it('accepts a pre-joined string', () => {
    expect(convertShortcutFormat('Ctrl+Shift+X')).toBe('Ctrl+Shift+X')
  })

  it('maps legacy modifier names for backward compatibility', () => {
    expect(convertShortcutFormat(['Command', 'A'])).toBe('CommandOrControl+A')
    expect(convertShortcutFormat(['Cmd', 'B'])).toBe('CommandOrControl+B')
    expect(convertShortcutFormat(['Control', 'C'])).toBe('Ctrl+C')
  })

  it('maps symbol/function keys', () => {
    expect(convertShortcutFormat(['CommandOrControl', 'Slash'])).toBe('CommandOrControl+/')
    expect(convertShortcutFormat(['CommandOrControl', 'ArrowUp'])).toBe('CommandOrControl+Up')
    expect(convertShortcutFormat(['CommandOrControl', 'F12'])).toBe('CommandOrControl+F12')
    expect(convertShortcutFormat(['CommandOrControl', 'Equal'])).toBe('CommandOrControl+=')
  })

  it('the default screenshot shortcut converts to a valid accelerator', () => {
    expect(convertShortcutFormat(['Alt', 'Shift', 'A'])).toBe('Alt+Shift+A')
  })

  it('the default desktop widget shortcut converts to a valid accelerator', () => {
    expect(convertShortcutFormat(['Alt', '`'])).toBe('Alt+`')
  })
})
