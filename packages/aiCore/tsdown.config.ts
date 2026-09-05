import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'built-in/plugins/index': 'src/core/plugins/built-in/index.ts',
    'provider/index': 'src/core/providers/index.ts',
    // 补充 renderer 实际消费的深路径入口（definePlugin 运行时 + 类型），
    // 否则发布后的 exports 无法解析这些路径，只能靠开发 alias 兜底
    'core/index': 'src/core/index.ts',
    'core/plugins/index': 'src/core/plugins/index.ts'
  },
  outDir: 'dist',
  format: ['esm', 'cjs'],
  clean: true,
  dts: true,
  tsconfig: 'tsconfig.json'
})
