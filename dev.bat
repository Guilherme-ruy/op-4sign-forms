@echo off
echo Iniciando backend e frontend em modo dev...

start "Backend" cmd /k "cd /d %~dp0backend && npm run start:dev"
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Servidores iniciados!
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:3030
