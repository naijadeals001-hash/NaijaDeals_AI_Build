# Start the protected staging tunnel. Refuses unless the zone is active and the
# Access application exists; the token stays in the child environment, not in
# the command line or logs.
$ErrorActionPreference = "Stop"
$cfgPath = "C:\NaijaDeals-Automation\config\cloudflare.env"
$cfg = @{}
Get-Content $cfgPath | ForEach-Object {
  if ($_ -match '^([^#][^=]*)=(.*)$') { $cfg[$matches[1]] = $matches[2] }
}
foreach ($key in @("CLOUDFLARE_STAGING_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_ZONE_ID","CLOUDFLARE_TUNNEL_TOKEN","CLOUDFLARE_ACCESS_APP_ID")) {
  if (-not $cfg[$key]) { throw "Missing $key in protected Cloudflare config" }
}
$origin = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3200/api/health" -TimeoutSec 5
if ($origin.StatusCode -ne 200) { throw "Staging origin is not healthy" }
$headers = @{ Authorization = "Bearer $($cfg['CLOUDFLARE_STAGING_API_TOKEN'])" }
try {
  $zone = Invoke-RestMethod -Headers $headers "https://api.cloudflare.com/client/v4/zones/$($cfg['CLOUDFLARE_ZONE_ID'])"
  if ($zone.result.status -ne "active") { throw "Cloudflare zone is $($zone.result.status); nameserver migration approval is still required" }
  $app = Invoke-RestMethod -Headers $headers "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps/$($cfg['CLOUDFLARE_ACCESS_APP_ID'])"
  if ($app.result.domain -ne "staging-remote.naijadeals.com") { throw "Access application domain mismatch" }
  $policies = Invoke-RestMethod -Headers $headers "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps/$($cfg['CLOUDFLARE_ACCESS_APP_ID'])/policies"
  $allow = @($policies.result | Where-Object { $_.decision -eq "allow" })
  if ($allow.Count -ne 1) { throw "Access application must have exactly one Allow policy" }
} catch {
  throw "Protected startup refused: $($_.Exception.Message)"
}
$running = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'tunnel run' }
if ($running) { Write-Output "tunnel already running PID $($running.ProcessId)"; exit 0 }
$logDir = "C:\NaijaDeals-Staging\logs\tunnel"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$env:TUNNEL_TOKEN = $cfg["CLOUDFLARE_TUNNEL_TOKEN"]
try {
  Start-Process -FilePath "C:\cloudflared\cloudflared.exe" -ArgumentList "tunnel run" `
    -RedirectStandardOutput (Join-Path $logDir "stdout.log") `
    -RedirectStandardError (Join-Path $logDir "stderr.log") -WindowStyle Hidden | Out-Null
} finally {
  Remove-Item Env:TUNNEL_TOKEN -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 6
$proc = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'tunnel run' }
if (-not $proc) { throw "cloudflared did not start; inspect $logDir" }
Write-Output "tunnel started PID $($proc.ProcessId); verify with status-tunnel.ps1"
