param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
$PosRoot = Split-Path -Parent $PSScriptRoot
$AppUrl = "http://127.0.0.1:$Port/orders/new"
$HealthUrl = "http://127.0.0.1:$Port/"
$DataRoot = Join-Path $env:LOCALAPPDATA "KrunchiesPOS"
$LogRoot = Join-Path $DataRoot "logs"
$ChromeProfile = (Join-Path $DataRoot "chrome-profile" | Resolve-Path -ErrorAction SilentlyContinue)
if (-not $ChromeProfile) {
  $ChromeProfile = Join-Path $DataRoot "chrome-profile"
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ChromeProfile | Out-Null

# Ensure this Windows user can write the POS Chrome profile (usernames with spaces).
try {
  & icacls $DataRoot /grant "${env:USERNAME}:(OI)(CI)F" /T 2>&1 | Out-Null
} catch {
  # Non-fatal — Chrome may still work if permissions are already OK.
}

function Test-PosReady {
  try {
    Invoke-WebRequest `
      -Uri $HealthUrl `
      -UseBasicParsing `
      -TimeoutSec 2 `
      -MaximumRedirection 0 `
      -ErrorAction Stop | Out-Null
    return $true
  } catch {
    if ($_.Exception.Response) {
      return $true
    }
    return $false
  }
}

function Show-PosError([string]$Message) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    $Message,
    "Krunchies POS",
    [System.Windows.MessageBoxButton]::OK,
    [System.Windows.MessageBoxImage]::Error
  ) | Out-Null
}

function Start-ChromePosApp {
  param(
    [string]$ChromeExe,
    [string]$ProfileDir,
    [string]$Url
  )
  # ProcessStartInfo.Arguments must quote paths that contain spaces — otherwise
  # Chrome treats C:\Users\krunchies pizza\... as two tokens (C:\Users\krunchies).
  $profileQuoted = $ProfileDir -replace '"', '\"'
  $args = @(
    "--user-data-dir=`"$profileQuoted`""
    "--no-first-run"
    "--disable-session-crashed-bubble"
    "--kiosk-printing"
    "--disable-print-preview"
    "--app=$Url"
  ) -join " "

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $ChromeExe
  $psi.Arguments = $args
  $psi.UseShellExecute = $false
  [void][System.Diagnostics.Process]::Start($psi)
}

if (-not (Test-Path (Join-Path $PosRoot ".next\BUILD_ID"))) {
  Show-PosError "The local production build is missing. Run scripts\Setup-Local-POS.ps1 once as the owner/developer."
  exit 1
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Show-PosError "Node.js is missing. Install Node.js 20 LTS, then run Setup-Local-POS.ps1."
  exit 1
}

if (-not (Test-PosReady)) {
  $StdOut = Join-Path $LogRoot "server.log"
  $StdErr = Join-Path $LogRoot "server-error.log"
  Start-Process `
    -FilePath (Get-Command npm.cmd).Source `
    -ArgumentList @("run", "start:local") `
    -WorkingDirectory $PosRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdOut `
    -RedirectStandardError $StdErr

  $Deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $Deadline -and -not (Test-PosReady)) {
    Start-Sleep -Milliseconds 400
  }
}

if (-not (Test-PosReady)) {
  Show-PosError "The local POS server did not start. Check $LogRoot or run Setup-Local-POS.ps1 again."
  exit 1
}

$ChromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$Chrome = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Chrome) {
  Show-PosError "Google Chrome was not found. Install Chrome and try again."
  exit 1
}

# If POS Chrome is already running with this profile, focus it instead of
# opening a second app window (two windows share IndexedDB and can double-sync).
$profileNeedle = "KrunchiesPOS"
$existing = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -like "*$profileNeedle*" -and
    $_.CommandLine -like "*chrome-profile*"
  }
if ($existing) {
  $activate = New-Object -ComObject WScript.Shell
  $null = $activate.AppActivate("Krunchies POS")
  if (-not $activate.AppActivate("Krunchies POS")) {
    $null = $activate.AppActivate("Krunchies")
  }
  exit 0
}

Start-ChromePosApp -ChromeExe $Chrome -ProfileDir $ChromeProfile -Url $AppUrl
