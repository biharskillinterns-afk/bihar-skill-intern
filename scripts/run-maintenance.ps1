$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'ops\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir 'maintenance.log'

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] $Message"
    Write-Output $line
    Add-Content -LiteralPath $logPath -Value $line
}

Write-Log 'Maintenance run started.'

& (Join-Path $PSScriptRoot 'check-backend-health.ps1')
if ($LASTEXITCODE -ne 0) {
    Write-Log "Health check finished with code $LASTEXITCODE."
}

& (Join-Path $PSScriptRoot 'backup-aiven-db.ps1')
if ($LASTEXITCODE -ne 0) {
    Write-Log "Database backup finished with code $LASTEXITCODE."
}

Write-Log 'Maintenance run finished.'
