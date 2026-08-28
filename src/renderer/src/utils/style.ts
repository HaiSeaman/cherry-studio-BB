import type { HexColor } from '@renderer/types'
import { isHexColor } from '@renderer/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs))
}

function checkHexColor(value: string) {
  if (!isHexColor(value)) {
    throw new Error(`Invalid hex color string: ${value}`)
  }
}

function getRGB(hex: HexColor): [number, number, number] {
  checkHexColor(hex)
  // 移除开头的#号
  const cleanHex = hex.charAt(0) === '#' ? hex.slice(1) : hex

  // 将hex转换为RGB值
  const r = parseInt(cleanHex.slice(0, 2), 16)
  const g = parseInt(cleanHex.slice(2, 4), 16)
  const b = parseInt(cleanHex.slice(4, 6), 16)

  return [r, g, b]
}

/**
 * 计算相对亮度
 *
 * 相对亮度是一个介于0-1之间的值，用于表示颜色的亮度。
 * 这个计算基于 WCAG 2.0 规范，用于确定颜色的可访问性。
 *
 * @param r - 红色通道值 (0-255)
 * @param g - 绿色通道值 (0-255)
 * @param b - 蓝色通道值 (0-255)
 * @returns 相对亮度值 (0-1)
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const rs = r / 255
  const gs = g / 255
  const bs = b / 255
  const normalize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * normalize(rs) + 0.7152 * normalize(gs) + 0.0722 * normalize(bs)
}

/**
 * 根据字符生成颜色代码，用于 avatar。
 * @param {string} char 输入字符
 * @returns {HexColor} 十六进制颜色字符串
 */
export function generateColorFromChar(char: string): HexColor {
  const seed = char.charCodeAt(0)
  const a = 1664525
  const c = 1013904223
  const m = Math.pow(2, 32)

  let r = (a * seed + c) % m
  let g = (a * r + c) % m
  let b = (a * g + c) % m

  r = Math.floor((r / m) * 256)
  g = Math.floor((g / m) * 256)
  b = Math.floor((b / m) * 256)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * 根据背景色获取合适的前景色（文字颜色）
 *
 * @param {HexColor} backgroundColor - 背景色的十六进制颜色值（例如：'#FFFFFF'）
 * @returns {HexColor} 返回适合的前景色，要么是黑色('#000000')要么是白色('#FFFFFF')
 */
export function getForegroundColor(backgroundColor: HexColor): HexColor {
  checkHexColor(backgroundColor)

  const [r, g, b] = getRGB(backgroundColor)
  const luminance = getRelativeLuminance(r, g, b)

  return luminance > 0.179 ? '#000000' : '#FFFFFF'
}
