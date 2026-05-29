$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot 'backend'
$envPath = Join-Path $backendDir '.env'
$schemaPath = Join-Path $backendDir 'database_schema.sql'
$mysqlExe = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'

if (-not (Test-Path -LiteralPath $mysqlExe)) {
    throw "MySQL command not found at $mysqlExe"
}

if (-not (Test-Path -LiteralPath $schemaPath)) {
    throw "Schema file not found at $schemaPath"
}

$securePassword = Read-Host 'Enter MySQL root password' -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

try {
    & $mysqlExe -u root "-p$plainPassword" -e "CREATE DATABASE IF NOT EXISTS bihar_skill_intern CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create database.' }

    Get-Content -LiteralPath $schemaPath -Raw | & $mysqlExe -u root "-p$plainPassword" bihar_skill_intern
    if ($LASTEXITCODE -ne 0) { throw 'Failed to import schema.' }

    $content = Get-Content -LiteralPath $envPath -Raw
    $updates = @{
        DB_HOST = 'localhost'
        DB_USER = 'root'
        DB_PASSWORD = $plainPassword
        DB_NAME = 'bihar_skill_intern'
        DB_PORT = '3306'
    }

    foreach ($key in $updates.Keys) {
        $value = $updates[$key]
        if ($content -match "(?m)^$key=") {
            $content = $content -replace "(?m)^$key=.*$", "$key=$value"
        } else {
            $content += "`r`n$key=$value"
        }
    }

    Set-Content -LiteralPath $envPath -Value $content -NoNewline
    Write-Host 'DONE: Database created, schema imported, and backend/.env updated.'
} finally {
    $plainPassword = $null
}
