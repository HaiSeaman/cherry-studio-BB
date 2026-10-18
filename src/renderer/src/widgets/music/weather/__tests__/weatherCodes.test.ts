import { describe, expect, it } from 'vitest'

import {
  findTodayIndex,
  formatClock,
  formatCoordinates,
  formatWeekday,
  getAqiLevel,
  getDayLabels,
  getUvLevel,
  getWeatherIconKey,
  getWeatherText,
  getWindDirection,
  localDateString,
  UNKNOWN_WEATHER_TEXT
} from '../weatherCodes'

describe('天气码翻译', () => {
  it('常见天气码翻译成中文', () => {
    expect(getWeatherText(0)).toBe('晴')
    expect(getWeatherText(3)).toBe('阴')
    expect(getWeatherText(61)).toBe('小雨')
    expect(getWeatherText(95)).toBe('雷阵雨')
  })

  it('未知或缺失的天气码返回「未知天气」，不返回 undefined', () => {
    expect(getWeatherText(123)).toBe(UNKNOWN_WEATHER_TEXT)
    expect(getWeatherText(null)).toBe(UNKNOWN_WEATHER_TEXT)
    expect(getWeatherText(undefined)).toBe(UNKNOWN_WEATHER_TEXT)
    expect(getWeatherText(Number.NaN)).toBe(UNKNOWN_WEATHER_TEXT)
  })

  it('天气码映射到正确的图标分类', () => {
    expect(getWeatherIconKey(0)).toBe('clear')
    expect(getWeatherIconKey(2)).toBe('partly')
    expect(getWeatherIconKey(3)).toBe('cloudy')
    expect(getWeatherIconKey(45)).toBe('fog')
    expect(getWeatherIconKey(51)).toBe('drizzle')
    expect(getWeatherIconKey(65)).toBe('rain')
    expect(getWeatherIconKey(75)).toBe('snow')
    expect(getWeatherIconKey(96)).toBe('thunder')
    expect(getWeatherIconKey(undefined)).toBe('cloudy')
  })
})

describe('空气质量分级', () => {
  it('按 AQI 数值返回等级', () => {
    expect(getAqiLevel(30)?.text).toBe('优')
    expect(getAqiLevel(50)?.text).toBe('优')
    expect(getAqiLevel(51)?.text).toBe('良')
    expect(getAqiLevel(120)?.text).toBe('轻度污染')
    expect(getAqiLevel(180)?.text).toBe('中度污染')
    expect(getAqiLevel(260)?.text).toBe('重度污染')
    expect(getAqiLevel(400)?.text).toBe('严重污染')
  })

  it('缺失或非法数值返回 null', () => {
    expect(getAqiLevel(null)).toBeNull()
    expect(getAqiLevel(undefined)).toBeNull()
    expect(getAqiLevel(-1)).toBeNull()
    expect(getAqiLevel(Number.NaN)).toBeNull()
  })
})

describe('时间与日期格式化', () => {
  it('从 ISO 时间中取出时分', () => {
    expect(formatClock('2026-10-18T13:45')).toBe('13:45')
    expect(formatClock('2026-10-19T06:03')).toBe('06:03')
  })

  it('格式不对时返回空串', () => {
    expect(formatClock('')).toBe('')
    expect(formatClock('2026-10-18')).toBe('')
    expect(formatClock(null)).toBe('')
  })

  it('日期转星期', () => {
    // 2026-10-18 是星期日
    expect(formatWeekday('2026-10-18')).toBe('周日')
    expect(formatWeekday('2026-10-19')).toBe('周一')
    expect(formatWeekday('2026-10-24')).toBe('周六')
  })

  it('日期非法时原样返回，不崩溃', () => {
    expect(formatWeekday('abc')).toBe('abc')
    expect(formatWeekday(null)).toBe('')
  })

  it('第一天是今天时显示「今天」，其余显示星期', () => {
    expect(getDayLabels(['2026-10-18', '2026-10-19', '2026-10-20'], '2026-10-18')).toEqual(['今天', '周一', '周二'])
    expect(getDayLabels([], '2026-10-18')).toEqual([])
  })

  it('跨过午夜后缓存里的「昨天」不会被标成今天', () => {
    // 缓存数据首日是 10-18，但现在已经到了 10-19
    expect(getDayLabels(['2026-10-18', '2026-10-19'], '2026-10-19')).toEqual(['周日', '今天'])
  })

  it('本地日期字符串按本地时区生成（不会因 UTC 差一天）', () => {
    // 本地时间 23:30 时，toISOString 可能已经是次日，这里必须是当天
    expect(localDateString(new Date(2026, 9, 18, 23, 30))).toBe('2026-10-18')
    expect(localDateString(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })

  it('能在预报里找到「今天」的下标', () => {
    const dates = ['2026-10-18', '2026-10-19', '2026-10-20']
    expect(findTodayIndex(dates, '2026-10-18')).toBe(0)
    // 跨午夜后「今天」落到第二项，顶部卡片与列表仍指向同一天
    expect(findTodayIndex(dates, '2026-10-19')).toBe(1)
  })

  it('预报里没有今天时返回 -1（界面回退到第一项）', () => {
    expect(findTodayIndex(['2026-10-18'], '2026-10-25')).toBe(-1)
    expect(findTodayIndex([], '2026-10-25')).toBe(-1)
  })
})

describe('坐标文本', () => {
  it('保留两位小数', () => {
    expect(formatCoordinates(30.29365, 120.16142)).toBe('30.29, 120.16')
  })

  it('缺失时返回空串', () => {
    expect(formatCoordinates(null, 120)).toBe('')
    expect(formatCoordinates(30, undefined)).toBe('')
  })
})

describe('风向与紫外线', () => {
  it('角度换算成八方位', () => {
    expect(getWindDirection(0)).toBe('北')
    expect(getWindDirection(45)).toBe('东北')
    expect(getWindDirection(90)).toBe('东')
    expect(getWindDirection(180)).toBe('南')
    expect(getWindDirection(270)).toBe('西')
    // 359° 应归到「北」，不能算成第八档以外
    expect(getWindDirection(359)).toBe('北')
    expect(getWindDirection(-90)).toBe('西')
  })

  it('风向缺失时返回空串', () => {
    expect(getWindDirection(null)).toBe('')
    expect(getWindDirection(Number.NaN)).toBe('')
  })

  it('紫外线按 WHO 标准分级', () => {
    expect(getUvLevel(1)?.text).toBe('低')
    expect(getUvLevel(3)?.text).toBe('中等')
    expect(getUvLevel(6)?.text).toBe('高')
    expect(getUvLevel(9)?.text).toBe('很高')
    expect(getUvLevel(12)?.text).toBe('极高')
    expect(getUvLevel(null)).toBeNull()
  })
})
