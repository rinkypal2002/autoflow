@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
)

echo Starting AutoFlow frontend on http://localhost:5173
call npm run dev
