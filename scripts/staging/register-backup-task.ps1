# Register the staging backup and staleness tasks with Windows Task Scheduler.
# - StartWhenAvailable: a missed run executes when the PC wakes or starts.
# - MultipleInstances IgnoreNew: no overlapping runs.
# - The script itself also holds a named mutex and retries up to 3 times.
$ErrorActionPreference = "Stop"
$root = "C:\NaijaDeals-Staging"
$backupScript = Join-Path $root "app\scripts\staging\backup-staging.ps1"
if (-not (Test-Path $backupScript)) { throw "Missing $backupScript" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# Daily at 02:00, and a midday run so an asleep PC still catches up quickly.
Register-ScheduledTask -TaskName "NaijaDeals-Staging-Backup-0200" -Action $action -Trigger (New-ScheduledTaskTrigger -Daily -At 2:00AM) `
  -Principal $principal -Settings $settings -Description "Encrypted staging PostgreSQL backup to Backblaze B2" -Force | Out-Null
Register-ScheduledTask -TaskName "NaijaDeals-Staging-Backup-1200" -Action $action -Trigger (New-ScheduledTaskTrigger -Daily -At 12:00PM) `
  -Principal $principal -Settings $settings -Description "Midday catch-up backup (StartWhenAvailable covers sleep)" -Force | Out-Null

Get-ScheduledTask -TaskName "NaijaDeals-Staging-Backup-*" |
  Select-Object TaskName, State |
  Format-Table -AutoSize |
  Out-String -Width 120
