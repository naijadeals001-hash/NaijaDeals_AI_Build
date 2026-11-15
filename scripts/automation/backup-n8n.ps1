# Scheduled n8n backup with overlap protection. Writes encrypted copies to D:.
. "$PSScriptRoot\n8n-common.ps1"
$mutex = New-Object System.Threading.Mutex($false, "Global\NaijaDealsN8nBackup")
if (-not $mutex.WaitOne(0)) { Write-Output "backup already running"; exit 3 }
try {
  $node = Join-Path $Root "node24\node.exe"
  $script = Join-Path $Root "backup-n8n.mjs"
  if (-not (Test-Path $script)) { $script = "C:\Users\User\Documents\naijadeals.com\scripts\automation\backup-n8n.mjs" }
  $out = & $node $script 2>&1
  $code = $LASTEXITCODE
  $out | Add-Content (Join-Path $Root "n8n-backup.log")
  exit $code
} finally {
  $mutex.ReleaseMutex() | Out-Null
  $mutex.Dispose()
}
