# Cherry-Studio-BB v1.7.1 Release Notes

## 🚀 核心主题：全仓过度设计瘦身（Ponytail Audit）与现代原生化重构

Cherry Studio 在 1.7.1 版本中迎来了深度的代码治理与过度工程清理。我们针对全仓 15 万行代码进行了全面审查，去除了冗余抽象与手写重复逻辑，剥离多余第三方依赖，拥抱现代 Web / Node.js 原生能力，使整体运行更轻快、架构更健壮！

---

### 🌟 主要改进一览

#### 1. ⚡ 标准库与原生特性优先（原生化重构）
- **UUID 原生化**：彻底告别冗余的 `uuid()` 工具包装，全仓统一直接调用浏览器与 Node.js 现代原生标准 `crypto.randomUUID()`，底层调用更直接高效。
- **对象属性判断原生化**：移除手写 `hasObjectKey()` 检查函数，全面对齐现代 ECMAScript 标准 `Object.hasOwn()`。
- **异步延迟内联化**：移除 `delay()` 手写包装，统一直接使用内联 `new Promise(resolve => setTimeout(resolve, ms))`，毫秒粒度更精准直观。
- **样式类名规范化**：消除 `classNames = clsx` 别名层，全部 15+ 视图组件直接使用 `clsx`。

#### 2. 📦 依赖瘦身与精简
- **原生文件系统升级**：核心的备份管理器（`BackupManager`）全面告别第三方 `fs-extra` 库，深度迁移至 Node.js 官方原生 `node:fs/promises` 与 `node:fs`。
- **依赖彻底剥离**：从 `package.json` 与锁定文件中彻底移除 `fs-extra` 及 `@types/fs-extra`，并清理了历史遗留的孤儿包（`react-player`、`tsx`），减小体积并提升依赖安装速度。

#### 3. 🧹 全仓死代码深度清理（净减 1000+ 行代码）
- **死逻辑/无用导出剔除**：
  - 移除 `packages/aiCore` 与 `shared` 中的无引用工具（如 83 行的 `formatPrivateKey`、`formatAzureOpenAIApiHost` 等）。
  - 移除 `utils/` 中重复的 `getErrorMessage`、未调用的队列清理函数 `clearAllQueues`、仅测试引用的 `getIntersection`、已废弃的 `updateFileCounts` 方法链等。
  - 移除废弃组件 `Navbar.tsx` 及多处空的 barrel 导出桶文件。
- **TopView 弹窗死字段清理**：全面清理 26 处无读取的 `static topviewId = 0` 死字段。

#### 4. 🏗️ 重复架构合并与多窗口启动标准化
- **弹窗家族重构**：将结构高度一致的 `BackupPopup` 与 `RestorePopup` 合并为 `BackupRestorePopup.tsx`；`SearchPopup` 与 `TextFilePreview` 等精简为基于 `GeneralPopup` 的轻量化呈现，大幅减少重复 UI 样板代码。
- **多窗口引导统一**：抽象 `src/renderer/src/windows/bootstrap.ts`，统一各子窗口的 Keyv 初始化、Store 同步订阅与 Provider 容器。
- **错误响应统一**：`BaseFileService` 统一收口 7 处远程文件服务的失败响应模板；FM 电台去重逻辑统一复用 `dedupStationsByUrl`。

---

### 🛡️ 质量保障与回归验证
- **全量测试守卫**：全仓 **214 个测试文件、3644+ 单元与集成测试全部 100% 通过**（涵盖渲染主进程、aiCore、shared 及各个功能模块）。
- **类型安全**：TypeScript Main / Web / Node 全量类型检查零错误。
- **代码规范**：Biome 格式化与 Oxlint 静态语法检查全部通过。
