# 代码审计报告（2026-08-29 全仓 review）

> 范围：全仓正确性/安全/性能 + 死代码/多余设计/无用依赖
> 方法：habits 模块逐文件深审 + 全仓自动化扫描（oxlint/eslint/biome/tsgo/vitest/死文件脚本/依赖引用核对）+ 泄漏模式 grep

## 一、已修复问题（本轮全部落地）

| # | 位置 | 问题 | 严重级 | 修复 |
|---|------|------|--------|------|
| 1 | `NaturalYearStats.tsx:44` | `allRecords.get(id) ?? {new Set()}` 每次渲染新建兜底对象 → 依赖 `sets` 的 useMemo 全部失效（每帧重建 366 格热力图） | Should-fix | 模块级 `EMPTY_SETS` 单例，身份稳定 |
| 2 | `NaturalYearStats.tsx` | 新增 memo 化时把 useMemo 放在条件 return 之后——**React Hooks 规则违规**（二次审查时自抓） | Critical | 所有 hooks 无条件前移 + 空安全化 |
| 3 | `ShortcutService.ts:86` | `screenshotService.startCapture()` 浮空 Promise | Should-fix | `void` |
| 4 | `scripts/screenshot-smoke.js:17` | `whenReady().then()` 链无 rejection 处理 | Should-fix | 补 `.catch` |
| 5 | `.oxlintrc.json` + `eslint.config.mjs` | `no-unused-vars` 缺 `_` 前缀忽略约定 → 3 处故意忽略的 `_tx/_lr/_ltk` 误报（配置缺陷，根因修复） | Nice | 加 `varsIgnorePattern/argsIgnorePattern: '^_'` |
| 6 | habits 4 个新文件 | import 排序错误（eslint simple-import-sort） | Nice | `--fix` |
| 7 | `NaturalYearStats.tsx` | YearBtn/Chip 按钮缺 `type="button"` | Nice | 补上 |

**oxlint：5 警告 → 0；eslint habits 目录：0 错误 0 警告；biome：全绿。**

## 二、核查后确认无问题（防重复怀疑）

- **无死依赖**：10 个运行时依赖逐一核对引用（ripgrep 走构建期二进制、pdf-parse/officeparser/jsdom 走动态 import）
- **无死文件**：死文件脚本仅剩 5 个已知配置入口误报（aiCore/src、main、preload、proxy/bootstrap）
- **Dexie schema 正确**：habits `'id, order, archived'`、habit_records `'[habitId+date], date'`（月查询走 date 索引）；v13 升级无迁移需求
- **泄漏模式**：MinappPopupContainer interval / useBridge message 监听均有正确清理
- **habitService 状态机**：toggle/skip/restore 边界与注释一致；deleteHabitForever 事务完整
- **stats.ts 边界**：空窗口（start>end）、闰年 366 天、未满年截断、除零均正确（11 个测试覆盖）

## 三、遗留问题（非本次改动，未动用户 WIP）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 1 | `useSmoothStream.ts` ×4、`FmRadio.tsx` ×4、`LocalMusicPlayer.tsx`、`FolderModal.tsx`、`PrivacyPopup.tsx` | react-hooks/exhaustive-deps 警告（依赖数组缺项，用户进行中代码） | 在用户自己的改动回合处理，避免冲突 |
| 2 | main 测试 7 个 filesystem 安全用例 | WorkBuddy safe-delete 沙箱拦截 `fs.rm`（环境问题，基线即有） | 与代码无关，CI 环境不受影响 |

## 四、性能观察（无需立即改）

- MonthCalendar 每格包 antd Dropdown（N 习惯×31 天个实例）：关闭态开销小，量级可接受；若未来习惯数>15 可改事件委托
- 打卡页所有查询走 Dexie 索引 + useLiveQuery 增量刷新，无 N+1

## 五、验收

- oxlint / eslint / biome / tsgo(web+node)：全绿
- vitest：renderer 173 文件 2884 测试 ✓ shared ✓ aiCore ✓ main 303 ✓（7 个环境性失败除外）
- 全量回归通过，无新引入 bug
