@echo off
REM ============================================================
REM  BeadPixel launcher for Windows
REM  Usage:
REM    start.bat         production mode, runs npm start
REM    start.bat dev     development mode, runs npm run dev
REM
REM  When double-clicked, node or npm may not be in the PATH.
REM  This script detects common Node.js installs and adds the
REM  directory to the session PATH. The window stays open with
REM  pause on any error or after the server stops.
REM ============================================================
setlocal
cd /d "%~dp0"

REM ---- locate Node.js ----
set "NODE_BIN="
if exist "D:\node.js\node.exe" set "NODE_BIN=D:\node.js"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs"
if exist "C:\Program Files\nodejs\node.exe" set "NODE_BIN=C:\Program Files\nodejs"
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" set "NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2"

if not defined NODE_BIN (
  echo [BeadPixel] Node.js not found.
  echo   Please install Node.js from https://nodejs.org and ensure it is in PATH.
  echo   Or add its directory to the candidate list at the top of this script.
  pause
  exit /b 1
)

set "PATH=%NODE_BIN%;%PATH%"

IF NOT EXIST node_modules (
  echo [BeadPixel] node_modules not found, installing dependencies...
  call npm install
  IF ERRORLEVEL 1 ( echo [BeadPixel] npm install failed. & pause & exit /b 1 )
)

IF "%1"=="dev" (
  echo [BeadPixel] Starting in dev mode, open http://localhost:3000
  call npm run dev
) ELSE (
  echo [BeadPixel] Starting in production mode, open http://localhost:3000
  call npm start
)

echo [BeadPixel] Server stopped.
pause
