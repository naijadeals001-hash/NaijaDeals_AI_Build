# Read-only status for the protected staging tunnel and Access application.
# It asserts the live policy, OTP binding and ingress; it does not print secrets
# or tester email addresses.
$ErrorActionPreference = "Stop"
$cfgPath = "C:\NaijaDeals-Automation\config\cloudflare.env"
$allowlistPath = "C:\NaijaDeals-Staging\secrets\cloudflare-access-allowlist.json"
$hashPath = Join-Path $PSScriptRoot "approved-testers.sha256"
$pidPath = "C:\NaijaDeals-Staging\run\cloudflared.pid"

$cfg = @{}
Get-Content $cfgPath | ForEach-Object {
  if ($_ -match '^([^#][^=]*)=(.*)$') { $cfg[$matches[1]] = $matches[2] }
}
$required = @("CLOUDFLARE_STAGING_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_ZONE_ID","CLOUDFLARE_TUNNEL_ID","CLOUDFLARE_ACCESS_APP_ID")
$missing = @($required | Where-Object { -not $cfg[$_] })
if ($missing.Count -gt 0) {
  Write-Output "cloudflare checks: BLOCKED (missing $($missing -join ', '))"
  exit 2
}

$allowlist = Get-Content $allowlistPath -Raw | ConvertFrom-Json
$approved = @($allowlist.policy.include | ForEach-Object { @($_.email.email) } | ForEach-Object { $_.Trim().ToLowerInvariant() } | Sort-Object)
if ($approved.Count -ne 3) { throw "Approved tester allowlist must contain exactly three addresses" }
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $computed = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($approved -join "`n")))).Replace("-", "").ToLowerInvariant()
} finally { $sha.Dispose() }
if ($computed -ne (Get-Content $hashPath -Raw).Trim()) { throw "Approved tester allowlist does not match the pinned hash" }

$origin = try { (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3200/api/health" -TimeoutSec 5).StatusCode } catch { "down" }
$tracked = "not tracked"
if (Test-Path $pidPath) {
  $tunnelPid = 0
  [void][int]::TryParse((Get-Content $pidPath -Raw).Trim(), [ref]$tunnelPid)
  $process = if ($tunnelPid -gt 0) { Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue } else { $null }
  $tracked = if ($process -and $process.ProcessName -eq "cloudflared") { "running PID $tunnelPid" } else { "stale PID $tunnelPid" }
}
$untracked = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'tunnel run' }).Count
Write-Output "origin: $origin; tracked tunnel: $tracked; cloudflared tunnel processes: $untracked"

$headers = @{ Authorization = "Bearer $($cfg['CLOUDFLARE_STAGING_API_TOKEN'])" }
function Invoke-Cf {
  param([string]$Url)
  Invoke-RestMethod -Headers $headers $Url
}
function Test-ExactPolicy {
  param($Policies)
  $items = @($Policies)
  if ($items.Count -ne 1) { return $false }
  $policy = $items[0]
  if ($policy.decision -ne "allow") { return $false }
  $includes = @($policy.include)
  if ($includes.Count -ne $approved.Count) { return $false }
  $seen = @()
  foreach ($rule in $includes) {
    $names = @($rule.PSObject.Properties.Name)
    if ($names.Count -ne 1 -or $names[0] -ne "email") { return $false }
    $email = $rule.email.email
    if ($email -isnot [string]) { return $false }
    $normalized = $email.Trim().ToLowerInvariant()
    if ($approved -notcontains $normalized) { return $false }
    if ($seen -contains $normalized) { return $false }
    $seen += $normalized
  }
  return ($seen.Count -eq $approved.Count)
}

$zone = Invoke-Cf "https://api.cloudflare.com/client/v4/zones/$($cfg['CLOUDFLARE_ZONE_ID'])"
Write-Output "zone: status=$($zone.result.status) nameservers=$(@($zone.result.name_servers) -join ',')"
$tunnel = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/cfd_tunnel/$($cfg['CLOUDFLARE_TUNNEL_ID'])"
Write-Output "tunnel: status=$($tunnel.result.status) connections=$(@($tunnel.result.connections).Count)"

$tunnelConfig = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/cfd_tunnel/$($cfg['CLOUDFLARE_TUNNEL_ID'])/configurations"
$ingress = @($tunnelConfig.result.config.ingress)
$ingressOk = $ingress.Count -eq 2 -and $ingress[0].hostname -eq "staging-remote.naijadeals.com" -and $ingress[0].service -eq "http://127.0.0.1:3200" -and -not $ingress[1].hostname -and $ingress[1].service -eq "http_status:404"
$ingressText = (($ingress | ForEach-Object { if ($_.hostname) { "$($_.hostname)->$($_.service)" } else { "(catch-all)->$($_.service)" } }) -join ',')
Write-Output "tunnel ingress: $ingressText"
if (-not $ingressOk) { throw "Tunnel ingress does not match the approved contract" }

$app = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps/$($cfg['CLOUDFLARE_ACCESS_APP_ID'])"
$idps = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/identity_providers"
$otp = @($idps.result | Where-Object { $_.type -eq "onetimepin" })
$allowedIdps = @($app.result.allowed_idps)
$otpBound = $otp.Count -eq 1 -and $allowedIdps.Count -eq 1 -and $allowedIdps[0] -eq $otp[0].id
$policies = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps/$($cfg['CLOUDFLARE_ACCESS_APP_ID'])/policies"
$policyOk = Test-ExactPolicy $policies.result
Write-Output "access app: domain=$($app.result.domain) otp_bound=$otpBound exact_allow_policy=$policyOk policies=$(@($policies.result).Count)"
if ($app.result.domain -ne "staging-remote.naijadeals.com" -or -not $otpBound -or -not $policyOk) { throw "Access app does not match the approved contract" }

$external = (& curl.exe -s -o NUL -w "%{http_code}" --max-time 15 https://staging-remote.naijadeals.com 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $external) { $external = "error" }
Write-Output "external: status=$external (expected 302 to Cloudflare Access)"
if ($external -ne 302) { throw "External hostname did not return the Access challenge" }

try {
  $dns = Resolve-DnsName -Name staging-remote.naijadeals.com -ErrorAction Stop | Where-Object { $_.Type -in @("A","CNAME") }
  Write-Output "public DNS: $(($dns | ForEach-Object { "$($_.Type)=$($_.NameHost)$($_.IPAddress)" }) -join ',')"
} catch { Write-Output "public DNS: unresolved" }
