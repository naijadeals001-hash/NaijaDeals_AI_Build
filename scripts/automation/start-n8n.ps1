# Idempotent start of the local n8n instance (localhost only, no tunnel).
. "$PSScriptRoot\n8n-common.ps1"
if (Test-N8nPort) { Write-Output "n8n already listening on http://127.0.0.1:$Port"; exit 0 }
Set-N8nEnv
if (-not (Test-Path $Node)) { throw "Node runtime missing: $Node" }
Start-Process -FilePath $Node -ArgumentList "`"$N8n`" start" -WorkingDirectory $Root `
  -RedirectStandardOutput (Join-Path $Root "n8n-stdout.log") `
  -RedirectStandardError (Join-Path $Root "n8n-stderr.log") -WindowStyle Hidden | Out-Null
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) { if (Test-N8nPort) { Write-Output "n8n started on http://127.0.0.1:$Port"; exit 0 }; Start-Sleep -Milliseconds 500 }
throw "n8n did not start; see n8n-stderr.log"
