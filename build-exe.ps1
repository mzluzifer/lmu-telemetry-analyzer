# build-exe.ps1 — baut LMU-Telemetrie.exe und entfernt das Konsolenfenster.
#
# Schritt 1: pkg bündelt lmu-bridge.js + die HTML-App zu einer Standalone-.exe.
# Schritt 2: Der PE-Header der .exe wird von "Console" (CUI, Subsystem 3) auf
#            "GUI" (Subsystem 2) gepatcht. Windows legt für GUI-Programme KEIN
#            Konsolenfenster an -> Doppelklick auf die .exe startet die App ohne
#            sichtbares Kommandozeilenfenster. (Die Bridge leitet ihre Ausgaben
#            in diesem Modus in lmu-telemetrie.log um, siehe lmu-bridge.js.)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$out = Join-Path $PSScriptRoot "dist\LMU-Telemetrie.exe"

# Laufende Instanz beenden (sonst EPERM beim Überschreiben der .exe)
Get-Process LMU-Telemetrie -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "==> pkg: baue $out"
npx pkg@5.8.1 . --targets node18-win-x64 --output $out
if (-not (Test-Path $out)) { throw "pkg hat keine .exe erzeugt: $out" }

Write-Host "==> Patche PE-Subsystem (Console -> GUI), damit kein Fenster erscheint"
$bytes = [System.IO.File]::ReadAllBytes($out)
$peOff = [BitConverter]::ToInt32($bytes, 0x3C)            # e_lfanew -> Offset des PE-Headers
if ($bytes[$peOff] -ne 0x50 -or $bytes[$peOff + 1] -ne 0x45) { throw "Keine PE-Signatur gefunden" }
# Subsystem (WORD) liegt bei OptionalHeader+68; OptionalHeader beginnt bei peOff+4(PE-Sig)+20(COFF) = peOff+24
$subOff = $peOff + 24 + 68
$cur = $bytes[$subOff]
Write-Host ("    aktuelles Subsystem: {0} (3=Console, 2=GUI)" -f $cur)
if ($cur -eq 3) {
  $bytes[$subOff] = 2
  [System.IO.File]::WriteAllBytes($out, $bytes)
  Write-Host "    -> auf 2 (GUI) gesetzt."
} elseif ($cur -eq 2) {
  Write-Host "    -> bereits GUI, nichts zu tun."
} else {
  throw "Unerwarteter Subsystem-Wert: $cur"
}

$mb = [Math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "==> Fertig: $out ($mb MB)"
