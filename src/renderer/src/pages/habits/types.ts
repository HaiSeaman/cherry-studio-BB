/**
 * 打卡 TAB（Habit Tracker）类型定义
 * 设计文档：docs/superpowers/specs/2026-08-28-habit-tracker-design.md
 */

/** 习惯定义（长期保存，删除走归档） */
export interface Habit {
  id: string // uuid（crypto.randomUUID()）
  name: string // 习惯名称，如"戒烟"
  note?: string // 备注（可选）：补充说明具体要求，如"每天至少 2000ml"；老数据无此字段
  icon: string // emoji 图标，用于列表/详情
  color: string // 主题色 '#RRGGBB'（色板中选，如 #D85A30）
  order: number // 排序权重，升序从上到下
  archived: boolean // 归档（主视图隐藏，数据保留）
  createdAt: number // 创建时间戳 ms，统计口径的起点
  // ---- 以下为预留字段：v1 固定 daily，UI 不暴露，未来支持频率时只改 UI 不改表 ----
  frequencyType: 'daily' | 'timesPerWeek' | 'daysOfWeek'
  timesPerWeek?: number // frequencyType='timesPerWeek' 时使用（如 3）
  daysOfWeek?: number[] // frequencyType='daysOfWeek' 时使用（0=周日…6=周六，如 [1,3,5]）
}

/** 打卡记录：一行 = 某习惯某天的状态；删除该行 = 当天恢复"未处理" */
export interface HabitRecord {
  habitId: string
  date: string // 'YYYY-MM-DD'，本地时区
  status: 'done' | 'skip' // done=已打卡；skip=跳过（不断卡不扣分）
  // ---- 预留：v1 不写入 ----
  count?: number // 未来次数打卡（喝水 8 杯）用
  createdAt: number // 记录写入时间（区分当天打的还是后来补的）
}
