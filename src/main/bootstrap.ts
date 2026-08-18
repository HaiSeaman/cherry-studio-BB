import { occupiedDirs } from '@shared/config/constant'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

import { getNewDataPathFromArgs } from './utils'
import { initAppDataDir } from './utils/init'

// ---------------------------------------------------------------------------
// Browser-API polyfills for the Node.js main process.
//
// pdf-parse bundles pdfjs-dist 5.x which references DOMMatrix / ImageData /
// Path2D at module-evaluation time in the Node environment. Node has none of
// these globals, so without a polyfill any PDF handling in the main process
// crashes with "ReferenceError: DOMMatrix is not defined". @napi-rs/canvas
// provides full implementations; a minimal fallback keeps text extraction
// working when the native binding cannot be loaded (e.g. inside asar without
// unpacked binaries). This must run before any module that imports pdf-parse.
// ---------------------------------------------------------------------------
if (typeof globalThis.DOMMatrix === 'undefined') {
  let canvas: any = null
  try {
    canvas = require('@napi-rs/canvas')
  } catch (error) {
    console.warn('[bootstrap] Failed to load @napi-rs/canvas for DOMMatrix polyfill:', error)
  }

  const setPolyfill = (name: 'DOMMatrix' | 'ImageData' | 'Path2D', value: any) => {
    if (typeof (globalThis as any)[name] === 'undefined' && value) {
      ;(globalThis as any)[name] = value
    }
  }

  setPolyfill('DOMMatrix', canvas?.DOMMatrix)
  setPolyfill('ImageData', canvas?.ImageData)
  setPolyfill('Path2D', canvas?.Path2D)

  // Minimal fallback so pdf text extraction (which builds DOMMatrix instances
  // for transformation math) does not crash when canvas is unavailable.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    class DOMMatrixFallback {
      a = 1
      b = 0
      c = 0
      d = 1
      e = 0
      f = 0

      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          ;[this.a, this.b, this.c, this.d, this.e, this.f] = init
        }
      }

      multiply(other: DOMMatrixFallback): DOMMatrixFallback {
        const { a, b, c, d, e, f } = this
        const { a: oa, b: ob, c: oc, d: od, e: oe, f: of } = other
        return new DOMMatrixFallback([
          a * oa + c * ob,
          b * oa + d * ob,
          a * oc + c * od,
          b * oc + d * od,
          a * oe + c * of + e,
          b * oe + d * of + f
        ])
      }

      translate(tx: number, ty = 0): DOMMatrixFallback {
        return this.multiply(new DOMMatrixFallback([1, 0, 0, 1, tx, ty]))
      }

      scale(sx: number, sy = sx): DOMMatrixFallback {
        return this.multiply(new DOMMatrixFallback([sx, 0, 0, sy, 0, 0]))
      }

      inverse(): DOMMatrixFallback {
        const { a, b, c, d, e, f } = this
        const det = a * d - b * c
        if (det === 0) {
          return new DOMMatrixFallback()
        }
        const inv = 1 / det
        return new DOMMatrixFallback([
          d * inv,
          -b * inv,
          -c * inv,
          a * inv,
          (c * f - d * e) * inv,
          (b * e - a * f) * inv
        ])
      }

      transformPoint(point: { x: number; y: number }): { x: number; y: number } {
        const { a, b, c, d, e, f } = this
        return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f }
      }
    }
    ;(globalThis as any).DOMMatrix = DOMMatrixFallback
  }
}

app.isPackaged && initAppDataDir()

// 在主进程中复制 appData 中某些一直被占用的文件
// 在renderer进程还没有启动时，主进程可以复制这些文件到新的appData中
function copyOccupiedDirsInMainProcess() {
  const newAppDataPath = getNewDataPathFromArgs()
  if (!newAppDataPath) {
    return
  }

  if (process.platform === 'win32') {
    const appDataPath = app.getPath('userData')
    occupiedDirs.forEach((dir) => {
      const dirPath = path.join(appDataPath, dir)
      const newDirPath = path.join(newAppDataPath, dir)
      if (fs.existsSync(dirPath)) {
        fs.cpSync(dirPath, newDirPath, { recursive: true })
      }
    })
  }
}

copyOccupiedDirsInMainProcess()
