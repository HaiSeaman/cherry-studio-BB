@echo off
title Cherry Studio BB - 一键测试启动器

echo =======================================================
echo          Cherry Studio BB - 测试软件启动器
echo =======================================================
echo.

set "ROOT_DIR=%~dp0"

:: 1. 优先启动解包绿色调试版本（秒开，适合测试）
for %%F in ("%ROOT_DIR%dist\win-unpacked\*.exe") do (
    if exist "%%~fF" (
        echo [状态] 找到解包测试程序:
        echo        "%%~fF"
        echo.
        echo [正在启动] 正在打开 Cherry Studio BB 进行测试...
        start "" "%%~fF"
        goto :SUCCESS
    )
)

:: 2. 动态搜索 portable 便携版
for %%F in ("%ROOT_DIR%dist\*portable.exe") do (
    if exist "%%~fF" (
        echo [状态] 找到便携版程序:
        echo        "%%~fF"
        echo.
        echo [正在启动] 正在打开便携版 Cherry Studio BB...
        start "" "%%~fF"
        goto :SUCCESS
    )
)

:: 3. 动态搜索 setup 安装版
for %%F in ("%ROOT_DIR%dist\*setup.exe") do (
    if exist "%%~fF" (
        echo [状态] 找到安装包程序:
        echo        "%%~fF"
        echo.
        echo [正在启动] 正在打开安装向导...
        start "" "%%~fF"
        goto :SUCCESS
    )
)

echo [错误] 未在 dist 目录下找到可执行程序！
echo        请先在终端运行打包命令: pnpm run build:win:x64
echo.
pause
exit /b 1

:SUCCESS
echo.
echo =======================================================
echo [完成] 软件已成功启动！您可以开始测试。
echo =======================================================
echo.
ping 127.0.0.1 -n 4 >nul
exit /b 0