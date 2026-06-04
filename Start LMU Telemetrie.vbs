' LMU Telemetrie-Analyse - versteckter Start (kein Konsolenfenster)
' Doppelklick auf diese Datei startet die App ohne sichtbares Kommandozeilenfenster.
Option Explicit
Dim fso, dir, exe, shell
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = """" & dir & "\LMU-Telemetrie.exe"" --hidden"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = dir
' Fensterstil 0 = versteckte Konsole, False = nicht warten
shell.Run exe, 0, False
