@echo off
title AutoPecas Hub - Desktop
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Iniciando AutoPecas Hub - Sistema Desktop
echo ============================================================
echo.

if not exist "frontend\dist" (
    echo [1/2] Compilando interface visual...
    call npm run build:frontend
)

if not exist "backend\dist" (
    echo [2/2] Compilando backend local...
    call npm run build:backend
)

echo Abrindo aplicativo...
start "" npx electron .

exit
