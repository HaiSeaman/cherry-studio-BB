import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  loadAirQuality,
  loadSavedLocation,
  loadWeather,
  locateByIp,
  normalizeAirQuality,
  normalizeCityResults,
  normalizeForecast,
  reverseGeocode,
  saveLocation,
  searchCities,
  type WeatherLocation
} from '../api'

const HANGZHOU: WeatherLocation = {
  name: '杭州',
  region: '浙江',
  country: '中国',
  latitude: 30.29365,
  longitude: 120.16142
}

/** 复刻实测到的 Open-Meteo 返回结构（字段有删减，顺序一致） */
const FORECAST_RAW = {
  latitude: 30.26,
  longitude: 120.14,
  timezone: 'Asia/Shanghai',
  current: {
    time: '2026-10-18T15:00',
    temperature_2m: 29.3,
    relative_humidity_2m: 63,
    apparent_temperature: 32.1,
    is_day: 1,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 3.63,
    wind_direction_10m: 12,
    wind_gusts_10m: 8.5,
    cloud_cover: 32,
    pressure_msl: 1015.1
  },
  daily: {
    time: ['2026-10-18', '2026-10-19'],
    weather_code: [51, 3],
    temperature_2m_max: [30.7, 26.2],
    temperature_2m_min: [21.1, 20.4],
    apparent_temperature_max: [33.2, 27.5],
    apparent_temperature_min: [22.3, 21.1],
    sunrise: ['2026-10-18T06:03', '2026-10-19T06:04'],
    sunset: ['2026-10-18T17:25', '2026-10-19T17:24'],
    uv_index_max: [5.3, 6],
    precipitation_sum: [0, 2.4],
    precipitation_probability_max: [60, 0],
    wind_speed_10m_max: [4.1, 3.2]
  }
}

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const spy = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('normalizeForecast', () => {
  it('把接口原始数据转成内部结构', () => {
    const { current, daily } = normalizeForecast(FORECAST_RAW)

    expect(current.temperature).toBe(29.3)
    expect(current.apparentTemperature).toBe(32.1)
    expect(current.humidity).toBe(63)
    expect(current.weatherCode).toBe(1)
    expect(current.isDay).toBe(true)
    expect(current.windSpeed).toBe(3.63)
    expect(current.pressure).toBe(1015.1)

    expect(daily).toHaveLength(2)
    expect(daily[0]).toMatchObject({
      date: '2026-10-18',
      tempMax: 30.7,
      tempMin: 21.1,
      uvIndexMax: 5.3,
      precipitationProbability: 60
    })
    // 日出日落只保留时分，界面直接显示
    expect(daily[0].sunrise).toBe('06:03')
    expect(daily[1].sunset).toBe('17:24')
  })

  it('夜间的 is_day=0 识别为夜晚', () => {
    const raw = { ...FORECAST_RAW, current: { ...FORECAST_RAW.current, is_day: 0 } }
    expect(normalizeForecast(raw).current.isDay).toBe(false)
  })

  it('字段缺失时返回 null，不抛错', () => {
    const raw = {
      current: { time: '2026-10-18T15:00' },
      daily: { time: ['2026-10-18'] }
    }
    const { current, daily } = normalizeForecast(raw)

    expect(current.temperature).toBeNull()
    expect(current.humidity).toBeNull()
    expect(daily[0].tempMax).toBeNull()
    expect(daily[0].sunrise).toBe('')
  })

  it('每日数据比日期短时，多余日期补 null 而不是崩溃', () => {
    const raw = {
      current: {},
      daily: { time: ['2026-10-18', '2026-10-19'], weather_code: [1] }
    }
    const { daily } = normalizeForecast(raw)

    expect(daily).toHaveLength(2)
    expect(daily[0].weatherCode).toBe(1)
    expect(daily[1].weatherCode).toBeNull()
  })

  it('完全不是天气数据时抛错，让界面显示重试', () => {
    expect(() => normalizeForecast({})).toThrow('天气数据格式异常')
    expect(() => normalizeForecast(null)).toThrow('天气数据格式异常')
    expect(() => normalizeForecast('oops')).toThrow('天气数据格式异常')
  })
})

describe('normalizeAirQuality', () => {
  it('正常返回三项数值并算出等级', () => {
    const result = normalizeAirQuality({ current: { pm2_5: 23.2, pm10: 23.9, us_aqi: 95 } })

    expect(result).toMatchObject({ pm25: 23.2, pm10: 23.9, aqi: 95 })
    expect(result?.level?.text).toBe('良')
  })

  it('三项都缺失时返回 null（界面隐藏该行）', () => {
    expect(normalizeAirQuality({ current: {} })).toBeNull()
    expect(normalizeAirQuality({})).toBeNull()
    expect(normalizeAirQuality(null)).toBeNull()
  })

  it('只有部分字段时仍返回，缺失项为 null', () => {
    const result = normalizeAirQuality({ current: { pm2_5: 12 } })

    expect(result?.pm25).toBe(12)
    expect(result?.aqi).toBeNull()
    expect(result?.level).toBeNull()
  })
})

describe('normalizeCityResults', () => {
  it('解析搜索结果并保留省份用于区分同名城市', () => {
    const raw = {
      results: [
        {
          name: '杭州',
          admin1: '浙江',
          country: '中国',
          latitude: 30.29365,
          longitude: 120.16142
        },
        { name: '杭州', admin1: '四川', country: '中国', latitude: 30.06517, longitude: 102.19527 }
      ]
    }

    const cities = normalizeCityResults(raw)
    expect(cities).toHaveLength(2)
    expect(cities[0]).toMatchObject({ name: '杭州', region: '浙江', country: '中国' })
    expect(cities[1].region).toBe('四川')
  })

  it('无结果时返回空数组（接口此时只返回 generationtime_ms）', () => {
    expect(normalizeCityResults({ generationtime_ms: 0.08 })).toEqual([])
    expect(normalizeCityResults(null)).toEqual([])
  })

  it('缺少坐标或名称的条目被丢弃', () => {
    const raw = {
      results: [
        { name: '有效城市', latitude: 1, longitude: 2 },
        { name: '', latitude: 1, longitude: 2 },
        { name: '没有坐标' }
      ]
    }

    expect(normalizeCityResults(raw)).toHaveLength(1)
  })
})

describe('loadWeather', () => {
  it('请求成功后返回带地点的数据', async () => {
    const spy = mockFetchOnce(FORECAST_RAW)

    const result = await loadWeather(HANGZHOU)

    expect(result.location.name).toBe('杭州')
    expect(result.current.temperature).toBe(29.3)
    expect(spy).toHaveBeenCalledOnce()

    const url = String(spy.mock.calls[0][0])
    expect(url).toContain('latitude=30.29365')
    expect(url).toContain('forecast_days=5')
    expect(url).toContain('timezone=auto')
    // 风速用米/秒，界面就不需要再换算
    expect(url).toContain('wind_speed_unit=ms')
  })

  it('30 分钟内重复请求走缓存，不再发网络请求', async () => {
    const spy = mockFetchOnce(FORECAST_RAW)

    // 用独立坐标，避免命中其他用例留下的缓存
    const location: WeatherLocation = { ...HANGZHOU, latitude: 55.55, longitude: 55.55 }
    await loadWeather(location)
    await loadWeather(location)

    expect(spy).toHaveBeenCalledOnce()
  })

  it('force=true 时忽略缓存', async () => {
    const spy = mockFetchOnce(FORECAST_RAW)

    const location: WeatherLocation = { ...HANGZHOU, latitude: 66.66, longitude: 66.66 }
    await loadWeather(location)
    await loadWeather(location, { force: true })

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('HTTP 错误转成中文提示', async () => {
    mockFetchOnce({}, { ok: false, status: 400 })

    await expect(loadWeather({ ...HANGZHOU, latitude: 11.11 })).rejects.toThrow('服务器返回错误（HTTP 400）')
  })

  it('超时会中止请求并提示', async () => {
    vi.useFakeTimers()
    try {
      // 永远不 resolve 的请求，必须靠超时中止
      const spy = vi.fn((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })
      vi.stubGlobal('fetch', spy)

      const pending = loadWeather({ ...HANGZHOU, latitude: 22.22 })
      const assertion = expect(pending).rejects.toThrow('请求超时，请检查网络后重试')
      await vi.advanceTimersByTimeAsync(8000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('loadAirQuality', () => {
  it('请求失败会向上抛出，由界面决定隐藏', async () => {
    mockFetchOnce({}, { ok: false, status: 500 })

    await expect(loadAirQuality({ ...HANGZHOU, latitude: 33.33 })).rejects.toThrow('服务器返回错误（HTTP 500）')
  })

  it('请求成功返回带等级的空气质量', async () => {
    mockFetchOnce({ current: { pm2_5: 10, pm10: 20, us_aqi: 30 } })

    const result = await loadAirQuality({ ...HANGZHOU, latitude: 44.44 })
    expect(result?.level?.text).toBe('优')
  })
})

describe('城市搜索与定位', () => {
  it('空关键字不发请求', async () => {
    const spy = mockFetchOnce({})

    expect(await searchCities('   ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('搜索时请求中文结果', async () => {
    const spy = mockFetchOnce({ results: [{ name: '北京', latitude: 39.9, longitude: 116.4 }] })

    const cities = await searchCities('北京')
    expect(cities[0].name).toBe('北京')

    const url = String(spy.mock.calls[0][0])
    expect(url).toContain('language=zh')
    expect(url).toContain('name=%E5%8C%97%E4%BA%AC')
  })

  it('IP 定位优先使用反查到的中文名', async () => {
    const spy = vi
      .fn()
      // 第一次：ipwho.is
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          country: 'China',
          region: 'Guangxi Zhuangzu Zizhiqu',
          city: 'Nanning',
          latitude: 22.8167,
          longitude: 108.3167
        })
      })
      // 第二次：BigDataCloud 反查中文
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ city: '南寧市', locality: '兴宁区', principalSubdivision: '广西壮族自治区' })
      })
    vi.stubGlobal('fetch', spy)

    const location = await locateByIp()

    expect(location.name).toBe('南寧市')
    expect(location.region).toBe('广西壮族自治区')
  })

  it('IP 定位时反查失败，退回 IP 结果的城市名', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, city: 'Nanning', latitude: 22.8167, longitude: 108.3167 })
      })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', spy)

    const location = await locateByIp()
    expect(location.name).toBe('Nanning')
  })

  it('IP 定位接口明确返回失败时抛错', async () => {
    mockFetchOnce({ success: false, message: 'reserved range' })

    await expect(locateByIp()).rejects.toThrow('reserved range')
  })

  it('反查地名失败返回 null，而不是抛错', async () => {
    mockFetchOnce({ lookupSource: 'coordinates' })
    expect(await reverseGeocode(1, 2)).toBeNull()
  })
})

describe('城市记忆', () => {
  it('保存后能读回同一个地点', async () => {
    let stored: unknown = null
    vi.stubGlobal('window', {
      api: {
        config: {
          get: async () => stored,
          set: async (_key: string, value: unknown) => {
            stored = value
          }
        }
      }
    })

    await saveLocation(HANGZHOU)
    const loaded = await loadSavedLocation()

    expect(loaded).toMatchObject({ name: '杭州', latitude: 30.29365, longitude: 120.16142 })
  })

  it('没有保存过时返回 null', async () => {
    vi.stubGlobal('window', { api: { config: { get: async () => undefined } } })
    expect(await loadSavedLocation()).toBeNull()
  })

  it('保存的数据残缺时返回 null，不把坏数据当地点用', async () => {
    vi.stubGlobal('window', { api: { config: { get: async () => ({ name: '坏数据' }) } } })
    expect(await loadSavedLocation()).toBeNull()
  })

  it('配置读取异常时返回 null，不阻塞界面', async () => {
    vi.stubGlobal('window', {
      api: {
        config: {
          get: async () => {
            throw new Error('ipc failed')
          }
        }
      }
    })
    expect(await loadSavedLocation()).toBeNull()
  })
})
