@echo off
:: Kill any existing excalidraw server on port 6969
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":6969" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
:: Start fresh
cscript //nologo "%~dp0start-excalidraw.vbs"
echo Excalidraw started on http://localhost:6969
