@echo off
REM NodeTrade MT5 - One Command Startup Script for Windows
REM Cara pakai: start.bat atau .\start.bat

echo 🚀 NodeTrade MT5 - Starting Server...

REM Cleanup old processes
taskkill /F /IM node.exe 2>nul || true
taskkill /F /IM python.exe 2>nul || true

REM Install dependencies if not exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

REM Install Python dependencies
python -c "import flask" 2>nul || (
    echo 🐍 Installing Python dependencies...
    pip install flask flask-cors numpy scikit-learn requests
)

REM Start AI Service in background
echo 🤖 Starting AI Service...
cd ai_service
start /B python app.py
cd ..

REM Wait for AI service
timeout /t 2 /nobreak >nul

REM Start Node.js Server
echo 🌐 Starting NodeTrade Server on http://0.0.0.0:3000...
node server.ts
