@echo off
setlocal
set "ROOT=%~dp0"
powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-cloud-agents.ps1"
endlocal
