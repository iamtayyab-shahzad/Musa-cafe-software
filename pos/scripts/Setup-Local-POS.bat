@echo off
REM One-time owner/developer setup. Cashiers use the desktop shortcut created
REM by this script and never need npm, PowerShell, or a terminal.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Local-POS.ps1"
