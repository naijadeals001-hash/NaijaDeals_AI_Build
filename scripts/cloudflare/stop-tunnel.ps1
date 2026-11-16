# Stop only the tunnel started by start-tunnel.ps1. The PID file prevents this
# script from killing an unrelated cloudflared process or another service.
$ErrorActionPreference = "Stop"
$pidPath = "C:\NaijaDeals-Staging\run\cloudflared.pid"
if (-not (Test-Path $pidPath)) {
  Write-Output "no tracked tunnel PID; nothing stopped"
  exit 0
}
$tunnelPid = 0
[void][int]::TryParse((Get-Content $pidPath -Raw).Trim(), [ref]$tunnelPid)
$proc = if ($tunnelPid -gt 0) { Get-CimInstance Win32_Process -Filter "ProcessId=$tunnelPid" -ErrorAction SilentlyContinue } else { $null }
if (-not $proc -or $proc.Name -ne "cloudflared.exe" -or $proc.CommandLine -notmatch 'tunnel run') {
  Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
  Write-Output "tracked process is not a cloudflared tunnel; nothing stopped"
  exit 0
}
Stop-Process -Id $tunnelPid -Force
Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
Write-Output "stopped tracked tunnel PID $tunnelPid"
