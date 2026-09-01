export enum IpcChannel {
  App_GetCacheSize = 'app:get-cache-size',
  App_ClearCache = 'app:clear-cache',
  App_SetLaunchOnBoot = 'app:set-launch-on-boot',
  App_SetLanguage = 'app:set-language',
  App_SetEnableSpellCheck = 'app:set-enable-spell-check',
  App_SetSpellCheckLanguages = 'app:set-spell-check-languages',
  App_Reload = 'app:reload',
  App_Quit = 'app:quit',
  App_Info = 'app:info',
  App_Proxy = 'app:proxy',
  App_SetLaunchToTray = 'app:set-launch-to-tray',
  App_SetTray = 'app:set-tray',
  App_SetTrayOnClose = 'app:set-tray-on-close',
  App_SetTheme = 'app:set-theme',
  App_HandleZoomFactor = 'app:handle-zoom-factor',
  App_Select = 'app:select',
  App_HasWritePermission = 'app:has-write-permission',
  App_ResolvePath = 'app:resolve-path',
  App_IsPathInside = 'app:is-path-inside',
  App_Copy = 'app:copy',
  App_SetStopQuitApp = 'app:set-stop-quit-app',
  App_SetAppDataPath = 'app:set-app-data-path',
  App_GetDataPathFromArgs = 'app:get-data-path-from-args',
  App_FlushAppData = 'app:flush-app-data',
  App_IsNotEmptyDir = 'app:is-not-empty-dir',
  App_RelaunchApp = 'app:relaunch-app',
  App_ResetData = 'app:reset-data',
  App_IsBinaryExist = 'app:is-binary-exist',
  App_InstallUvBinary = 'app:install-uv-binary',
  App_InstallBunBinary = 'app:install-bun-binary',
  App_LogToMain = 'app:log-to-main',
  App_SaveData = 'app:save-data',
  App_GetDiskInfo = 'app:get-disk-info',
  App_SetFullScreen = 'app:set-full-screen',
  App_IsFullScreen = 'app:is-full-screen',
  App_GetSystemFonts = 'app:get-system-fonts',
  App_GetIpCountry = 'app:get-ip-country',

  App_MacIsProcessTrusted = 'app:mac-is-process-trusted',
  App_MacRequestProcessTrust = 'app:mac-request-process-trust',

  App_QuoteToMain = 'app:quote-to-main',
  App_SetDisableHardwareAcceleration = 'app:set-disable-hardware-acceleration',
  App_SetUseSystemTitleBar = 'app:set-use-system-title-bar',

  Notification_Send = 'notification:send',

  Webview_SetOpenLinkExternal = 'webview:set-open-link-external',
  Webview_SetSpellCheckEnabled = 'webview:set-spell-check-enabled',
  Webview_SearchHotkey = 'webview:search-hotkey',
  Webview_PrintToPDF = 'webview:print-to-pdf',
  Webview_SaveAsHTML = 'webview:save-as-html',
  Webview_Close = 'webview:close',
  Webview_IsAudible = 'webview:is-audible',

  // Open
  Open_Path = 'open:path',
  Open_Website = 'open:website',

  Config_Set = 'config:set',
  Config_Get = 'config:get',

  MiniWindow_Hide = 'miniwindow:hide',
  MiniWindow_Close = 'miniwindow:close',
  MiniWindow_SetPin = 'miniwindow:set-pin',
  MiniWindow_ConsumeScreenshot = 'miniwindow:consume-screenshot',
  MiniWindow_ReadClipboardImage = 'miniwindow:read-clipboard-image',

  // 桌面音乐挂件（Music Widget / 桌面助手四合一挂件）
  MusicWidget_Show = 'music-widget:show',
  MusicWidget_Close = 'music-widget:close',
  MusicWidget_Toggle = 'music-widget:toggle',
  MusicWidget_SetPin = 'music-widget:set-pin',
  MusicWidget_SetLock = 'music-widget:set-lock',
  MusicWidget_SetSize = 'music-widget:set-size',
  MusicWidget_IsVisible = 'music-widget:is-visible',
  MusicWidget_OpenMain = 'music-widget:open-main',
  // 挂件 ↔ 主窗口消息桥（主进程中转，替代 BroadcastChannel）
  MusicWidget_MsgFromWidget = 'music-widget:msg-from-widget',
  MusicWidget_MsgToWidget = 'music-widget:msg-to-widget',
  MusicWidget_OnMsg = 'music-widget:on-msg',
  // 主题 token 广播：主窗口渲染层 → 主进程 → 两个挂件（跟随主程序配色）
  Theme_FromRenderer = 'theme:from-renderer',
  Theme_ToWidget = 'theme:to-widget',
  Theme_RequestPush = 'theme:request-push',

  // Mcp
  Mcp_AddServer = 'mcp:add-server',
  Mcp_RemoveServer = 'mcp:remove-server',
  Mcp_RestartServer = 'mcp:restart-server',
  Mcp_StopServer = 'mcp:stop-server',
  Mcp_ListTools = 'mcp:list-tools',
  Mcp_CallTool = 'mcp:call-tool',
  Mcp_ListPrompts = 'mcp:list-prompts',
  Mcp_GetPrompt = 'mcp:get-prompt',
  Mcp_ListResources = 'mcp:list-resources',
  Mcp_GetResource = 'mcp:get-resource',
  Mcp_GetInstallInfo = 'mcp:get-install-info',
  Mcp_ServersChanged = 'mcp:servers-changed',
  Mcp_CheckConnectivity = 'mcp:check-connectivity',
  Mcp_UploadDxt = 'mcp:upload-dxt',
  Mcp_AbortTool = 'mcp:abort-tool',
  Mcp_ResolveHubTool = 'mcp:resolve-hub-tool',
  Mcp_GetServerVersion = 'mcp:get-server-version',
  Mcp_Progress = 'mcp:progress',
  Mcp_GetServerLogs = 'mcp:get-server-logs',
  Mcp_ServerLog = 'mcp:server-log',
  // obsidian
  Obsidian_GetVaults = 'obsidian:get-vaults',
  Obsidian_GetFiles = 'obsidian:get-files',

  //aes
  Aes_Decrypt = 'aes:decrypt',

  Windows_ResetMinimumSize = 'window:reset-minimum-size',
  Windows_SetMinimumSize = 'window:set-minimum-size',
  Windows_GetSize = 'window:get-size',
  Windows_Focus = 'window:focus',
  Windows_Minimize = 'window:minimize',
  Windows_Maximize = 'window:maximize',
  Windows_Unmaximize = 'window:unmaximize',
  Windows_Close = 'window:close',
  Windows_IsMaximized = 'window:is-maximized',
  Windows_MaximizedChanged = 'window:maximized-changed',
  Windows_NavigateToAbout = 'window:navigate-to-about',

  //file
  File_Open = 'file:open',
  File_OpenPath = 'file:openPath',
  File_Save = 'file:save',
  File_Select = 'file:select',
  File_Upload = 'file:upload',
  File_Clear = 'file:clear',
  File_Read = 'file:read',
  File_ReadExternal = 'file:readExternal',
  File_Delete = 'file:delete',
  File_DeleteDir = 'file:deleteDir',
  File_DeleteExternalFile = 'file:deleteExternalFile',
  File_DeleteExternalDir = 'file:deleteExternalDir',
  File_Move = 'file:move',
  File_MoveDir = 'file:moveDir',
  File_Rename = 'file:rename',
  File_RenameDir = 'file:renameDir',
  File_Get = 'file:get',
  File_SelectFolder = 'file:selectFolder',
  File_CreateTempFile = 'file:createTempFile',
  File_Mkdir = 'file:mkdir',
  File_Write = 'file:write',
  File_WriteWithId = 'file:writeWithId',
  File_SaveImage = 'file:saveImage',
  File_SaveFileAs = 'file:saveFileAs',
  File_Base64Image = 'file:base64Image',
  File_SaveBase64Image = 'file:saveBase64Image',
  File_SaveImageToDirectory = 'file:saveImageToDirectory',
  File_SaveFileToDirectory = 'file:saveFileToDirectory',
  File_Download = 'file:download',
  File_BinaryImage = 'file:binaryImage',
  File_Base64File = 'file:base64File',
  Fs_Read = 'fs:read',
  Fs_ReadText = 'fs:readText',
  Fs_ScanDir = 'fs:scanDir',
  File_OpenWithRelativePath = 'file:openWithRelativePath',
  File_IsTextFile = 'file:isTextFile',
  File_IsDirectory = 'file:isDirectory',
  File_ListDirectory = 'file:listDirectory',
  File_CheckFileName = 'file:checkFileName',
  File_StartWatcher = 'file:startWatcher',
  File_StopWatcher = 'file:stopWatcher',
  File_ShowInFolder = 'file:showInFolder',

  // PDF
  Pdf_ExtractText = 'pdf:extractText',

  // Automation（AI 自动化定时任务）
  Automation_GetTasks = 'automation:get-tasks',
  Automation_SaveTask = 'automation:save-task',
  Automation_DeleteTask = 'automation:delete-task',
  Automation_RunTask = 'automation:run-task',
  Automation_GetRuns = 'automation:get-runs',
  Automation_GetRun = 'automation:get-run',
  Automation_TriggerRun = 'automation:trigger-run',
  Automation_UpdateRun = 'automation:update-run',
  Automation_FinishRun = 'automation:finish-run',
  Automation_TasksChanged = 'automation:tasks-changed',
  Automation_SysFileRead = 'automation:sys-file-read',
  Automation_SysFileWrite = 'automation:sys-file-write',
  Automation_SysFileList = 'automation:sys-file-list',
  Automation_SysPower = 'automation:sys-power',

  // file service
  FileService_Upload = 'file-service:upload',
  FileService_List = 'file-service:list',
  FileService_Delete = 'file-service:delete',
  FileService_Retrieve = 'file-service:retrieve',

  Export_Word = 'export:word',

  Shortcuts_Update = 'shortcuts:update',

  // backup
  Backup_Backup = 'backup:backup',
  Backup_Restore = 'backup:restore',
  Backup_BackupToWebdav = 'backup:backupToWebdav',
  Backup_RestoreFromWebdav = 'backup:restoreFromWebdav',
  Backup_ListWebdavFiles = 'backup:listWebdavFiles',
  Backup_CheckConnection = 'backup:checkConnection',
  Backup_CreateDirectory = 'backup:createDirectory',
  Backup_DeleteWebdavFile = 'backup:deleteWebdavFile',
  Backup_BackupToLocalDir = 'backup:backupToLocalDir',
  Backup_RestoreFromLocalBackup = 'backup:restoreFromLocalBackup',
  Backup_ListLocalBackupFiles = 'backup:listLocalBackupFiles',
  Backup_DeleteLocalBackupFile = 'backup:deleteLocalBackupFile',
  Backup_BackupToS3 = 'backup:backupToS3',
  Backup_RestoreFromS3 = 'backup:restoreFromS3',
  Backup_ListS3Files = 'backup:listS3Files',
  Backup_DeleteS3File = 'backup:deleteS3File',
  Backup_CheckS3Connection = 'backup:checkS3Connection',

  // zip
  Zip_Decompress = 'zip:decompress',

  // system
  System_GetDeviceType = 'system:getDeviceType',
  System_GetHostname = 'system:getHostname',

  // DevTools
  System_ToggleDevTools = 'system:toggleDevTools',

  // events
  BackupProgress = 'backup-progress',
  ThemeUpdated = 'theme:updated',
  RestoreProgress = 'restore-progress',

  FullscreenStatusChanged = 'fullscreen-status-changed',

  ShowMiniWindow = 'show-mini-window',

  ReduxStoreReady = 'redux-store-ready',

  // Search Window
  SearchWindow_Open = 'search-window:open',
  SearchWindow_Close = 'search-window:close',
  SearchWindow_OpenUrl = 'search-window:open-url',

  //Store Sync
  StoreSync_Subscribe = 'store-sync:subscribe',
  StoreSync_Unsubscribe = 'store-sync:unsubscribe',
  StoreSync_OnUpdate = 'store-sync:on-update',
  StoreSync_BroadcastSync = 'store-sync:broadcast-sync',

  //Selection Assistant
  Selection_TextSelected = 'selection:text-selected',
  Selection_ToolbarHide = 'selection:toolbar-hide',
  Selection_ToolbarVisibilityChange = 'selection:toolbar-visibility-change',
  Selection_ToolbarDetermineSize = 'selection:toolbar-determine-size',
  Selection_WriteToClipboard = 'selection:write-to-clipboard',
  Selection_SetEnabled = 'selection:set-enabled',
  Selection_SetTriggerMode = 'selection:set-trigger-mode',
  Selection_SetFilterMode = 'selection:set-filter-mode',
  Selection_SetFilterList = 'selection:set-filter-list',
  Selection_SetFollowToolbar = 'selection:set-follow-toolbar',
  Selection_SetRemeberWinSize = 'selection:set-remeber-win-size',
  Selection_ActionWindowClose = 'selection:action-window-close',
  Selection_ActionWindowMinimize = 'selection:action-window-minimize',
  Selection_ActionWindowPin = 'selection:action-window-pin',
  Selection_ProcessAction = 'selection:process-action',
  Selection_UpdateActionData = 'selection:update-action-data',
  Selection_GetLinuxEnvInfo = 'selection:get-linux-env-info',

  // ExternalApps
  ExternalApps_DetectInstalled = 'external-apps:detect-installed',

  // Music Tab（本地音乐：元数据/扫描/缩略图）
  Music_ReadMetadata = 'music:read-metadata',
  Music_ScanFolder = 'music:scan-folder',
  Music_EnsureThumbs = 'music:ensure-thumbs',
  Music_ReadAudioFile = 'music:read-audio-file',

  // CherryAI
  Cherryai_GetSignature = 'cherryai:get-signature'
}
