# Stop only the process listening on the local n8n port.
. "$PSScriptRoot\n8n-common.ps1"
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) { Write-Output "n8n is not running"; exit 0 }
Stop-Process -Id $conn.OwningProcess -Force
Write-Output "n8n stopped (pid $($conn.OwningProcess))"
