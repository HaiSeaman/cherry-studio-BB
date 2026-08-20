@echo off
@chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo  Cherry Studio Dev Launcher
echo ============================================================
echo.

set "ELECTRON_RUN_AS_NODE="

echo [1/3] Checking Node.js runtime...
where /q node
if errorlevel 1 goto no_node

echo [2/3] Checking Package Manager...
set "PNPM_CMD=pnpm.cmd"
where /q pnpm.cmd
if not errorlevel 1 goto check_deps

set "PNPM_CMD=pnpm"
where /q pnpm
if not errorlevel 1 goto check_deps

if exist "%APPDATA%
pmpnpm.cmd" (
  set "PNPM_CMD=%APPDATA%
pmpnpm.cmd"
  goto check_deps
)

set "PNPM_CMD=npx pnpm"

:check_deps
echo       Using: %PNPM_CMD%
echo [3/3] Checking dependencies...
if not exist node_modules (
  echo       Installing dependencies...
  call %PNPM_CMD% install
  if errorlevel 1 goto install_failed
) else (
  echo       Dependencies ready.
)

if "%~1"=="--dry-run" (
  echo [DRY RUN] All pre-launch checks passed.
  exit /b 0
)

echo.
echo Starting Cherry Studio dev mode...
echo (Close the Cherry Studio window to exit)
echo.

call %PNPM_CMD% run dev
if errorlevel 1 (
  echo.
  echo [ERROR] Dev server encountered an issue.
)

echo.
echo Application exited.
pause
exit /b 0

:no_node
echo [ERROR] Node.js is not found in PATH. Please install Node.js: https://nodejs.org/
echo.
pause
exit /b 1

:install_failed
echo [ERROR] Failed to install dependencies.
echo.
pause
exit /b 1
