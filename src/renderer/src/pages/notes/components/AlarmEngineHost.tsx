import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FC } from 'react'

import { useAlarmEngine } from '../services/alarmScheduler'
import { AlarmRingingBanner } from './AlarmRingingBanner'

/**
 * 应用级闹钟引擎挂载点（Router 根常驻，不随路由切换卸载）：
 * - 全局定时器在首次数据同步时启动，此后无论用户在哪个页面闹钟都会响
 *   （此前引擎只挂在便签页：应用启动后没进过便签页 → 调度器从未启动 → 所有闹钟静默错过）
 * - 响铃横幅全局渲染：任何页面都能看到「闹钟响铃中」并一键关闭
 *   （此前横幅只在便签页内，其他页面只有声音和一条不可交互的系统通知）
 */
const AlarmEngineHost: FC = () => {
  const alarms = useLiveQuery(async () => (await db.hub_alarms.toArray()) ?? [], [], [])
  const { ringing, stopRinging } = useAlarmEngine(alarms ?? [])
  return <AlarmRingingBanner ringing={ringing} onStop={stopRinging} />
}

export default AlarmEngineHost
