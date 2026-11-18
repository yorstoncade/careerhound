@echo off
rem Double-click this file on Windows to start JobScout.
title JobScout
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo JobScout needs Node.js, which isn't installed yet.
  echo Download the LTS version from https://nodejs.org ^(opening it now^), install it,
  echo then double-click start.bat again.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

node scripts\launch.mjs
if errorlevel 1 (
  echo.
  echo JobScout stopped with an error ^(see above^).
  pause
  exit /b 1
)
