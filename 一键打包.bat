@echo off
title Cherry Studio BB - 一键打包
cd /d "%~dp0"

where node >nul 2>nul || (echo [错误] 未检测到 Node.js，请先安装 Node.js 24+ & pause & exit /b 1)
where pnpm >nul 2>nul || (echo [错误] 未检测到 pnpm，请先安装 pnpm & pause & exit /b 1)

if not exist "node_modules" (
    echo [首次运行] 正在安装依赖，请耐心等待...
    call pnpm install
    if errorlevel 1 (echo [错误] 依赖安装失败 & pause & exit /b 1)
)

echo.
echo ============================================
echo   Cherry Studio BB - 一键打包 (x64)
echo   步骤：类型检查 - 编译 - 生成 EXE
echo   产物：安装版 setup.exe + 便捷版 portable.exe
echo   输出目录：dist
echo ============================================
echo.
echo [1/2] 正在构建（类型检查 + 编译）并打包 EXE，耗时约 5-10 分钟...
echo.
call pnpm build:win:x64
if errorlevel 1 (
    echo.
    echo [错误] 打包失败，请查看上方错误信息。
    pause
    exit /b 1
)

echo.
echo ============================================
echo   打包成功！产物如下：
echo ============================================
dir /b "dist\*.exe" 2>nul || echo   (未找到 exe 文件，请检查 dist 目录)
echo.
echo 正在打开 dist 文件夹...
explorer "dist"
timeout /t 2 >nul
pause
