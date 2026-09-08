@echo off
REM NodeTrade MT5 - Single Command Startup Script for Windows PowerShell/CMD
REM Usage: run.bat

echo.
echo 🚀 Starting NodeTrade MT5 Backend Server...
echo.

REM Kill any existing processes on ports
echo 📋 Cleaning up existing processes...
taskkill /F /IM node.exe 2>nul || echo No node processes to kill
taskkill /F /IM python.exe 2>nul || echo No python processes to kill
taskkill /F /IM nginx.exe 2>nul || echo No nginx processes to kill
timeout /t 2 /nobreak >nul

REM Check if Python venv exists
if not exist ".venv\Scripts\python.exe" (
    echo ❌ Python virtual environment not found. Creating...
    python -m venv .venv
    call .venv\Scripts\activate
    pip install uvicorn fastapi pandas numpy scikit-learn tensorflow torch
) else (
    call .venv\Scripts\activate
)

REM Install Node dependencies if needed
if not exist "node_modules" (
    echo 📦 Installing Node dependencies...
    npm install
)

REM Start Python AI Service in background
echo 🤖 Starting Python AI Service on port 8010...
cd ai_service
start /B python -m uvicorn main:app --host 0.0.0.0 --port 8010
cd ..

REM Wait for AI service to start
timeout /t 3 /nobreak >nul

REM Start Node.js Server
echo 🟢 Starting Node.js Server on port 3000...
start /B npx ts-node server.ts

REM Wait for Node server to start
timeout /t 3 /nobreak >nul

REM Start Nginx (if available and configured)
where nginx >nul 2>&1
if %errorlevel% equ 0 (
    if exist "nginx.conf" (
        echo 🌐 Starting Nginx reverse proxy on port 80...
        nginx -c "%cd%\nginx.conf" 2>nul || echo ⚠️  Nginx config issue, skipping...
    )
)

echo.
echo ✅ NodeTrade MT5 Backend Server is running!
echo.
echo 📊 Dashboard: http://localhost:3000
echo 🌍 Public Access: http://0.0.0.0:3000
echo 🤖 AI Service: http://localhost:8010
echo.
echo Press Ctrl+C to stop this window (services will continue running)
echo To stop all services, run: stop.bat
echo.

pause
