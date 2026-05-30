param(
    [string]$ConfigPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ops\db-backup-config.ps1')
)

$ErrorActionPreference = 'Stop'

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] $Message"
    Write-Output $line
    Add-Content -LiteralPath $script:LogPath -Value $line
}

function Get-MySqlDumpPath {
    $command = Get-Command mysqldump -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe',
        'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe',
        'C:\Program Files (x86)\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    return $null
}

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'ops\logs'
$backupDir = Join-Path $root 'backups\db'
New-Item -ItemType Directory -Force -Path $logDir, $backupDir | Out-Null

$script:LogPath = Join-Path $logDir 'maintenance.log'

if (!(Test-Path -LiteralPath $ConfigPath)) {
    throw "Backup config not found: $ConfigPath"
}

. $ConfigPath

$required = @('DbHost', 'DbPort', 'DbUser', 'DbPassword', 'DbName')
foreach ($name in $required) {
    if ([string]::IsNullOrWhiteSpace((Get-Variable -Name $name -ValueOnly -ErrorAction SilentlyContinue))) {
        throw "Missing required backup config value: $name"
    }
}

$mysqldump = Get-MySqlDumpPath
if (!$mysqldump) {
    throw 'mysqldump.exe was not found. Install MySQL Server/Client tools or add mysqldump to PATH.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$sqlPath = Join-Path $backupDir "$DbName-$timestamp.sql"
$zipPath = Join-Path $backupDir "$DbName-$timestamp.zip"

Write-Log "Starting database backup for $DbName at ${DbHost}:$DbPort"

$oldMysqlPwd = $env:MYSQL_PWD
$env:MYSQL_PWD = $DbPassword

try {
    $args = @(
        "--host=$DbHost",
        "--port=$DbPort",
        "--user=$DbUser",
        '--ssl-mode=REQUIRED',
        '--single-transaction',
        '--routines',
        '--triggers',
        '--events',
        '--hex-blob',
        '--column-statistics=0',
        $DbName
    )

    & $mysqldump @args | Set-Content -LiteralPath $sqlPath -Encoding UTF8
    if ($LASTEXITCODE -ne 0) {
        throw "mysqldump failed with exit code $LASTEXITCODE"
    }

    Compress-Archive -LiteralPath $sqlPath -DestinationPath $zipPath -Force
    Remove-Item -LiteralPath $sqlPath -Force

    $sizeMb = [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
    Write-Log "Backup created: $zipPath ($sizeMb MB)"

    $keepCount = if ($BackupKeepCount) { [int]$BackupKeepCount } else { 30 }
    Get-ChildItem -LiteralPath $backupDir -Filter "$DbName-*.zip" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $keepCount |
        Remove-Item -Force

    Write-Log "Backup rotation complete. Keeping latest $keepCount backups."
} finally {
    if ($null -ne $oldMysqlPwd) {
        $env:MYSQL_PWD = $oldMysqlPwd
    } else {
        Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    }
}
