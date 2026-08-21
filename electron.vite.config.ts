import react from '@vitejs/plugin-react-swc'
import { CodeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

// assert not supported by biome
// import pkg from './package.json' assert { type: 'json' }
import pkg from './package.json'
import { buildProxyBootstrapPlugin } from './scripts/buildProxyBootstrapPlugin'

const visualizerPlugin = (type: 'renderer' | 'main') => {
  return process.env[`VISUALIZER_${type.toUpperCase()}`] ? [visualizer({ open: true })] : []
}

const isDev = process.env.NODE_ENV === 'development'
const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  main: {
    plugins: [
      ...visualizerPlugin('main'),
      buildProxyBootstrapPlugin({
        dependencies: Object.keys(pkg.dependencies),
        isProd,
        rootDir: __dirname
      })
    ],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@types': resolve('src/renderer/src/types'),
        '@shared': resolve('packages/shared'),
        '@logger': resolve('src/main/services/LoggerService')
      }
    },
    build: {
      rollupOptions: {
        external: ['bufferutil', 'utf-8-validate', 'electron', ...Object.keys(pkg.dependencies)],
        output: {
          manualChunks: undefined, // 彻底禁用代码分割 - 返回 null 强制单文件打包
          inlineDynamicImports: true // 内联所有动态导入，这是关键配置
        },
        onwarn(warning, warn) {
          if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') return
          warn(warning)
        }
      },
      sourcemap: isDev
    },
    esbuild: isProd ? { legalComments: 'none' } : {},
    optimizeDeps: {
      noDiscovery: isDev
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('packages/shared')
      }
    },
    build: {
      sourcemap: isDev
    }
  },
  renderer: {
    plugins: [
      (async () => (await import('@tailwindcss/vite')).default())(),
      react({
        tsDecorators: true
      }),
      ...(isDev ? [CodeInspectorPlugin({ bundler: 'vite' })] : []), // 只在开发环境下启用 CodeInspectorPlugin
      ...visualizerPlugin('renderer')
    ],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('packages/shared'),
        '@types': resolve('src/renderer/src/types'),
        '@logger': resolve('src/renderer/src/services/LoggerService'),
        '@cherrystudio/ai-core/provider': resolve('packages/aiCore/src/core/providers'),
        '@cherrystudio/ai-core/built-in/plugins': resolve('packages/aiCore/src/core/plugins/built-in'),
        '@cherrystudio/ai-core': resolve('packages/aiCore/src')
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext' // for dev
      }
    },
    worker: {
      format: 'es'
    },
    build: {
      target: 'esnext', // for build
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          miniWindow: resolve(__dirname, 'src/renderer/miniWindow.html'),
          musicWidget: resolve(__dirname, 'src/renderer/musicWidget.html'),
          selectionToolbar: resolve(__dirname, 'src/renderer/selectionToolbar.html'),
          selectionAction: resolve(__dirname, 'src/renderer/selectionAction.html')
        },
        onwarn(warning, warn) {
          if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') return
          warn(warning)
        },
        output: {
          // 拆分 vendor：避免所有懒加载页面的公共依赖合并成 12MB 巨型 store chunk，
          // 首页只加载自己依赖的 chunk，缩短首屏解析时间
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            // React 核心独立成块（先于 antd/react 规则匹配）：
            // 挂件轻量入口（musicWidget）只依赖 react+dexie+lucide，
            // 若 react 核心混入 antd/主应用生态大块，挂件会整块执行数 MB 依赖（回归：挂件内存超标）
            if (
              /node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id) ||
              id.includes('use-sync-external-store')
            ) {
              return 'reactcore'
            }
            // lucide（含核心工厂 createLucideIcon）独立成块且唯一命名：
            // 该工厂同时被 antd 内部图标与 lucide 图标共享，若并入 antd 块，
            // 挂件会通过图标反向加载 2.7MB antd。独立 chunk 让 antd 改为从它 import。
            if (id.includes('lucide')) return 'lucide'
            if (id.includes('/classnames/')) return 'lucide' // lucide 核心依赖
            if (id.includes('dexie')) return 'vendor-dexie'
            if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'vendor-antd'
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
            if (id.includes('motion')) return 'vendor-motion'
            if (id.includes('highlight')) return 'vendor-highlight'
            if (id.includes('lodash')) return 'vendor-lodash'
            if (id.includes('redux') || id.includes('@reduxjs') || id.includes('reselect')) return 'vendor-redux'
            if (id.includes('fake-indexeddb')) return 'vendor-dexie'
            // 其余 node_modules 不强制合并，交给打包器按共享度自动分包
            return undefined
          }
        }
      }
    },
    esbuild: isProd ? { legalComments: 'none' } : {}
  }
})
