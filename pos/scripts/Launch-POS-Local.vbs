Option Explicit

Dim shell, fso, scriptDir, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ _
  & fso.BuildPath(scriptDir, "Start-Local-POS.ps1") & """"

' Hidden window, asynchronous. Cashiers see only the Chrome POS app.
shell.Run command, 0, False
