import { InfoCircleOutlined, UndoOutlined } from '@ant-design/icons' // 导入重置图标和Info图标
import Selector from '@renderer/components/Selector'
import { allMinApps } from '@renderer/config/minapps'
import { useMinapps } from '@renderer/hooks/useMinapps'
import { useSettings } from '@renderer/hooks/useSettings'
import { SettingDescription, SettingDivider, SettingRowTitle, SettingTitle } from '@renderer/pages/settings'
import type { RootState } from '@renderer/store'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  setMaxKeepAliveMinapps,
  setMinAppRegion,
  setMinappsOpenLinkExternal,
  setShowOpenedMinappsInSidebar
} from '@renderer/store/settings'
import type { MinAppRegionFilter } from '@renderer/types'
import { Button, Flex, message, Slider, Switch, Tooltip } from 'antd'
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import MiniAppIconsManager from './MiniAppIconsManager'

// 默认小程序缓存数量
const DEFAULT_MAX_KEEPALIVE = 3

// Region selector component with defensive default value
const RegionSelector: FC = () => {
  const dispatch = useAppDispatch()
  const minAppRegion = useAppSelector((state: RootState) => state.settings.minAppRegion) ?? 'auto'

  const onMinAppRegionChange = (value: MinAppRegionFilter) => {
    dispatch(setMinAppRegion(value))
  }

  const minAppRegionOptions: { value: MinAppRegionFilter; label: string }[] = [
    { value: 'auto', label: '自动检测' },
    { value: 'CN', label: '中国' },
    { value: 'Global', label: '全球' }
  ]

  return <Selector size={14} value={minAppRegion} onChange={onMinAppRegionChange} options={minAppRegionOptions} />
}

const MiniAppSettings: FC = () => {
  const dispatch = useAppDispatch()
  const { maxKeepAliveMinapps, showOpenedMinappsInSidebar, minappsOpenLinkExternal } = useSettings()
  const { minapps, disabled, updateMinapps, updateDisabledMinapps } = useMinapps()

  const [visibleMiniApps, setVisibleMiniApps] = useState(minapps)
  const [disabledMiniApps, setDisabledMiniApps] = useState(disabled || [])
  const [messageApi, contextHolder] = message.useMessage()
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 当 store 数据变化时（例如切换地区）同步本地状态
  useEffect(() => {
    setVisibleMiniApps(minapps)
    setDisabledMiniApps(disabled || [])
  }, [minapps, disabled])

  const handleResetMinApps = useCallback(() => {
    // 仅重置为当前地区可见的应用，以避免混淆
    setVisibleMiniApps(minapps)
    setDisabledMiniApps([])
    updateMinapps(allMinApps)
    updateDisabledMinapps([])
  }, [minapps, updateDisabledMinapps, updateMinapps])

  const handleSwapMinApps = useCallback(() => {
    const temp = visibleMiniApps
    setVisibleMiniApps(disabledMiniApps)
    setDisabledMiniApps(temp)
  }, [disabledMiniApps, visibleMiniApps])

  // 恢复默认缓存数量
  const handleResetCacheLimit = useCallback(() => {
    dispatch(setMaxKeepAliveMinapps(DEFAULT_MAX_KEEPALIVE))
    messageApi.info('更改将在打开的小程序增减至设定值后生效')
  }, [dispatch, messageApi])

  // 处理缓存数量变更
  const handleCacheChange = useCallback(
    (value: number) => {
      dispatch(setMaxKeepAliveMinapps(value))

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(() => {
        messageApi.info('更改将在打开的小程序增减至设定值后生效')
        debounceTimerRef.current = null
      }, 500)
    },
    [dispatch, messageApi]
  )

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return (
    <Container>
      {contextHolder} {/* 添加消息上下文 */}
      <SettingTitle style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
        <ButtonWrapper>
          <Button onClick={handleSwapMinApps}>{'交换'}</Button>
          <Button onClick={handleResetMinApps}>{'重置'}</Button>
        </ButtonWrapper>
      </SettingTitle>
      <BorderedContainer>
        <MiniAppIconsManager
          visibleMiniApps={visibleMiniApps}
          disabledMiniApps={disabledMiniApps}
          setVisibleMiniApps={setVisibleMiniApps}
          setDisabledMiniApps={setDisabledMiniApps}
        />
      </BorderedContainer>
      <SettingDivider />
      {/* 小程序地区设置 */}
      <SettingRow style={{ height: 40, alignItems: 'center' }}>
        <Flex align="center" gap={4}>
          <SettingRowTitle>{'小程序区域筛选'}</SettingRowTitle>
          <Tooltip title={'根据所在地区过滤不支持的小程序'} placement="right">
            <InfoCircleOutlined style={{ cursor: 'pointer' }} />
          </Tooltip>
        </Flex>
        <RegionSelector />
      </SettingRow>
      <SettingDivider />
      <SettingRow style={{ height: 40, alignItems: 'center' }}>
        <SettingLabelGroup>
          <SettingRowTitle>{'在浏览器中打开新窗口链接'}</SettingRowTitle>
        </SettingLabelGroup>
        <Switch
          checked={minappsOpenLinkExternal}
          onChange={(checked) => dispatch(setMinappsOpenLinkExternal(checked))}
        />
      </SettingRow>
      <SettingDivider />
      {/* 缓存小程序数量设置 */}
      <SettingRow>
        <SettingLabelGroup>
          <SettingRowTitle>{'小程序缓存数量'}</SettingRowTitle>
          <SettingDescription>{'设置同时保持活跃状态的小程序最大数量'}</SettingDescription>
        </SettingLabelGroup>
        <CacheSettingControls>
          <SliderWithResetContainer>
            <Tooltip title={'重置为默认值'} placement="top">
              <ResetButton onClick={handleResetCacheLimit}>
                <UndoOutlined />
              </ResetButton>
            </Tooltip>
            <Slider
              min={1}
              max={10}
              value={maxKeepAliveMinapps}
              onChange={handleCacheChange}
              marks={{
                1: '1',
                5: '5',
                10: 'Max'
              }}
              tooltip={{ formatter: (value) => `${value}` }}
            />
          </SliderWithResetContainer>
        </CacheSettingControls>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingLabelGroup>
          <SettingRowTitle>{'侧边栏活跃小程序显示设置'}</SettingRowTitle>
          <SettingDescription>{'设置侧边栏是否显示活跃的小程序'}</SettingDescription>
        </SettingLabelGroup>
        <Switch
          checked={showOpenedMinappsInSidebar}
          onChange={(checked) => dispatch(setShowOpenedMinappsInSidebar(checked))}
        />
      </SettingRow>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-top: 10px;
`

// 修改和新增样式
const SettingRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin: 0;
  gap: 20px;
`

const SettingLabelGroup = styled.div`
  flex: 1;
`

// 新增控件容器，包含滑块和恢复默认按钮
const CacheSettingControls = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 240px;
`

const SliderWithResetContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;

  .ant-slider {
    flex: 1;
  }

  .ant-slider-track {
    background-color: var(--color-primary);
  }

  .ant-slider-handle {
    border-color: var(--color-primary);
  }
`

// 重置按钮样式
const ResetButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px; /* 确保不会被压缩 */
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-1);
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
  color: var(--color-text);

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  &:active {
    background-color: var(--color-bg-2);
  }
`

const ButtonWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`

// 新增: 带边框的容器组件
const BorderedContainer = styled.div`
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px;
  margin: 8px 0 8px;
  background-color: var(--color-bg-1);
`

export default MiniAppSettings
