# Encrypted staging backup: dump -> encrypt -> upload to B2 -> prune local.
# Overlap protection: a named mutex. Retries up to 3 times with backoff.
# Missed runs are visible: execution history in logs/events/staging.jsonl and
# the exit code recorded by Task Scheduler.
. "$PSScriptRoot\common.ps1"

$mutex = New-Object System.Threading.Mutex($false, "Global\NaijaDealsStagingBackup")
if (-not $mutex.WaitOne(0)) {
  Write-StagingEvent "backup_skipped_overlap" @{}
  exit 3
}

$started = Get-Date
$attempt = 0
$ok = $false
try {
  $map = Read-StagingEnv
  Set-StagingProcessEnv $map
  $env:BACKUP_STALE_HOURS = "36"
  $node = "node"
  $runner = Join-Path $AppDir "scripts\backup\run.mjs"

  while (-not $ok -and $attempt -lt 3) {
    $attempt++
    try {
      $out = & $node $runner backup 2>&1
      Write-StagingEvent "backup_created" @{ attempt = $attempt; output = ($out -join " ").Trim() }
      $up = & $node $runner upload 2>&1
      Write-StagingEvent "backup_uploaded" @{ attempt = $attempt; output = ($up -join " ").Trim() }
      & $node $runner check 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "staleness check failed after upload" }
      $ok = $true
    } catch {
      Write-StagingEvent "backup_attempt_failed" @{ attempt = $attempt; error = $_.Exception.Message }
      Start-Sleep -Seconds ([math]::Min(60, 10 * $attempt))
    }
  }
} finally {
  $mutex.ReleaseMutex() | Out-Null
  $mutex.Dispose()
}

# Report the real outcome to the operations scan. This is an alerting side
# channel: a failed POST is logged and never changes the backup's own result.
$runId = "staging-backup-" + $started.ToUniversalTime().ToString("yyyyMMddTHHmmssfff") + "Z-attempt$attempt"
$statusText = if ($ok) { "success" } else { "failure" }
$statusMessage = if ($ok) {
  "Staging backup completed successfully."
} else {
  "Staging backup failed after $attempt attempt(s)."
}
$reporter = Join-Path $PSScriptRoot "..\automation\report-backup-status.mjs"
if (Test-Path $reporter) {
  try {
    $alertOutput = & $node $reporter --run-id $runId --status $statusText --target staging-db --message $statusMessage 2>&1
    $alertExit = $LASTEXITCODE
    if ($alertExit -ne 0) {
      Write-StagingEvent "backup_status_alert_failed" @{ runId = $runId; exitCode = $alertExit; output = (($alertOutput -join " ").Trim()) }
    }
  } catch {
    Write-StagingEvent "backup_status_alert_failed" @{ runId = $runId; error = $_.Exception.Message }
  }
} else {
  Write-StagingEvent "backup_status_reporter_missing" @{ path = $reporter }
}

if ($ok) {
  Write-StagingEvent "backup_ok" @{ durationSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1) }
  exit 0
}
Write-StagingEvent "backup_failed" @{ attempts = $attempt }
exit 1
