@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo  Cherry Studio Dev Launcher
echo ============================================================
echo.

echo [1/4] Checking Node.js runtime...
where node >nul 2>&1
if !errorlevel! neq 0 (
  echo [ERROR] Node.js was not found in your PATH.
  echo Please make sure Node.js is installed.
  echo.
  pause
  exit /b 1
)
node -v

echo.
echo [2/4] Checking Package Manager (pnpm)...
set "PNPM_BIN="

REM 1. Prefer pnpm.cmd on Windows to prevent PowerShell script execution policy blocks
where pnpm.cmd >nul 2>&1
if !errorlevel! equ 0 (
  set "PNPM_BIN=pnpm.cmd"
  goto :pnpm_ok
)

REM 2. Check standard pnpm
where pnpm >nul 2>&1
if !errorlevel! equ 0 (
  set "PNPM_BIN=pnpm"
  goto :pnpm_ok
)

REM 3. Check AppData global npm directory
if exist "%APPDATA%\npm\pnpm.cmd" (
  set "PNPM_BIN=%APPDATA%\npm\pnpm.cmd"
  goto :pnpm_ok
)

REM 4. Fallback to corepack or npx if pnpm is not in global PATH
where corepack >nul 2>&1
if !errorlevel! equ 0 (
  set "PNPM_BIN=corepack pnpm"
  goto :pnpm_ok
)

where npx >nul 2>&1
if !errorlevel! equ 0 (
  set "PNPM_BIN=npx pnpm"
  goto :pnpm_ok
)

echo [ERROR] pnpm is not found.
echo Please run: npm install -g pnpm
echo.
pause
exit /b 1

:pnpm_ok
echo Using package manager: !PNPM_BIN!
call !PNPM_BIN! -v

echo.
echo [3/4] Checking dependencies...
if not exist node_modules (
  echo node_modules not found, running !PNPM_BIN! install...
  call !PNPM_BIN! install
  if !errorlevel! neq 0 (
    echo.
    echo [ERROR] pnpm install failed.
    pause
    exit /b 1
  )
) else (
  echo Dependencies are installed.
)

echo.
echo [4/4] Starting Cherry Studio dev mode...
REM Clear ELECTRON_RUN_AS_NODE to prevent Electron from running in headless node CLI mode
set "ELECTRON_RUN_AS_NODE="

if "%~1"=="--dry-run" (
  echo [DRY RUN] All startup checks passed successfully.
  exit /b 0
)

echo Launching dev server and Electron app...
echo (Close the Cherry Studio window or press Ctrl+C to terminate)
echo.

call !PNPM_BIN! run dev

if !errorlevel! neq 0 (
  echo.
  echo [WARNING] Dev process ended with exit code !errorlevel!.
)

echo.
echo Application exited. Press any key to close this window.
pause >nul
