# 打卡 TAB（Habit Tracker）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Cherry Studio fork 中新增「打卡」侧边栏 TAB：B 风格月历主界面 + Skip 跳过 + EMA 强度统计 + 归档管理 + JSON 导出导入。

**Architecture:** Dexie v13 新增 habits/habit_records 两张表（复合主键 `[habitId+date]`）；UI 数据流 useLiveQuery 直连 Dexie（对齐 notes 页面模式）；统计口径集中在 services/stats.ts 纯函数（唯一出口）；视觉复用 music/notes 的 mx 设计系统；图表自绘 div/SVG（不引新依赖）。

**Tech Stack:** React + antd + styled-components + Dexie + dexie-react-hooks + dayjs + vitest（renderer project）

**Spec:** `docs/superpowers/specs/2026-08-28-habit-tracker-design.md`（本计划从 spec 出发，两者一起读）

## Global Constraints

- 环境：Windows，shell 命令用 npm（pnpm 不在 PATH，避开 `pnpm --filter` 的脚本）
- 类型检查：`npm run typecheck:web`（不动 node/aicore 部分）
- 测试：`npm run test:renderer`（vitest，基线 170 文件 / 2863 测试全绿，85s）
- Dexie 版本号：**v13**（v8~v12 已占用，v11 音乐、v12 便签）
- `databases/index.ts` 带上游 @deprecated 标记：只做追加式改动（v13 声明 + EntityTable 类型），不动存量
- 打卡日期口径：本地时区 `YYYY-MM-DD` 字符串（同 hub_day_notes）
- 状态管理：useLiveQuery 直连，**不建 Redux slice**
- 统计口径唯一出口：services/stats.ts，组件禁止自行实现口径
- 统计分母一致性：所有「应打卡日」排除 skip 日
- 二元打卡 v1（count/frequency 字段预留不写入）
- 不引新 npm 依赖（图表/日历/emoji 全自绘或硬编码）
- 每个 Task 结束 typecheck 通过 + 相关测试通过 + git 提交

---

### Task 1: 类型定义 + Dexie v13 数据层

**Files:**
- Create: `src/renderer/src/pages/habits/types.ts`
- Modify: `src/renderer/src/databases/index.ts`（EntityTable 声明 + version(13)）
- Modify: `src/renderer/src/databases/upgrades.ts`（upgradeToV13 空实现）

**Interfaces (Produces):**
```ts
// pages/habits/types.ts
export interface Habit {
  id: string
  name: string
  icon: string            // emoji
  color: string           // '#RRGGBB'
  order: number           // 升序排列
  archived: boolean
  createdAt: number       // ms 时间戳，统计起点
  frequencyType: 'daily' | 'timesPerWeek' | 'daysOfWeek' // v1 恒 'daily'
  timesPerWeek?: number
  daysOfWeek?: number[]   // 0=周日…6=周六
}
export interface HabitRecord {
  habitId: string
  date: string            // 'YYYY-MM-DD'
  status: 'done' | 'skip'
  count?: number          // 预留，v1 不写
  createdAt: number
}
```
Dexie schema 字符串：`habits: 'id, order, archived'`、`habit_records: '[habitId+date], date'`

- [ ] **Step 1: 新建 types.ts**（按上面接口原样写入）
- [ ] **Step 2: upgrades.ts 追加**（照 upgradeToV8 签名模式）：
```ts
export async function upgradeToV13(tx: Transaction): Promise<void> {
  // v13 仅新增 habits/habit_records 两张表（无存量迁移），Dexie 按 stores 声明自动建表
  logger.info('DB migration to version 13 started')
}
```
- [ ] **Step 3: databases/index.ts 追加**：import `Habit, HabitRecord`；`as Dexie & {...}` 断言中加两行 EntityTable；文件末尾（v12 之后）加：
```ts
// --- NEW VERSION 13：打卡 TAB 两张表（习惯定义/打卡记录） ---
db.version(13)
  .stores({
    files: 'id, name, origin_name, path, size, ext, type, created_at, count',
    topics: '&id',
    settings: '&id, value',
    quick_phrases: 'id',
    message_blocks: 'id, messageId, file.id',
    music_tracks: '++id, &filePath, order, favorite',
    music_folders: '&path',
    radio_favorites: '&url',
    hub_notes: '++id, status',
    hub_todos: '++id, status',
    hub_alarms: '++id',
    hub_day_notes: '++id, date',
    hub_activity: '&date',
    hub_note_history: '++id, noteId',
    habits: 'id, order, archived',
    habit_records: '[habitId+date], date'
  })
  .upgrade((tx) => upgradeToV13(tx))
```
- [ ] **Step 4: 验证** `npm run typecheck:web` → 0 错误
- [ ] **Step 5: Commit** `feat(habits): Dexie v13 数据层（habits/habit_records 表 + 类型）`

### Task 2: 月历日期工具 calendar.ts（TDD）

**Files:**
- Create: `src/renderer/src/pages/habits/services/calendar.ts`
- Test: `src/renderer/src/pages/habits/__tests__/calendar.test.ts`

**Interfaces (Produces):**
```ts
export interface MonthDay {
  date: string    // 'YYYY-MM-DD'
  day: number     // 1..31
  isToday: boolean
  isFuture: boolean
}
export function toISODate(d: Date): string            // 本地时区补零
export function todayISO(): string
export function monthDays(year: number, month: number, today: string): MonthDay[] // month: 1~12，整月从 1 号到月末
export function monthRange(year: number, month: number): { start: string; end: string } // Dexie between 用（含首尾）
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } // month 1~12，跨年正确
export function monthTitle(year: number, month: number): string // '2026年8月'
```

- [ ] **Step 1: 先写失败测试**（关键用例）：
```ts
describe('monthDays', () => {
  it('2026 年 2 月 28 天、闰年判断正确', () => {
    expect(monthDays(2026, 2, '2026-08-28')).toHaveLength(28)
    expect(monthDays(2028, 2, '2028-02-15')).toHaveLength(29)
  })
  it('isToday/isFuture 标记正确', () => {
    const days = monthDays(2026, 8, '2026-08-28')
    expect(days.find((d) => d.day === 28)?.isToday).toBe(true)
    expect(days.find((d) => d.day === 29)?.isFuture).toBe(true)
    expect(days.find((d) => d.day === 27)?.isFuture).toBe(false)
  })
})
describe('addMonths', () => {
  it('跨年回绕', () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths(2025, 12, 1)).toEqual({ year: 2026, month: 1 })
  })
})
describe('monthRange', () => {
  it('首尾含当日', () => {
    expect(monthRange(2026, 8)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })
})
```
- [ ] **Step 2: 跑测试确认失败** `npm run test:renderer -- calendar.test` → FAIL（模块不存在）
- [ ] **Step 3: 实现 calendar.ts**（纯字符串/Date 运算，不用 dayjs 也可；月份天数 `[31,28,31,...]` + 闰年规则 `(y%4===0&&y%100!==0)||y%400===0`）
- [ ] **Step 4: 跑测试通过** `npm run test:renderer -- calendar.test` → PASS
- [ ] **Step 5: Commit** `feat(habits): 月历日期工具（TDD）`

### Task 3: 统计引擎 stats.ts（TDD，核心口径）

**Files:**
- Create: `src/renderer/src/pages/habits/services/stats.ts`
- Test: `src/renderer/src/pages/habits/__tests__/stats.test.ts`

**Interfaces (Produces):**
```ts
import type { HabitRecord } from '../types'
export function currentStreak(doneSet: Set<string>, skipSet: Set<string>, createdISO: string, today: string): number
export function longestStreak(doneSet: Set<string>, skipSet: Set<string>, createdISO: string, today: string): number
export function completionRate(doneCount: number, skipCount: number, createdISO: string, today: string): number // 0~100，除零→100
export function strengthIndex(records: HabitRecord[], createdISO: string, today: string): number // 0~100 EMA
export function weekdayDistribution(doneDates: string[], skipSet: Set<string>, createdISO: string, today: string): number[] // 7 项 0~100，索引 0=周日
```

口径（spec 4.4 节，唯一出口）：
- currentStreak：从 today 往回逐日；today 无记录不判死（从 yesterday 起算）；done 计数、skip 跳过继续、空格停止；不越过 createdISO
- longestStreak：createdISO..today 逐日扫描；done=段长+1，skip=段长保持，空=归零
- strengthIndex（EMA）：`S=S*m+X*(1-m)`，`m=0.5**(1/13)`，X=done?1:0，skip 日 S 保持，从 createdISO 逐日到 today，初值 0，结果 ×100
- createdISO 之后的日期才参与；输入日期均为 ISO 字符串，逐日回退用 `d.setDate(d.getDate()-1)` + toISODate

- [ ] **Step 1: 先写失败测试**（固定数据手算验证，用例名中文）：
```ts
// 手算基准：created='2026-08-01'，today='2026-08-10'
it('今天没打不算断：done 1~9 号，10 号空 → 连续 9', () => {
  const done = new Set(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09'])
  expect(currentStreak(done, new Set(), '2026-08-01', '2026-08-10')).toBe(9)
})
it('今天打了连续 10', () => {
  const done = new Set(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09','2026-08-10'])
  expect(currentStreak(done, new Set(), '2026-08-01', '2026-08-10')).toBe(10)
})
it('昨天空：今天打了=1，今天没打=0', () => {
  const doneUntil8 = new Set(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08'])
  expect(currentStreak(new Set([...doneUntil8, '2026-08-10']), new Set(), '2026-08-01', '2026-08-10')).toBe(1)
  expect(currentStreak(doneUntil8, new Set(), '2026-08-01', '2026-08-10')).toBe(0)
})
it('skip 不断卡：1~5 done，6 skip，7~9 done，10 空 → 连续 9', () => {
  const done = new Set(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-07','2026-08-08','2026-08-09'])
  const skip = new Set(['2026-08-06'])
  expect(currentStreak(done, skip, '2026-08-01', '2026-08-10')).toBe(9)
})
it('longestStreak：两段 3 天和 5 天 → 5', () => {
  const done = new Set(['2026-08-01','2026-08-02','2026-08-03','2026-08-06','2026-08-07','2026-08-08','2026-08-09','2026-08-10'])
  expect(longestStreak(done, new Set(), '2026-08-01', '2026-08-10')).toBe(5)
})
it('完成率：done 5 / (10 天 - skip 1) = 55.56', () => {
  expect(completionRate(5, 1, '2026-08-01', '2026-08-10')).toBeCloseTo(55.56, 1)
})
it('强度：完美打卡 1 天 ≈ (1-m)*100 ≈ 5.13', () => {
  const m = 0.5 ** (1 / 13)
  expect(strengthIndex([{ habitId: 'a', date: '2026-08-01', status: 'done', createdAt: 0 }], '2026-08-01', '2026-08-01')).toBeCloseTo((1 - m) * 100, 1)
})
it('强度 skip 日不衰减：done 后接 skip，分数保持', () => {})
```
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现 stats.ts**（内部工具 `eachDate(from, to, fn)` 逐日迭代 + `addDaysISO(iso, -1)`）
- [ ] **Step 4: 跑测试通过**（所有断言与手算一致，不一致以手算为准修实现）
- [ ] **Step 5: Commit** `feat(habits): 统计引擎（streak/skip 口径/完成率/EMA 强度，TDD）`

### Task 4: 数据服务 habitService + hooks

**Files:**
- Create: `src/renderer/src/pages/habits/services/habitService.ts`
- Create: `src/renderer/src/pages/habits/hooks/useHabits.ts`

**Interfaces:**
- Consumes: Task 1 类型、`db`（@renderer/databases）、useLiveQuery
- Produces:
```ts
// habitService.ts（全为 async，写库后 useLiveQuery 自动刷新 UI，无事件总线）
export async function toggleRecord(habitId: string, date: string): Promise<void>
// 无记录→加 done；done→删行；skip→改 done（db.habit_records 复合主键 get([habitId, date])）
export async function setSkip(habitId: string, date: string, skip: boolean): Promise<void>
// skip=true：done 改 skip / 无则建 skip；false：删 skip 行
export async function addHabit(input: { name: string; icon: string; color: string }): Promise<string>
// order = 当前 max(order)+1，uuid 用 crypto.randomUUID()
export async function updateHabit(id: string, patch: Partial<Habit>): Promise<void>
export async function setArchived(id: string, archived: boolean): Promise<void>
export async function deleteHabitForever(id: string): Promise<void> // habits.delete + habit_records.where('habitId').equals(id).delete()
export async function exportHabitsJson(): Promise<string> // { version: 1, habits, records }
export async function importHabitsJson(json: string): Promise<{ habits: number; records: number }> // 整体替换式导入，幂等
// useHabits.ts
export function useActiveHabits(): Habit[]            // useLiveQuery: habits.where('archived').equals(0?) — archived 是 boolean，
                                                       // Dexie 对 boolean 索引存 0/1：用 db.habits.toArray() 后内存过滤排序（数据量小）
export function useArchivedHabits(): Habit[]
export function useMonthRecords(year: number, month: number): { byHabit: Map<string, HabitRecord[]> } 
// useLiveQuery: db.habit_records.where('date').between(start, end, true, true).toArray()，按 habitId 分组
export function useAllRecords(): Map<string, { done: Set<string>; skip: Set<string> }>
// useLiveQuery: db.habit_records.toArray()（3.65 万条无压力），按 habitId 聚合成 done/skip 日期集合，直接喂 stats.ts
```

- [ ] **Step 1: 实现 habitService.ts**（薄封装，全部走 db API；布尔索引不可靠 → 列表过滤用 toArray + 内存 filter，见上）
- [ ] **Step 2: 实现 hooks/useHabits.ts**
- [ ] **Step 3: `npm run typecheck:web`** → 0 错误（无 fake-indexeddb，DB 层不做单测，正确性由 Task 7 手动验收 + stats 纯函数测试保障）
- [ ] **Step 4: Commit** `feat(habits): 数据服务与 useLiveQuery hooks`

### Task 5: 入口接入（侧边栏/路由/i18n/迁移兜底/空页面）

**Files:**
- Modify: `src/renderer/src/types/index.ts:477` — `SidebarIcon` 加 `'habits'`
- Modify: `src/renderer/src/config/sidebar.ts` — `DEFAULT_SIDEBAR_ICONS` 加 `'habits'`
- Modify: `src/renderer/src/i18n/label.ts` — `sidebarIconKeyMap` 加 `habits: '打卡'`
- Modify: `src/renderer/src/components/app/Sidebar.tsx` — iconMap 加 `habits: <CalendarCheck size={18} className="icon" />`（lucide-react，已为项目依赖）、pathMap 加 `habits: '/habits'`
- Modify: `src/renderer/src/store/migrate.ts` — sidebarIcons 处理处追加：老用户 visible 不含 habits 时 push（`if (Array.isArray(icons.visible) && !icons.visible.includes('habits')) icons.visible.push('habits')`）
- Modify: `src/renderer/src/Router.tsx` — `const HabitsPage = lazy(() => import('./pages/habits/HabitsPage'))` + `<Route path="/habits" element={<HabitsPage />} />`
- Create: `src/renderer/src/pages/habits/HabitsPage.tsx` — 暂时骨架（Container + 标题），Task 8 填充

- [ ] **Step 1: 逐文件按上述修改**（migrate.ts 追加在 DEPRECATED_SIDEBAR_ICONS 过滤逻辑同一处）
- [ ] **Step 2: `npm run typecheck:web`** → 0 错误
- [ ] **Step 3: `npm run test:renderer -- migrate`** → 迁移相关测试通过（如有既有断言需同步更新，按测试期望修 migrate 实现的断言 fixture）
- [ ] **Step 4: 手动验收** `npm run dev` → 侧边栏出现「打卡」图标，点击进入空页面，控制台无 Dexie 报错
- [ ] **Step 5: Commit** `feat(habits): 侧边栏入口/路由/i18n/老设置迁移兜底`

### Task 6: mx 设计系统复用 + HabitForm 弹窗

**Files:**
- Create: `src/renderer/src/pages/habits/components/mx.tsx` — `export * from '../../music/components/mx'`（对齐 notes 复用模式）
- Create: `src/renderer/src/pages/habits/components/HabitForm.tsx`

**Interfaces (Produces):**
```ts
export const HABIT_COLORS: string[] = ['#D85A30','#2F7ED8','#2E9E5B','#B8860B','#8E44AD','#C2426E','#008B8B','#D2691E','#5F6B7A','#3CB371']
export const HABIT_EMOJIS: string[] = ['🚭','💧','🏃','😴','📚','🧘','🥗','💪','✍️','🎸','🧹','💊','🦷','☀️','🚶','🛏️']
export interface HabitFormProps { open: boolean; editing?: Habit | null; onClose: () => void }
// 用 MXDialog + DialogField + MXPrimaryButton；提交调 addHabit/updateHabit 后 onClose
```

- [ ] **Step 1: 实现 mx.tsx 复用 + HabitForm**（名称输入用 DialogField 内 antd Input；emoji 网格单选；色板圆点单选带选中描边；编辑模式回填初值）
- [ ] **Step 2: `npm run typecheck:web`** → 0 错误
- [ ] **Step 3: Commit** `feat(habits): 习惯新增/编辑弹窗（emoji+色板，复用 mx）`

### Task 7: MonthCalendar 主界面 + StatsCards（核心交互）

**Files:**
- Create: `src/renderer/src/pages/habits/components/MonthCalendar.tsx`
- Create: `src/renderer/src/pages/habits/components/StatsCards.tsx`
- Modify: `src/renderer/src/pages/habits/HabitsPage.tsx` — 挂 MonthCalendar + StatsCards + HabitForm 入口

**Interfaces:**
- Consumes: useActiveHabits/useMonthRecords、toggleRecord/setSkip、calendar/stats
- Produces:
```ts
// MonthCalendar 内部状态：viewYear/viewMonth（默认当月）
// 格子样式映射（styled-components，$status prop）：
//   done=习惯色浅色实底(#习惯色 + '33' 透明度)；skip=灰底'-'
//   today-done=习惯色实底+深描边；today-empty=习惯色虚线描边
//   missed(过去空格)=透明+红色虚线；future=透明不可点
// 交互：左键点击非 future 格 toggleRecord；右键 onContextMenu 阻止默认弹小菜单（antd Dropdown）选「标记跳过/取消跳过」
// 撤销：取消打卡后 antd message.open({ content: '已取消打卡', btn: <Button onClick={undo}>撤销</Button>, duration: 5 })
//   undo 实现闭包重放 toggleRecord(habitId, date)；同一时刻仅保留最近一条（message.destroy 前条）
// 行尾两列：当前连续 / 最长连续（currentStreak/longestStreak，输入为该 habit 当月+全局 done/skip 集合）
//   streak 计算需要全量记录：MonthCalendar 用 useHabits 全量 records？否——单 habit 全量记录由 stats 需要驱动：
//   useAllRecords(): Map<habitId, { done: Set<string>; skip: Set<string> }>（useLiveQuery db.habit_records.toArray()，3.65 万条无压力）
// StatsCards：累计打卡天数 / 今日进度 X/Y / 近30天完成率 / 最佳连续（全部出自 stats.ts + useAllRecords）
```

- [ ] **Step 1: 实现 MonthCalendar.tsx**（翻月按钮组 + 日期头行 + 习惯行；习惯名点击留 onOpenDetail prop，Task 9 接线）
- [ ] **Step 2: 实现 StatsCards.tsx**
- [ ] **Step 3: HabitsPage 组装**（「+ 添加习惯」按钮开 HabitForm；空习惯列表时显示 mx EmptyText 引导建第一个习惯）
- [ ] **Step 4: `npm run typecheck:web`** → 0 错误
- [ ] **Step 5: 手动验收** `npm run dev`：建习惯→点格子打卡→再点取消（撤销按钮可用）→右键跳过→翻月→补卡；颜色规则与 spec 4.2 一致
- [ ] **Step 6: Commit** `feat(habits): B 风格月历主界面（打卡/补卡/跳过/撤销/翻月/统计卡）`

### Task 8: HabitsPage 三视图切换 + 跨午夜刷新

**Files:**
- Modify: `src/renderer/src/pages/habits/HabitsPage.tsx`

**Interfaces:**
```ts
type ViewKey = 'calendar' | 'stats' | 'manage'   // MXTabs 切换；Task 9/10/11 填充 stats/manage 内容
// 跨午夜：useEffect 内 setInterval(30_000) 比较 todayISO() 变化，变化则 setState 触发重渲染（today 以 state 下发）
```
- [ ] **Step 1: 实现**（today 用 useState+interval；view 状态上提 HabitsPage）
- [ ] **Step 2: typecheck + Commit** `feat(habits): 页面三视图框架与跨午夜自刷新`

### Task 9: HabitDetail 单习惯详情

**Files:**
- Create: `src/renderer/src/pages/habits/components/HabitDetail.tsx`
- Modify: `MonthCalendar.tsx` — 习惯名点击回调打开详情（MXDialog 全屏弹层或页内切换，选页内切换返回按钮）

**Interfaces:**
```ts
export interface HabitDetailProps { habit: Habit; onBack: () => void }
// 展示：当前连续/最长连续/总打卡/强度指数（stats.ts 四件套）+ 星期分布柱状图（7 根 div 柱，高度=百分比）
// 数据：useAllRecords 中该 habit 集合；createdISO=toISODate(new Date(habit.createdAt))
```
- [ ] **Step 1: 实现**（柱状图纯 div/styled，无图表库）
- [ ] **Step 2: typecheck + 手动验收**（数字与月历行尾一致）
- [ ] **Step 3: Commit** `feat(habits): 单习惯详情（四指标+星期分布）`

### Task 10: StatsView 统计视图

**Files:**
- Create: `src/renderer/src/pages/habits/components/StatsView.tsx`

**Interfaces:**
```ts
// 模块1 趋势：近 N 日「全部习惯当日完成率」SVG 折线（N=30/90/365 切换按钮），Y 轴 0~100%
// 模块2 对比：各活跃习惯完成率横条（div 宽度百分比，习惯色，按强度指数降序）
// 模块3 年度热力图：当日完成习惯数/活跃习惯数 → 5 档色阶（复用 notes calendarUtils hmLevel 思路自实现 hmLevelHabit），52×7 div 网格 + 月份标签
```
- [ ] **Step 1: 实现**（SVG polyline 点位按日索引均匀分布；空数据显示 EmptyText）
- [ ] **Step 2: typecheck + 手动验收**（对比月历抽查 3 天数值一致）
- [ ] **Step 3: Commit** `feat(habits): 统计视图（趋势折线/完成率对比/年度热力图）`

### Task 11: 习惯管理视图（归档/彻底删除/导出导入）

**Files:**
- Create: `src/renderer/src/pages/habits/components/HabitManage.tsx`
- Modify: `HabitsPage.tsx` — manage 视图挂 HabitManage

**Interfaces:**
```ts
// 活跃列表：编辑按钮（开 HabitForm editing）+ 归档按钮（antd Popconfirm）
// 已归档列表：恢复 / 彻底删除（Modal.confirm 二次确认，文案说明连带删除全部记录）
// 数据安全区：导出 JSON（Blob 下载 habit-backup-YYYYMMDD.json）/ 导入（file input + importHabitsJson，完成后 message 显示导入条数）
```
- [ ] **Step 1: 实现**
- [ ] **Step 2: typecheck + 手动验收**（归档后月历消失、恢复回来；导出→删习惯→导入还原）
- [ ] **Step 3: Commit** `feat(habits): 习惯管理与 JSON 导出导入`

### Task 12: 打磨 + 全量验收

**Files:**
- Modify: 上述 UI 文件（暗色主题适配、窄窗口、空态、i18n 文案检查）

- [ ] **Step 1: 暗色主题**：所有硬编码色值过一遍 mx 主题 token（参照 music/notes 在暗色下的表现），红色虚线/灰色 skip 在暗色下对比度足够
- [ ] **Step 2: 窄窗口**：格子 min-width 22px，月历区 overflow-x auto，习惯名列 sticky left
- [ ] **Step 3: 全量验证**：`npm run typecheck:web` 0 错误；`npm run test:renderer` 全绿（含新增 calendar/stats 测试）
- [ ] **Step 4: 代码审查**：对全部新增/修改 diff 跑 code-review，修复发现的问题
- [ ] **Step 5: Commit** `polish(habits): 暗色主题/窄窗口适配与整体打磨`
