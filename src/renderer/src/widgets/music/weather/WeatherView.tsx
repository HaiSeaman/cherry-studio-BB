import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  X
} from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'

import type { AirQualityData, WeatherBundle, WeatherLocation } from './api'
import { loadAirQuality, loadSavedLocation, loadWeather, locateByIp, saveLocation, searchCities } from './api'
import type { WeatherIconKey } from './weatherCodes'
import {
  findTodayIndex,
  formatClock,
  formatCoordinates,
  getAqiLevel,
  getDayLabels,
  getUvLevel,
  getWeatherIconKey,
  getWeatherText,
  getWindDirection
} from './weatherCodes'

/** 定位彻底失败时的默认城市，保证页面不会空着 */
const DEFAULT_LOCATION: WeatherLocation = {
  name: '北京',
  region: '北京市',
  country: '中国',
  latitude: 39.9075,
  longitude: 116.39723
}

/** 数字兜底：null/undefined 一律显示 --，避免出现 NaN */
function fmt(value: number | null | undefined, unit = '', digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return `${value.toFixed(digits)}${unit}`
}

/** 天气图标分类 → 图标；白天/夜晚的「晴」不同 */
const WeatherIcon: FC<{ iconKey: WeatherIconKey; isDay?: boolean; size?: number }> = ({
  iconKey,
  isDay = true,
  size = 30
}) => {
  const common = { size, strokeWidth: 1.6 }
  switch (iconKey) {
    case 'clear':
      return isDay ? <Sun {...common} className="wx-icon-sun" /> : <Moon {...common} className="wx-icon-night" />
    case 'partly':
      return <CloudSun {...common} className="wx-icon-sun" />
    case 'fog':
      return <CloudFog {...common} className="wx-icon-muted" />
    case 'drizzle':
      return <CloudDrizzle {...common} className="wx-icon-rain" />
    case 'rain':
      return <CloudRain {...common} className="wx-icon-rain" />
    case 'snow':
      return <Snowflake {...common} className="wx-icon-snow" />
    case 'thunder':
      return <CloudLightning {...common} className="wx-icon-storm" />
    default:
      return <Cloud {...common} className="wx-icon-muted" />
  }
}

/**
 * 天气视图（桌面助手第一个 tab）。
 * 与挂件其余视图一致：无 antd / 无 Redux，纯 React + CSS 变量；
 * 数据层见 ./api.ts（免费无 Key 的 Open-Meteo 系列接口 + IP 粗定位）。
 */
const WeatherView: FC = () => {
  const [location, setLocation] = useState<WeatherLocation | null>(null)
  const [weather, setWeather] = useState<WeatherBundle | null>(null)
  const [air, setAir] = useState<AirQualityData | null>(null)

  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherLocation[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // 快速切城市时，防止旧请求覆盖新城市
  const requestId = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const fetchWeather = useCallback(async (target: WeatherLocation, force = false): Promise<boolean | undefined> => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      // 空气质量是独立接口，失败不能影响主天气
      const [weatherData, airData] = await Promise.all([
        loadWeather(target, { force }),
        loadAirQuality(target).catch(() => null)
      ])
      if (!alive.current || id !== requestId.current) return undefined
      setWeather(weatherData)
      setAir(airData)
      return true
    } catch (err) {
      if (!alive.current || id !== requestId.current) return undefined
      setError(err instanceof Error ? err.message : '加载天气失败')
      return false
    } finally {
      if (alive.current && id === requestId.current) setLoading(false)
    }
  }, [])

  const applyLocation = useCallback(
    async (next: WeatherLocation, persist: boolean): Promise<boolean> => {
      const previous = location
      setLocation(next)
      setSearchOpen(false)
      setQuery('')
      setResults([])
      setSearching(false)
      setSearchError(null)
      // 用户已手动选好城市，之前的「定位失败」提示不该再显示
      setNotice(null)
      const ok = await fetchWeather(next)
      // 被更新的请求取代时 ok 为 undefined：既不改标题也不保存，交给后发请求处理
      if (ok === undefined) return true
      if (!ok) {
        // 请求失败：标题回滚到上一个城市，避免「标题写新城市、数据还是旧城市」
        if (previous) setLocation(previous)
        return false
      }
      // 只有真正取到数据才记住这个城市，失败的城市不该被持久化
      if (persist) void saveLocation(next)
      return true
    },
    [fetchWeather, location]
  )

  const locate = useCallback(async () => {
    setLocating(true)
    setNotice(null)
    try {
      const located = await applyLocation(await locateByIp(), true)
      // IP 定位拿到了坐标但天气请求失败：退回默认城市，别停在空白页
      if (!located) {
        const fallbackOk = await applyLocation(DEFAULT_LOCATION, false)
        setNotice(
          fallbackOk ? '自动定位后取天气失败，已显示默认城市，可点搜索手动选择' : '天气加载失败，请检查网络后点刷新重试'
        )
      }
    } catch {
      const fallbackOk = await applyLocation(DEFAULT_LOCATION, false)
      setNotice(
        fallbackOk
          ? '自动定位失败，已显示默认城市，可点搜索手动选择'
          : '自动定位和天气加载都失败了，请检查网络后点刷新重试'
      )
    } finally {
      if (alive.current) setLocating(false)
    }
  }, [applyLocation])

  // 首次进入：优先上次选的城市，没有就 IP 定位
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const saved = await loadSavedLocation()
      if (cancelled) return
      if (saved) {
        setLocation(saved)
        await fetchWeather(saved)
        return
      }
      await locate()
    })()
    return () => {
      cancelled = true
    }
    // 只在挂载时执行一次（locate/fetchWeather 都是稳定 useCallback）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 搜索防抖 400ms
  useEffect(() => {
    if (!searchOpen) {
      setSearching(false)
      setSearchError(null)
      return
    }
    const keyword = query.trim()
    if (!keyword) {
      setResults([])
      setSearchError(null)
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchCities(keyword)
        .then((cities) => {
          if (cancelled) return
          setResults(cities)
          setSearchError(cities.length === 0 ? '没有找到这个城市，换个写法试试' : null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setResults([])
          setSearchError(err instanceof Error ? err.message : '搜索失败')
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, searchOpen])

  // 接口 timezone=auto，current.time 是目标城市当地时间；用它定位「今天」那一行
  const locationToday = weather?.current.time ? weather.current.time.slice(0, 10) : undefined
  const todayIndex = weather
    ? findTodayIndex(
        weather.daily.map((d) => d.date),
        locationToday
      )
    : -1
  // 顶部卡片和 5 天列表必须用同一天，否则跨午夜时会出现「卡片是昨天、列表标今天是今天」
  const today = weather?.daily[todayIndex >= 0 ? todayIndex : 0]
  const dayLabels = weather
    ? getDayLabels(
        weather.daily.map((d) => d.date),
        locationToday
      )
    : []
  const uvLevel = getUvLevel(today?.uvIndexMax)
  const airLevel = air ? (air.level ?? getAqiLevel(air.aqi)) : null

  return (
    <div className="wx">
      <div className="wx-head">
        <span className="wx-place">
          <MapPin size={12} />
          <span className="wx-city">{location?.name ?? '定位中…'}</span>
          {location?.region && location.region !== location.name && (
            <span className="wx-region">{location.region}</span>
          )}
          {weather?.current.time && <span className="wx-updated">{formatClock(weather.current.time)}</span>}
        </span>
        <span className="wx-actions">
          <button type="button" title="切换城市" onClick={() => setSearchOpen((v) => !v)}>
            <Search size={13} />
          </button>
          <button
            type="button"
            title="刷新"
            disabled={!location || loading}
            onClick={() => location && void fetchWeather(location, true)}>
            <RefreshCw size={13} className={loading ? 'wx-spin' : ''} />
          </button>
        </span>
      </div>

      {searchOpen && (
        <div className="wx-search">
          <div className="wx-search-input">
            <Search size={12} />
            <input
              autoFocus
              value={query}
              placeholder="输入城市名，如 杭州"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setSearchOpen(false)
                }
              }}
            />
            <button type="button" title="关闭搜索" onClick={() => setSearchOpen(false)}>
              <X size={12} />
            </button>
          </div>
          <div className="wx-search-row">
            <button type="button" className="wx-link" disabled={locating} onClick={() => void locate()}>
              {locating ? '定位中…' : '使用当前位置'}
            </button>
            {searching && <span className="wx-hint">搜索中…</span>}
            {searchError && <span className="wx-hint">{searchError}</span>}
          </div>
          {results.length > 0 && (
            <div className="wx-results">
              {results.map((city, i) => (
                <button
                  key={`${city.latitude},${city.longitude},${i}`}
                  type="button"
                  className="wx-result"
                  onClick={() => void applyLocation(city, true)}>
                  <span>{city.name}</span>
                  <span className="wx-result-meta">{[city.region, city.country].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {notice && <div className="wx-notice">{notice}</div>}

      <div className="wx-body">
        {!weather && (loading || locating) && (
          <div className="wx-center">{loading ? '正在获取天气…' : '正在定位…'}</div>
        )}

        {!weather && !loading && !locating && error && (
          <div className="wx-center">
            <span>{error}</span>
            <button
              type="button"
              className="wx-link"
              onClick={() => (location ? void fetchWeather(location) : void locate())}>
              重试
            </button>
          </div>
        )}

        {weather && (
          <>
            {error && <div className="wx-error">{error}（显示的是上次的数据）</div>}

            <div className="wx-card">
              <div className="wx-top">
                <WeatherIcon
                  iconKey={getWeatherIconKey(weather.current.weatherCode)}
                  isDay={weather.current.isDay}
                  size={40}
                />
                <div className="wx-temp-block">
                  <span className="wx-temp">{fmt(weather.current.temperature, '°')}</span>
                  <span className="wx-feels">体感 {fmt(weather.current.apparentTemperature, '°')}</span>
                </div>
                <div className="wx-summary">
                  <span className="wx-desc">{getWeatherText(weather.current.weatherCode)}</span>
                  <span className="wx-sub">
                    {fmt(today?.tempMin, '°')} ~ {fmt(today?.tempMax, '°')}
                  </span>
                  {typeof today?.precipitationProbability === 'number' && (
                    <span className="wx-sub">降水 {fmt(today.precipitationProbability, '%')}</span>
                  )}
                </div>
              </div>

              <div className="wx-metrics">
                <span>湿度 {fmt(weather.current.humidity, '%')}</span>
                <span>
                  风 {getWindDirection(weather.current.windDirection)}
                  {fmt(weather.current.windSpeed, ' m/s', 1)}
                </span>
                <span>气压 {fmt(weather.current.pressure, ' hPa')}</span>
                <span>云量 {fmt(weather.current.cloudCover, '%')}</span>
                <span>阵风 {fmt(weather.current.windGust, ' m/s', 1)}</span>
                <span>降水 {fmt(weather.current.precipitation, ' mm', 1)}</span>
              </div>

              <div className="wx-sun">
                <span>
                  <Sunrise size={11} /> {today?.sunrise || '--'}
                </span>
                <span>
                  <Sunset size={11} /> {today?.sunset || '--'}
                </span>
                <span>
                  UV {fmt(today?.uvIndexMax, '', 1)}
                  {uvLevel && <b style={{ color: uvLevel.color }}>{uvLevel.text}</b>}
                </span>
              </div>
            </div>

            <div className="wx-section">未来 5 天</div>
            <div className="wx-daily">
              {weather.daily.map((day, i) => (
                <div className="wx-day" key={`${day.date}-${i}`}>
                  <span className="wx-day-name">{dayLabels[i]}</span>
                  <WeatherIcon iconKey={getWeatherIconKey(day.weatherCode)} size={15} />
                  <span className="wx-day-text">{getWeatherText(day.weatherCode)}</span>
                  <span className="wx-day-range">
                    {fmt(day.tempMin, '°')} ~ {fmt(day.tempMax, '°')}
                  </span>
                  <span className="wx-day-rain">
                    {typeof day.precipitationProbability === 'number'
                      ? `雨 ${fmt(day.precipitationProbability, '%')}`
                      : ''}
                  </span>
                </div>
              ))}
            </div>

            {air && (
              <>
                <div className="wx-section">空气质量</div>
                <div className="wx-air">
                  <span>PM2.5 {fmt(air.pm25, '', 1)}</span>
                  <span>PM10 {fmt(air.pm10, '', 1)}</span>
                  <span>AQI {fmt(air.aqi)}</span>
                  {airLevel && <b style={{ color: airLevel.color }}>{airLevel.text}</b>}
                </div>
              </>
            )}

            <div className="wx-foot">{formatCoordinates(location?.latitude, location?.longitude)}</div>
          </>
        )}
      </div>
    </div>
  )
}

export default WeatherView
