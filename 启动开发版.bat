@echo off
title Cherry Studio BB - 开发模式
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
echo   Cherry Studio BB - 开发模式
echo   应用窗口打开后即可测试；修改代码自动热更新
echo   关闭应用窗口后回到本窗口查看日志
echo ============================================
echo.
call pnpm dev
echo.
echo [提示] 开发模式已退出（退出码 %errorlevel%）
echo 如需重新启动，请再次双击本文件。
pause
