@echo off
echo Stopping Jarvis services (ports 5000, 5001, 5002, 5003, 5173)...
powershell -NoProfile -Command "foreach($p in 5000,5001,5002,5003,5173){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo Done. If the tray icon is still there, right-click it and choose "Exit Jarvis".
pause
