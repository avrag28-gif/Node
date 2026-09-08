@echo off
REM NodeTrade MT5 - Stop All Services Script for Windows
REM Usage: stop.bat

echo.
echo 🛑 Shutting down NodeTrade MT5...
echo.

taskkill /F /IM node.exe 2>nul || echo No node processes to kill
taskkill /F /IM python.exe 2>nul || echo No python processes to kill
taskkill /F /IM nginx.exe 2>nul || echo No nginx processes to kill

echo.
echo ✅ All services stopped!
echo.
pause
