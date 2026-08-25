@echo off
REM ============================================================
REM Krunchies POS — emergency remote (Vercel) launcher
REM ============================================================
REM Prefer the local production launcher for shop speed:
REM   Setup once:  scripts\Setup-Local-POS.bat
REM   Daily use:   Desktop shortcut "Krunchies POS"
REM                (scripts\Launch-POS-Local.vbs)
REM
REM Keep this bat as a cloud fallback if the local PC build is unavailable.
REM
REM Browsers normally show a Print / Cancel dialog. Chrome's
REM --kiosk-printing flag sends receipts straight to the default
REM printer with NO dialog (required for counter staff speed).
REM
REM Tip: If the printer errors after many tickets, restart Chrome and the
REM Windows Print Spooler. POS queues prints one-at-a-time to reduce that.
REM ============================================================

set "POS_URL=http://127.0.0.1:3001/orders/new"

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if "%CHROME%"=="" (
  echo Chrome not found. Install Google Chrome, then run this again.
  pause
  exit /b 1
)

start "" "%CHROME%" --kiosk-printing --disable-print-preview --app="%POS_URL%"
exit /b 0
