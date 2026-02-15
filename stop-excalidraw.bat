@echo off
set found=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":6969" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set found=1
)
if %found%==1 (
    echo Excalidraw server stopped.
) else (
    echo Excalidraw server was not running.
)
