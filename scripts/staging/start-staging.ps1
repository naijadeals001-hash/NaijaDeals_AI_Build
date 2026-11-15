# Start the staging stack on C:: PostgreSQL, n8n, then the built app.
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
  $n8nCli = "C:\NaijaDeals-Automation\n8n\node_modules\n8n\bin\n8n"
  if (Test-Path $n8nCli) {
    $env:N8N_USER_FOLDER = $map["N8N_USER_FOLDER"]
    $env:N8N_PORT = "$N8nPort"
    $env:N8N_HOST = "127.0.0.1"
    # n8n 2.x binds by N8N_LISTEN_ADDRESS; N8N_HOST only sets the public URL.
    $env:N8N_LISTEN_ADDRESS = "127.0.0.1"
    $env:N8N_ENCRYPTION_KEY = $map["N8N_ENCRYPTION_KEY"]
    $env:N8N_DIAGNOSTICS_ENABLED = "false"
    $env:N8N_PERSONALIZATION_ENABLED = "false"
    $env:N8N_SECURE_COOKIE = "false"
    # The schedule consumer authenticates with the same narrow token the app
    # expects, so a restarted n8n keeps draining without a manual env export.
    $env:AUTOMATION_CONSUMER_TOKEN = $map["AUTOMATION_CONSUMER_TOKEN"]
    $env:N8N_BASIC_AUTH_ACTIVE = "true"
    $env:N8N_BASIC_AUTH_USER = "staging"
    $env:N8N_BASIC_AUTH_PASSWORD = $map["n8nBasicPassword"]
    # The automation config owns the SQLite database path and the consumer
    # token. Without it n8n starts on an empty default database and the
    # published workflows disappear.
    $n8nConfig = "C:\NaijaDeals-Automation\config\n8n.env"
    if (Test-Path $n8nConfig) {
      Get-Content $n8nConfig | ForEach-Object {
        if ($_ -match '^([^#][^=]*)=(.*)$') { Set-Item -Path ("Env:" + $matches[1]) -Value $matches[2] }
      }
    }
    $n8nNode = "C:\NaijaDeals-Automation\node24\node.exe"
    if (-not (Test-Path $n8nNode)) { $n8nNode = "node" }
    Start-Process -FilePath $n8nNode -ArgumentList "`"$n8nCli`" start" -WorkingDirectory $StagingRoot `
      -RedirectStandardOutput (Join-Path (Get-StagingLog "n8n") "stdout.log") `
      -RedirectStandardError (Join-Path (Get-StagingLog "n8n") "stderr.log") `
      -WindowStyle Hidden | Out-Null
    if (Wait-Port $N8nPort 120) { Write-StagingEvent "n8n_started" @{ port = $N8nPort } }
    else { Write-StagingEvent "n8n_failed" @{ port = $N8nPort } }
  } else {
    Write-StagingEvent "n8n_not_installed" @{ path = $n8nCli }
  }
}

# 3. Application (production build, staging port)
if (Test-Port $AppPort) {
  Write-StagingEvent "app_already_running" @{ port = $AppPort }
} else {
  $buildIdFile = Join-Path $AppDir ".next\BUILD_ID"
  if (-not (Test-Path $buildIdFile)) { throw "No production build in $AppDir; build it first." }
  $nextBin = Join-Path $AppDir "node_modules\next\dist\bin\next"
  if (-not (Test-Path $nextBin)) { throw "next binary missing in $AppDir; install dependencies there." }
  $env:PORT = "$AppPort"
  $env:DATABASE_URL = $map["DATABASE_URL"]
  Start-Process -FilePath "node" -ArgumentList "`"$nextBin`" start -H 127.0.0.1 -p $AppPort" -WorkingDirectory $AppDir `
    -RedirectStandardOutput (Join-Path (Get-StagingLog "app") "stdout.log") `
    -RedirectStandardError (Join-Path (Get-StagingLog "app") "stderr.log") `
    -WindowStyle Hidden | Out-Null
  if (-not (Wait-Port $AppPort 60)) { throw "App did not start on $AppPort; see logs/app/stdout.log" }
  Write-StagingEvent "app_started" @{ port = $AppPort; buildId = (Get-Content $buildIdFile -Raw).Trim() }
}

Write-Output "staging up: app http://localhost:$AppPort, n8n http://127.0.0.1:$N8nPort, postgres 127.0.0.1:55432/$ExpectedDatabase"
