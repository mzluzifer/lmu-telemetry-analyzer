@echo off
cd /d "%~dp0"
title LMU Telemetrie-Bridge
echo ============================================================
echo   LMU Telemetrie-Analyse
echo ------------------------------------------------------------
echo   Die Bridge startet und liest deine aufgezeichnete
echo   Telemetrie (UserData\Telemetry\*.duckdb).
echo.
echo   Der Browser oeffnet sich gleich automatisch unter
echo   http://localhost:8777
echo.
echo   Dieses Fenster bitte geoeffnet lassen, solange du
echo   die App benutzt. Zum Beenden: Fenster schliessen.
echo ============================================================
echo.

REM Node vorhanden?
where node >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
  echo.
  pause
  exit /b 1
)

REM DuckDB-CLI bei Bedarf herunterladen (erster Start / frischer Git-Clone)
if not exist "duckdbcli\duckdb.exe" (
  echo DuckDB-CLI wird heruntergeladen ^(einmalig^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest 'https://github.com/duckdb/duckdb/releases/download/v1.4.0/duckdb_cli-windows-amd64.zip' -OutFile 'duckdb_cli.zip'; Expand-Archive 'duckdb_cli.zip' -DestinationPath 'duckdbcli' -Force; Remove-Item 'duckdb_cli.zip' } catch { Write-Host $_; exit 1 }"
  if errorlevel 1 (
    echo FEHLER beim Download der DuckDB-CLI. Internetverbindung pruefen.
    pause
    exit /b 1
  )
)

REM Browser nach 2 Sekunden oeffnen (parallel, waehrend die Bridge laeuft)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8777"

node lmu-bridge.js

echo.
echo Bridge wurde beendet.
pause >nul
