@echo off
title AutoPecas Hub - Inicializador Local
setlocal
set "ROOT=%~dp0"

echo ============================================================
echo   Iniciando AutoPecas Hub (Backend + Frontend) Localmente
echo ============================================================
echo.

cd /d "%ROOT%backend"
echo [1/2] Iniciando Backend na porta 5000...
start "AutoPecas - Backend" cmd /c "npm run dev"

timeout /t 3 /nobreak >nul

cd /d "%ROOT%frontend"
echo [2/2] Iniciando Frontend na porta 5173...
start "AutoPecas - Frontend" cmd /c "npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo   Sistema rodando com sucesso!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:5000
echo.
echo   Login padrao:
echo   Email: admin@autopecas.com
echo   Senha: 123456
echo ============================================================
echo.

start http://localhost:5173
pause
