param(
    [string]$BackendHealthUrl = 'https://bihar-skill-intern-backend.onrender.com/api/health'
)

$ErrorActionPreference = 'Stop'

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

try {
    $response = Invoke-RestMethod -Uri $BackendHealthUrl -TimeoutSec 90
    $dbReady = $response.database.ready
    if ($response.status -and $dbReady) {
        Write-Log "Backend health OK. Database ready: $dbReady"
        exit 0
    }

    Write-Log "Backend health warning. Response: $($response | ConvertTo-Json -Compress -Depth 5)"
    exit 2
} catch {
    Write-Log "Backend health failed: $($_.Exception.Message)"
    exit 1
}
