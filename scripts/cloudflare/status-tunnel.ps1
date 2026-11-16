# Read-only status for the protected staging tunnel and Access application.
$ErrorActionPreference = "Stop"
$cfg = @{}
Get-Content "C:\NaijaDeals-Automation\config\cloudflare.env" | ForEach-Object {
  if ($_ -match '^([^#][^=]*)=(.*)$') { $cfg[$matches[1]] = $matches[2] }
}
$origin = try { (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3200/api/health" -TimeoutSec 5).StatusCode } catch { "down" }
$proc = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'tunnel run' })
Write-Output "origin: $origin; tunnel processes: $($proc.Count)"
if ($cfg["CLOUDFLARE_STAGING_API_TOKEN"] -and $cfg["CLOUDFLARE_ACCOUNT_ID"] -and $cfg["CLOUDFLARE_TUNNEL_ID"]) {
  $headers = @{ Authorization = "Bearer $($cfg['CLOUDFLARE_STAGING_API_TOKEN'])" }
  try {
    $tunnel = Invoke-RestMethod -Headers $headers "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/cfd_tunnel/$($cfg['CLOUDFLARE_TUNNEL_ID'])"
    Write-Output "tunnel: status=$($tunnel.result.status) connections=$($tunnel.result.connections.Count)"
    $apps = Invoke-RestMethod -Headers $headers "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps"
    $app = $apps.result | Where-Object { $_.domain -eq "staging-remote.naijadeals.com" }
    Write-Output "access app: $(if ($app) { 'present' } else { 'absent' })"
    if ($app) {
      $policies = Invoke-RestMethod -Headers $headers "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps/$($app.id)/policies"
      Write-Output "access policies: allow=$(@($policies.result | Where-Object { $_.decision -eq 'allow' }).Count) total=$($policies.result.Count)"
    }
  } catch { Write-Output "cloudflare api check failed: $($_.Exception.Message)" }
}
try {
  $dns = Resolve-DnsName -Name staging-remote.naijadeals.com -ErrorAction Stop | Where-Object { $_.Type -in @("A","CNAME") }
  Write-Output "public DNS: $(($dns | ForEach-Object { "$($_.Type)=$($_.NameHost)$($_.IPAddress)" }) -join ',')"
} catch { Write-Output "public DNS: unresolved" }
