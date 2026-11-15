. "$PSScriptRoot\n8n-common.ps1"
$running = Test-N8nPort
$db = Join-Path $Root "n8n-data\database.sqlite"
Write-Output ("port 5680: " + $(if ($running) { "listening" } else { "not running" }))
Write-Output ("config: " + $EnvFile + " (exists: " + (Test-Path $EnvFile) + ")")
Write-Output ("database: " + $db + " (exists: " + (Test-Path $db) + ")")
Write-Output "url: http://127.0.0.1:5680"
