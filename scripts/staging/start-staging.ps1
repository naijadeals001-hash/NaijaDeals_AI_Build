# Start the staging stack: PostgreSQL (D: data dir), n8n, then the built app.
# Idempotent: an already-running component is left alone.
. "$PSScriptRoot\common.ps1"

$map = Read-StagingEnv
Set-StagingProcessEnv $map
$pgLog = Join-Path (Get-StagingLog "postgres") "startup.log"

# 1. PostgreSQL
if (Test-Port 55432) {
  Write-StagingEvent "postgres_already_running" @{ port = 55432 }
} else {
  $env:PGPASSWORD = ($map["DATABASE_URL"] -replace '^.*://[^:]+:([^@]+)@.*$', '$1')
  & (Join-Path $PgBin "pg_ctl.exe") -D $PgData -l $pgLog -w start | Out-Null
  if (-not (Wait-Port 55432 30)) { throw "PostgreSQL did not start; see $pgLog" }
  Write-StagingEvent "postgres_started" @{ port = 55432; data = $PgData }
}
Assert-StagingDatabase | Out-Null

# 2. n8n (local only; no tunnel)
if (Test-Port $N8nPort) {
  Write-StagingEvent "n8n_already_running" @{ port = $N8nPort }
} else {
  $n8nCli = Join-Path $StagingRoot "n8n\node_modules\n8n\bin\n8n"
  if (Test-Path $n8nCli) {
    $env:N8N_USER_FOLDER = $map["N8N_USER_FOLDER"]
    $env:N8N_PORT = "$N8nPort"
    $env:N8N_HOST = "127.0.0.1"
    $env:N8N_ENCRYPTION_KEY = $map["N8N_ENCRYPTION_KEY"]
    $env:N8N_DIAGNOSTICS_ENABLED = "false"
    $env:N8N_PERSONALIZATION_ENABLED = "false"
    $env:N8N_SECURE_COOKIE = "false"
    $env:N8N_BASIC_AUTH_ACTIVE = "true"
    $env:N8N_BASIC_AUTH_USER = "staging"
    $env:N8N_BASIC_AUTH_PASSWORD = $map["n8nBasicPassword"]
    Start-Process -FilePath "node" -ArgumentList "`"$n8nCli`" start" `
      -RedirectStandardOutput (Join-Path (Get-StagingLog "n8n") "stdout.log") `
      -RedirectStandardError (Join-Path (Get-StagingLog "n8n") "stderr.log") `
      -WindowStyle Hidden | Out-Null
    if (Wait-Port $N8nPort 90) { Write-StagingEvent "n8n_started" @{ port = $N8nPort } }
    else { Write-StagingEvent "n8n_failed" @{ port = $N8nPort } }
  } else {
    Write-StagingEvent "n8n_not_installed" @{ path = $n8nCli }
  }
}

# 3. Application (production build, staging port)
if (Test-Port $AppPort) {
  Write-StagingEvent "app_already_running" @{ port = $AppPort }
} else {
  if (-not (Test-Path (Join-Path $AppDir ".next\BUILD_ID"))) { throw "No production build in $AppDir; run 'npm run build' there first." }
  $env:PORT = "$AppPort"
  $env:DATABASE_URL = $map["DATABASE_URL"]
  Start-Process -FilePath "npx" -ArgumentList "next start -p $AppPort" -WorkingDirectory $AppDir `
    -RedirectStandardOutput (Join-Path (Get-StagingLog "app") "stdout.log") `
    -RedirectStandardError (Join-Path (Get-StagingLog "app") "stderr.log") `
    -WindowStyle Hidden | Out-Null
  if (-not (Wait-Port $AppPort 60)) { throw "App did not start on $AppPort; see logs/app/stdout.log" }
  Write-StagingEvent "app_started" @{ port = $AppPort; buildId = (Get-Content (Join-Path $AppDir ".next\BUILD_ID") -Raw).Trim() }
}

Write-Output "staging up: app http://localhost:$AppPort, n8n http://127.0.0.1:$N8nPort, postgres 127.0.0.1:55432/$ExpectedDatabase"
