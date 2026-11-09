@echo off
setlocal
set "ROOT=%~dp0.."
set "NODE=%ROOT%\runtime\node\node.exe"
if not exist "%NODE%" (
  where node >nul 2>&1
  if errorlevel 1 exit /b 1
  set "NODE=node"
)
"%NODE%" "%ROOT%\companion\src\host.js" %*
endlocal
