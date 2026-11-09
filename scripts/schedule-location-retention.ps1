# Registers the nightly location-retention job with Windows Task Scheduler.
# Run once on the host, as the account that can reach PostgreSQL:
#   powershell -ExecutionPolicy Bypass -File scripts\schedule-location-retention.ps1
# This schedules the job on THIS host only; production scheduling is a deployment task.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "scripts\location-retention.cjs" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 02:30
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "NaijaDealsLocationRetention" -Action $action -Trigger $trigger -Settings $settings -Description "Deletes raw location pings older than the 30-day policy." -Force | Out-Null
Write-Output "Registered NaijaDealsLocationRetention (daily 02:30)."
