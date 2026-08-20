@echo off
@chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 goto :no_node

node scripts\start-dev.js %*
if %errorlevel% neq 0 goto :error
exit /b 0

:no_node
echo.
echo ============================================================
echo  [ERROR] Node.js is not found in your PATH!
echo  Please install Node.js (v18+) from: https://nodejs.org/
echo ============================================================
echo.
pause
exit /b 1

:error
echo.
echo ============================================================
echo  [ERROR] Cherry Studio failed to start (Exit code: %errorlevel%).
echo ============================================================
echo.
pause
exit /b %errorlevel%
