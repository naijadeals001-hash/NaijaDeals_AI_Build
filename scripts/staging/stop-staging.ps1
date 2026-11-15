# Stop the staging stack without touching the development environment.
. "$PSScriptRoot\common.ps1"

$map = Read-StagingEnv

# App: only the process serving the staging port.
$app = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($app) {
  Stop-Process -Id $app.OwningProcess -Force -ErrorAction SilentlyContinue
  Write-StagingEvent "app_stopped" @{ pid = $app.OwningProcess }
}

# n8n: only the process listening on the staging n8n port.
$n8n = Get-NetTCPConnection -LocalPort $N8nPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($n8n) {
  Stop-Process -Id $n8n.OwningProcess -Force -ErrorAction SilentlyContinue
  Write-StagingEvent "n8n_stopped" @{ pid = $n8n.OwningProcess }
}

# PostgreSQL: fast shutdown of the staging cluster only (C: data directory).
$env:PGPASSWORD = ($map["DATABASE_URL"] -replace '^.*://[^:]+:([^@]+)@.*$', '$1')
& (Join-Path $PgBin "pg_ctl.exe") -D $PgData -m fast -w stop | Out-Null
Write-StagingEvent "postgres_stopped" @{ data = $PgData }

Write-Output "staging stopped"
