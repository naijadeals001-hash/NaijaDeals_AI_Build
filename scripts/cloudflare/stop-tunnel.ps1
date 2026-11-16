# Stop the staging tunnel without affecting other processes.
$ErrorActionPreference = "Stop"
$running = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'tunnel run' })
if ($running.Count -eq 0) { Write-Output "tunnel not running"; exit 0 }
foreach ($proc in $running) { Stop-Process -Id $proc.ProcessId -Force }
Write-Output "stopped $($running.Count) tunnel process(es)"
