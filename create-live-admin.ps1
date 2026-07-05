$ErrorActionPreference = 'Stop'

$apiBase = 'https://bihar-skill-intern-backend.onrender.com/api'
$email = Read-Host 'Enter admin email'
$fullName = Read-Host 'Enter admin full name'
$securePassword = Read-Host 'Enter admin password' -AsSecureString
$setupKey = Read-Host 'Enter admin setup key if configured, otherwise press Enter'
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

try {
    $body = @{
        email = $email
        password = $plainPassword
        fullName = $fullName
    }

    if ($setupKey) {
        $body.setupKey = $setupKey
    }

    $body = $body | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$apiBase/auth/admin/register" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 90
    if ($response.success) {
        Write-Host 'DONE: Live admin account created successfully.'
        Write-Host "Admin email: $email"
    } else {
        Write-Host ($response | ConvertTo-Json -Depth 5)
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
} finally {
    $plainPassword = $null
    $setupKey = $null
}
