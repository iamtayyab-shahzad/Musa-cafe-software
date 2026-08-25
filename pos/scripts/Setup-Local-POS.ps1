param(
  [string]$ApiUrl = ""
)

$ErrorActionPreference = "Stop"
$PosRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $PosRoot ".env.local"

function Stop-WithMessage([string]$Message) {
  Write-Host ""
  Write-Host $Message -ForegroundColor Red
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host "Krunchies POS - local production setup" -ForegroundColor Cyan
Write-Host "This is a one-time owner/developer setup. Cashiers will not run it."
Write-Host ""

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "Node.js 20+ is required on this PC. Install the LTS version from https://nodejs.org and run setup again."
}

$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) {
  Stop-WithMessage "Node.js 20+ is required. The installed version is $(node --version)."
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "npm was not found. Reinstall Node.js LTS and run setup again."
}

if (-not $ApiUrl -and (Test-Path $EnvFile)) {
  $existing = Get-Content $EnvFile |
    Where-Object { $_ -match "^NEXT_PUBLIC_API_URL=" } |
    Select-Object -First 1
  if ($existing) {
    $ApiUrl = ($existing -replace "^NEXT_PUBLIC_API_URL=", "").Trim()
  }
}

if (-not $ApiUrl -or $ApiUrl -match "localhost|127\.0\.0\.1") {
  Write-Host "Enter the deployed cloud API URL used by the live POS." -ForegroundColor Yellow
  Write-Host "Example: https://your-api.onrender.com/api/v1"
  $ApiUrl = (Read-Host "Cloud API URL").Trim()
}

if (-not [Uri]::IsWellFormedUriString($ApiUrl, [UriKind]::Absolute)) {
  Stop-WithMessage "The API URL is not valid. Run setup again with the full https://.../api/v1 URL."
}

$ApiUrl = $ApiUrl.TrimEnd("/")
$envLines = @()
if (Test-Path $EnvFile) {
  $envLines = @(Get-Content $EnvFile | Where-Object {
    $_ -notmatch "^NEXT_PUBLIC_API_URL="
  })
}
$envLines = @("NEXT_PUBLIC_API_URL=$ApiUrl") + $envLines
# Next.js reads .env as plain UTF-8; a BOM would corrupt the first key name.
[System.IO.File]::WriteAllLines(
  $EnvFile,
  $envLines,
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host ""
Write-Host "Checking cloud API..." -ForegroundColor Cyan
Write-Host "A free Render service can take up to a minute to wake up."
$apiReachable = $false
foreach ($attempt in 1..3) {
  try {
    Invoke-WebRequest `
      -Uri "$ApiUrl/settings/public" `
      -UseBasicParsing `
      -TimeoutSec 45 | Out-Null
    $apiReachable = $true
    break
  } catch {
    Write-Host "Attempt $attempt of 3 failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}

if ($apiReachable) {
  Write-Host "Cloud API is reachable." -ForegroundColor Green
} else {
  Write-Host "Warning: API check failed. The build can continue, but first login/sync will require the correct URL and internet." -ForegroundColor Yellow
  Write-Host "Type y to continue, or anything else to stop and re-check the URL."
  $continue = Read-Host "Continue building? (y/N)"
  if ($continue -notmatch "^[Yy]$") {
    exit 1
  }
}

# A running local POS server keeps next-swc loaded, which makes dependency
# installs fail on Windows with EPERM.
$listeners = @(
  Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
)
if ($listeners.Count -gt 0) {
  Write-Host ""
  Write-Host "Stopping the running local POS server before installing..." -ForegroundColor Cyan
  foreach ($processId in $listeners) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

$LockFile = Join-Path $PosRoot "package-lock.json"
$ModulesDir = Join-Path $PosRoot "node_modules"
$StampFile = Join-Path $ModulesDir ".krunchies-install-stamp"
$LockHash = (Get-FileHash -Path $LockFile -Algorithm SHA256).Hash
$InstalledHash = if (Test-Path $StampFile) { (Get-Content $StampFile -Raw).Trim() } else { "" }

Push-Location $PosRoot
try {
  Write-Host ""
  if ((Test-Path $ModulesDir) -and $InstalledHash -eq $LockHash) {
    Write-Host "Dependencies already match package-lock.json - skipping install." -ForegroundColor Green
  } else {
    Write-Host "Installing locked dependencies..." -ForegroundColor Cyan
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) {
      Stop-WithMessage "Dependency install failed. Close every POS/Chrome window, pause antivirus scanning of this folder, then run setup again."
    }
    Set-Content -Path $StampFile -Value $LockHash -Encoding ASCII
  }

  Write-Host ""
  Write-Host "Building the production POS..." -ForegroundColor Cyan
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "Production build failed. Review the error above."
  }
} finally {
  Pop-Location
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Krunchies POS.lnk"
$LauncherPath = Join-Path $PSScriptRoot "Launch-POS-Local.vbs"
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$Shortcut.Arguments = "`"$LauncherPath`""
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "Krunchies POS - local production app"

$ChromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$Chrome = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($Chrome) {
  $Shortcut.IconLocation = "$Chrome,0"
}
$Shortcut.Save()

Write-Host ""
Write-Host "Local POS is ready." -ForegroundColor Green
Write-Host "Desktop shortcut: $ShortcutPath"
Write-Host "Cashiers only need to double-click 'Krunchies POS'."
Write-Host ""
Read-Host "Press Enter to close"
