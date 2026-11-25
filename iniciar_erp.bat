@echo off
setlocal
set "ROOT=%~dp0"

echo ERP Panaderia - acceso desde la red local
echo Direcciones para abrir en el celular:
powershell -NoProfile -Command "$ips = (ipconfig) | Select-String -Pattern 'IPv4[^:]*:\s*([0-9.]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Where-Object { $_ -ne '127.0.0.1' -and $_ -notlike '169.254.*' } | Sort-Object -Unique; if ($ips) { $ips | ForEach-Object { Write-Output ('  http://{0}:5174' -f $_) } } else { Write-Output '  No se encontro una direccion IPv4 local.' }"
echo.

start "ERP Backend" cmd /k "cd /d ""%ROOT%backend"" && call "".venv\Scripts\activate.bat"" && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
start "ERP Frontend" cmd /k "cd /d ""%ROOT%frontend"" && npm run dev -- --host 0.0.0.0"

endlocal
