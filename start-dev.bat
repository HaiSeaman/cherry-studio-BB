@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  Cherry Studio Dev Launcher
echo ============================================================
echo.

set "ELECTRON_RUN_AS_NODE="

echo [1/3] Checking Node.js and pnpm...
where /q node
if errorlevel 1 (
  echo [ERROR] Node.js is not found in PATH. Please install Node.js.
  pause
  exit /b 1
)

set "PNPM_CMD=pnpm.cmd"
where /q pnpm.cmd
if errorlevel 1 (
  where /q pnpm
  if errorlevel 1 (
    if exist "%APPDATA%\npm\pnpm.cmd" (
      set "PNPM_CMD=%APPDATA%\npm\pnpm.cmd"
    ) else (
      set "PNPM_CMD=npx pnpm"
    )
  ) else (
    set "PNPM_CMD=pnpm"
  )
)

echo       Using: %PNPM_CMD%

echo [2/3] Checking dependencies...
if not exist node_modules (
  echo       Installing dependencies...
  call %PNPM_CMD% install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
) else (
  echo       Dependencies ready.
)

if "%~1"=="--dry-run" (
  echo [DRY RUN] All pre-launch checks passed.
  exit /b 0
)

echo [3/3] Starting Cherry Studio dev mode...
echo       (Close the Cherry Studio window to exit)
echo.

call %PNPM_CMD% run dev

if errorlevel 1 (
  echo.
  echo [WARNING] Application closed with code %errorlevel%.
)

echo.
echo Application exited. Press any key to close this window.
pause >/dev/null
