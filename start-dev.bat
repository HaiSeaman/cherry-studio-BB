@echo off
setlocal
cd /d "%~dp0"

REM ============================================================
REM  Cherry Studio dev launcher (Windows)
REM
REM  Purpose: run the app in dev mode without packaging an EXE
REM  Usage:   double-click this file, or run start-dev.bat
REM
REM  Notes:
REM  - First run auto-installs missing dependencies
REM  - If ELECTRON_RUN_AS_NODE is set in the environment (injected
REM    by WorkBuddy/CI sandbox), Electron would run as Node.js and
REM    the app would not start. cmd cannot delete env vars, so the
REM    launch step is delegated to PowerShell which removes it.
REM ============================================================

echo [1/3] Checking pnpm...

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install it first: npm install -g pnpm
  pause
  exit /b 1
)

echo [2/3] Checking dependencies...

if not exist node_modules\electron-screenshots (
  echo       First run: installing dependencies...
  call pnpm install --offline
  if errorlevel 1 call pnpm install
  if errorlevel 1 (
    echo [ERROR] Dependency install failed. Check your network and retry.
    pause
    exit /b 1
  )
) else (
  echo       Dependencies ready
)

echo [3/3] Starting Cherry Studio dev mode...
echo       Close the app to exit; this window will close afterwards.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:ELECTRON_RUN_AS_NODE = $null; npm run dev"

echo.
echo App exited. Press any key to close this window.
pause >nul
