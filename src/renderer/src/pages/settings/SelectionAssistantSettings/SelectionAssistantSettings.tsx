import { isLinux, isMac, isWin } from '@renderer/config/constant'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSelectionAssistant } from '@renderer/hooks/useSelectionAssistant'
import { getSelectionDescriptionLabel } from '@renderer/i18n/label'
import type { FilterMode, TriggerMode } from '@renderer/types/selectionTypes'
import SelectionToolbar from '@renderer/windows/selection/toolbar/SelectionToolbar'
import { Button, Radio, Row, Slider, Switch, Tooltip } from 'antd'
import { CircleCheck, CircleHelp, CircleX, Edit2, TriangleAlert } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'

import {
  SettingContainer,
  SettingDescription,
  SettingDivider,
  SettingGroup,
  SettingRow,
  SettingRowTitle,
  SettingTitle
} from '..'
import MacProcessTrustHintModal from './components/MacProcessTrustHintModal'
import SelectionActionsList from './components/SelectionActionsList'
import SelectionFilterListModal from './components/SelectionFilterListModal'

const SelectionAssistantSettings: FC = () => {
  const { theme } = useTheme()
  const {
    selectionEnabled,
    triggerMode,
    isCompact,
    isAutoClose,
    isAutoPin,
    isFollowToolbar,
    isRemeberWinSize,
    actionItems,
    actionWindowOpacity,
    filterMode,
    filterList,
    setSelectionEnabled,
    setTriggerMode,
    setIsCompact,
    setIsAutoClose,
    setIsAutoPin,
    setIsFollowToolbar,
    setIsRemeberWinSize,
    setActionWindowOpacity,
    setActionItems,
    setFilterMode,
    setFilterList
  } = useSelectionAssistant()

  const isSupportedOS = isWin || isMac || isLinux

  const [isFilterListModalOpen, setIsFilterListModalOpen] = useState(false)
  const [isMacTrustModalOpen, setIsMacTrustModalOpen] = useState(false)
  const [opacityValue, setOpacityValue] = useState(actionWindowOpacity)
  const [linuxEnvInfo, setLinuxEnvInfo] = useState<{
    isLinuxWaylandDisplay: boolean
    isLinuxXWaylandMode: boolean
    hasLinuxInputDeviceAccess: boolean
    isLinuxCompositorCompatible: boolean
  } | null>(null)

  // force disable selection assistant on non-windows systems
  useEffect(() => {
    const checkMacProcessTrust = async () => {
      const isTrusted = await window.api.mac.isProcessTrusted()
      if (!isTrusted) {
        setSelectionEnabled(false)
      }
    }

    if (!isSupportedOS && selectionEnabled) {
      setSelectionEnabled(false)
      return
    } else if (isMac && selectionEnabled) {
      void checkMacProcessTrust()
    }
  }, [isSupportedOS, selectionEnabled, setSelectionEnabled])

  useEffect(() => {
    if (isLinux) {
      void window.api.selection.getLinuxEnvInfo().then(setLinuxEnvInfo)
    }
  }, [])

  const handleEnableCheckboxChange = async (checked: boolean) => {
    if (!isSupportedOS) return

    if (isMac && checked) {
      const isTrusted = await window.api.mac.isProcessTrusted()
      if (!isTrusted) {
        setIsMacTrustModalOpen(true)
        return
      }
    }

    setSelectionEnabled(checked)
  }

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <Row align="middle">
          <SettingTitle>{'划词助手'}</SettingTitle>
          <Spacer />
          {isMac && <ExperimentalText>{'实验性功能'}</ExperimentalText>}
        </Row>
        <SettingDivider />
        <SettingRow>
          <SettingLabel>
            <SettingRowTitle>{'启用'}</SettingRowTitle>
            {!isSupportedOS && <SettingDescription>{'当前仅支持 Windows & macOS'}</SettingDescription>}
          </SettingLabel>
          <Switch
            checked={isSupportedOS && selectionEnabled}
            onChange={(checked) => handleEnableCheckboxChange(checked)}
            disabled={!isSupportedOS}
          />
        </SettingRow>

        {!selectionEnabled && (
          <DemoContainer>
            <SelectionToolbar demo />
          </DemoContainer>
        )}

        {selectionEnabled && isLinux && linuxEnvInfo?.isLinuxWaylandDisplay && (
          <>
            <SettingDivider />
            <SettingLabel>
              <SettingRowTitle>
                <TriangleAlert size={14} style={{ marginRight: 4, color: 'var(--color-error)' }} />
                {'Wayland 模式提示'}
              </SettingRowTitle>
              {linuxEnvInfo.isLinuxCompositorCompatible ? (
                <>
                  <SettingDescription>
                    {
                      '当前为 Wayland 模式，受系统限制，部分桌面环境下工具栏只能显示在屏幕中央，无法跟随选中文本定位。建议切换到 X11 模式以获得完整体验。'
                    }
                  </SettingDescription>
                  <SettingDescription style={{ marginTop: 6 }}>
                    {'确认以下条件已满足，以尽可能优化 Wayland 下的体验：'}
                  </SettingDescription>
                  <ChecklistItem style={{ marginTop: 6 }}>
                    {linuxEnvInfo.isLinuxXWaylandMode ? (
                      <CircleCheck
                        size={13}
                        style={{ color: 'var(--color-status-success)', marginRight: 6, flexShrink: 0 }}
                      />
                    ) : (
                      <CircleX
                        size={13}
                        style={{ color: 'var(--color-status-error)', marginRight: 6, flexShrink: 0 }}
                      />
                    )}
                    <span>
                      {'XWayland 模式：'}
                      {linuxEnvInfo.isLinuxXWaylandMode
                        ? '已启用'
                        : '未启用，请使用 `--ozone-platform=x11` 参数启动 Cherry Studio'}
                    </span>
                  </ChecklistItem>
                  <ChecklistItem>
                    {linuxEnvInfo.hasLinuxInputDeviceAccess ? (
                      <CircleCheck
                        size={13}
                        style={{ color: 'var(--color-status-success)', marginRight: 6, flexShrink: 0 }}
                      />
                    ) : (
                      <CircleX
                        size={13}
                        style={{ color: 'var(--color-status-error)', marginRight: 6, flexShrink: 0 }}
                      />
                    )}
                    <span>
                      {'input 组权限：'}
                      {linuxEnvInfo.hasLinuxInputDeviceAccess
                        ? '已获取'
                        : '未获取，请执行 `sudo usermod -aG input $USER` 并重新登录生效'}
                    </span>
                  </ChecklistItem>
                </>
              ) : (
                <SettingDescription>
                  {'当前桌面环境不支持划词功能，请切换到 X11 模式以获得完整体验。'}
                </SettingDescription>
              )}
            </SettingLabel>
          </>
        )}
      </SettingGroup>

      {selectionEnabled && (
        <>
          <SettingGroup theme={theme}>
            <SettingTitle>{'工具栏'}</SettingTitle>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>
                  <div style={{ marginRight: '4px' }}>{'取词方式'}</div>
                  <Tooltip
                    placement="top"
                    title={getSelectionDescriptionLabel(isWin ? 'windows' : isLinux ? 'linux' : 'mac')}
                    arrow>
                    <QuestionIcon size={14} />
                  </Tooltip>
                </SettingRowTitle>
                <SettingDescription>{'划词后，触发取词并显示工具栏的方式'}</SettingDescription>
              </SettingLabel>
              <Radio.Group
                value={triggerMode}
                onChange={(e) => setTriggerMode(e.target.value as TriggerMode)}
                buttonStyle="solid">
                <Tooltip placement="top" title={'划词后立即显示工具栏'} arrow>
                  <Radio.Button value="selected">{'划词'}</Radio.Button>
                </Tooltip>
                {isWin && (
                  <Tooltip placement="top" title={'划词后，再 长按 Ctrl 键，才显示工具栏'} arrow>
                    <Radio.Button value="ctrlkey">{'Ctrl 键'}</Radio.Button>
                  </Tooltip>
                )}
                <Tooltip
                  placement="topRight"
                  title={
                    <div>
                      {'划词后，使用快捷键显示工具栏。请在快捷键设置页面中设置取词快捷键并启用。'}
                      <Link to="/settings/shortcut" style={{ color: 'var(--color-primary)' }}>
                        {'前往快捷键设置'}
                      </Link>
                    </div>
                  }
                  arrow>
                  <Radio.Button value="shortcut">{'快捷键'}</Radio.Button>
                </Tooltip>
              </Radio.Group>
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>{'紧凑模式'}</SettingRowTitle>
                <SettingDescription>{'紧凑模式下，只显示图标，不显示文字'}</SettingDescription>
              </SettingLabel>
              <Switch checked={isCompact} onChange={(checked) => setIsCompact(checked)} />
            </SettingRow>
          </SettingGroup>

          <SettingGroup theme={theme}>
            <SettingTitle>{'功能窗口'}</SettingTitle>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>{'跟随工具栏'}</SettingRowTitle>
                <SettingDescription>{'窗口位置将跟随工具栏显示，禁用后则始终居中显示'}</SettingDescription>
              </SettingLabel>
              <Switch checked={isFollowToolbar} onChange={(checked) => setIsFollowToolbar(checked)} />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>{'记住大小'}</SettingRowTitle>
                <SettingDescription>{'应用运行期间，窗口会按上次调整的大小显示'}</SettingDescription>
              </SettingLabel>
              <Switch checked={isRemeberWinSize} onChange={(checked) => setIsRemeberWinSize(checked)} />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>{'自动关闭'}</SettingRowTitle>
                <SettingDescription>{'当窗口未置顶且失去焦点时，将自动关闭该窗口'}</SettingDescription>
              </SettingLabel>
              <Switch checked={isAutoClose} onChange={(checked) => setIsAutoClose(checked)} />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>{'自动置顶'}</SettingRowTitle>
                <SettingDescription>{'默认将窗口置于顶部'}</SettingDescription>
              </SettingLabel>
              <Switch checked={isAutoPin} onChange={(checked) => setIsAutoPin(checked)} />
            </SettingRow>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>{'透明度'}</SettingRowTitle>
                <SettingDescription>{'设置窗口的默认透明度，100% 为完全不透明'}</SettingDescription>
              </SettingLabel>
              <div style={{ marginRight: '16px' }}>{opacityValue}%</div>
              <Slider
                style={{ width: 100 }}
                min={20}
                max={100}
                reverse
                value={opacityValue}
                onChange={setOpacityValue}
                onChangeComplete={setActionWindowOpacity}
                tooltip={{ open: false }}
              />
            </SettingRow>
          </SettingGroup>

          <SelectionActionsList actionItems={actionItems} setActionItems={setActionItems} />

          <SettingGroup theme={theme}>
            <SettingTitle>{'高级'}</SettingTitle>
            <SettingDivider />
            <SettingRow>
              <SettingLabel>
                <SettingRowTitle>
                  {'应用筛选'}
                  {isLinux && linuxEnvInfo?.isLinuxWaylandDisplay && (
                    <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center' }}>
                      （<TriangleAlert size={13} style={{ margin: '0 3px', color: 'var(--color-error)' }} />
                      {'Wayland 模式下不生效'}）
                    </span>
                  )}
                </SettingRowTitle>
                <SettingDescription>
                  {'可以限制划词助手只在特定应用中生效（白名单）或不生效（黑名单）'}
                </SettingDescription>
              </SettingLabel>
              <Radio.Group
                value={filterMode ?? 'default'}
                onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                buttonStyle="solid">
                <Radio.Button value="default">{'关闭'}</Radio.Button>
                <Radio.Button value="whitelist">{'白名单'}</Radio.Button>
                <Radio.Button value="blacklist">{'黑名单'}</Radio.Button>
              </Radio.Group>
            </SettingRow>

            {filterMode && filterMode !== 'default' && (
              <>
                <SettingDivider />
                <SettingRow>
                  <SettingLabel>
                    <SettingRowTitle>{'筛选名单'}</SettingRowTitle>
                    <SettingDescription>{'高级功能，建议有经验的用户在了解的情况下再进行设置'}</SettingDescription>
                  </SettingLabel>
                  <Button icon={<Edit2 size={14} />} onClick={() => setIsFilterListModalOpen(true)}>
                    {'编辑'}
                  </Button>
                </SettingRow>
                <SelectionFilterListModal
                  open={isFilterListModalOpen}
                  onClose={() => setIsFilterListModalOpen(false)}
                  filterList={filterList}
                  onSave={setFilterList}
                />
              </>
            )}
          </SettingGroup>
        </>
      )}

      {isMac && <MacProcessTrustHintModal open={isMacTrustModalOpen} onClose={() => setIsMacTrustModalOpen(false)} />}
    </SettingContainer>
  )
}

const Spacer = styled.div`
  flex: 1;
`
const SettingLabel = styled.div`
  flex: 1;
`

const ExperimentalText = styled.div`
  color: var(--color-text-3);
  font-size: 12px;
`

const DemoContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 15px;
  margin-bottom: 5px;
`

const QuestionIcon = styled(CircleHelp)`
  cursor: pointer;
  color: var(--color-text-3);
`

const ChecklistItem = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 2px;
  font-size: 12px;
  color: var(--color-text-3);
`

export default SelectionAssistantSettings
