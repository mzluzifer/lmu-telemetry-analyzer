@echo off
cd /d "%~dp0"
title LMU Telemetrie-Bridge
echo ============================================================
echo   LMU Telemetrie-Analyse
echo ------------------------------------------------------------
echo   Liest deine aufgezeichnete Telemetrie
echo   (UserData\Telemetry\*.duckdb) und oeffnet die Auswertung
echo   im Browser unter http://localhost:8777
echo.
echo   Dieses Fenster bitte geoeffnet lassen, solange du die
echo   App benutzt. Zum Beenden: Fenster schliessen.
echo ============================================================
echo.

REM ============================================================
REM  Node.js sicherstellen (vorhanden? sonst installieren/laden)
REM ============================================================
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "node\node.exe" set "NODE_EXE=%CD%\node\node.exe"

if not defined NODE_EXE (
  echo Node.js wurde nicht gefunden.
  echo.
  REM 1^) Versuch ueber winget ^(richtige Installation, ggf. mit Admin-Rueckfrage^)
  where winget >nul 2>nul && (
    echo Installiere Node.js LTS ueber winget...
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
  )
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

  REM 2^) Fallback: portable Node.js LTS herunterladen ^(ohne Admin, in .\node^)
  if not defined NODE_EXE (
    echo Lade portable Node.js LTS herunter ^(einmalig^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $i=Invoke-RestMethod 'https://nodejs.org/dist/index.json'; $lts=($i.Where({$_.lts -ne $false},'First')[0]).version; $u='https://nodejs.org/dist/'+$lts+'/node-'+$lts+'-win-x64.zip'; Write-Host ('Node.js '+$lts); Invoke-WebRequest $u -OutFile 'node.zip'; Expand-Archive 'node.zip' -DestinationPath '_nodetmp' -Force; $d=(Get-ChildItem '_nodetmp' -Directory)[0]; Move-Item $d.FullName 'node' -Force; Remove-Item 'node.zip' -Force; Remove-Item '_nodetmp' -Recurse -Force"
    if exist "node\node.exe" set "NODE_EXE=%CD%\node\node.exe"
  )
)

if not defined NODE_EXE (
  echo.
  echo FEHLER: Node.js konnte nicht bereitgestellt werden.
  echo Bitte manuell von https://nodejs.org installieren und neu starten.
  echo.
  pause
  exit /b 1
)

REM ============================================================
REM  DuckDB-CLI sicherstellen (im Release enthalten; sonst laden)
REM ============================================================
if not exist "duckdbcli\duckdb.exe" (
  echo DuckDB-CLI wird heruntergeladen ^(einmalig^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest 'https://github.com/duckdb/duckdb/releases/download/v1.4.0/duckdb_cli-windows-amd64.zip' -OutFile 'duckdb_cli.zip'; Expand-Archive 'duckdb_cli.zip' -DestinationPath 'duckdbcli' -Force; Remove-Item 'duckdb_cli.zip' } catch { Write-Host $_; exit 1 }"
  if errorlevel 1 (
    echo FEHLER beim Download der DuckDB-CLI. Internetverbindung pruefen.
    pause
    exit /b 1
  )
)

REM ============================================================
REM  Bridge starten (oeffnet den Browser automatisch)
REM ============================================================
"%NODE_EXE%" lmu-bridge.js

echo.
echo Bridge wurde beendet.
pause >nul
