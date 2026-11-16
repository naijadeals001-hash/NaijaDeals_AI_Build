# Start the protected staging tunnel. Refuses unless the live zone, Access
# application, exact tester policy, OTP binding and tunnel ingress all match.
# The API token and tunnel token stay in the protected config or child
# environment; neither is written to the command line or this repository.
param([switch]$CheckOnly)
$ErrorActionPreference = "Stop"
$cfgPath = "C:\NaijaDeals-Automation\config\cloudflare.env"
$allowlistPath = "C:\NaijaDeals-Staging\secrets\cloudflare-access-allowlist.json"
$hashPath = Join-Path $PSScriptRoot "approved-testers.sha256"
$runDir = "C:\NaijaDeals-Staging\run"
$pidPath = Join-Path $runDir "cloudflared.pid"

$cfg = @{}
Get-Content $cfgPath | ForEach-Object {
  if ($_ -match '^([^#][^=]*)=(.*)$') { $cfg[$matches[1]] = $matches[2] }
}
foreach ($key in @("CLOUDFLARE_STAGING_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_ZONE_ID","CLOUDFLARE_TUNNEL_ID","CLOUDFLARE_TUNNEL_TOKEN","CLOUDFLARE_ACCESS_APP_ID")) {
  if (-not $cfg[$key]) { throw "Missing $key in protected Cloudflare config" }
}

$allowlist = Get-Content $allowlistPath -Raw | ConvertFrom-Json
[string[]]$approved = @($allowlist.policy.include | ForEach-Object { @($_.email.email) } | ForEach-Object { $_.Trim().ToLowerInvariant() })
if ($approved.Count -ne 3) { throw "Approved tester allowlist must contain exactly three addresses" }
# Canonical form: lowercase, ordinal sort, newline join (matches Node .sort()).
[System.Array]::Sort($approved, [System.StringComparer]::Ordinal)
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $computed = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($approved -join "`n")))).Replace("-", "").ToLowerInvariant()
} finally { $sha.Dispose() }
$pinned = (Get-Content $hashPath -Raw).Trim()
if ($computed -ne $pinned) { throw "Approved tester allowlist does not match the pinned hash" }

$origin = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3200/api/health" -TimeoutSec 5
if ($origin.StatusCode -ne 200) { throw "Staging origin is not healthy" }
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

try {
  $zone = Invoke-Cf "https://api.cloudflare.com/client/v4/zones/$($cfg['CLOUDFLARE_ZONE_ID'])"
  if ($zone.result.status -ne "active") { throw "Cloudflare zone is $($zone.result.status)" }

  $app = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps/$($cfg['CLOUDFLARE_ACCESS_APP_ID'])"
  if ($app.result.domain -ne "staging-remote.naijadeals.com") { throw "Access application domain mismatch" }
  $idps = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/identity_providers"
  $otp = @($idps.result | Where-Object { $_.type -eq "onetimepin" })
  if ($otp.Count -ne 1) { throw "Exactly one One-time PIN provider is required" }
  $allowedIdps = @($app.result.allowed_idps)
  if ($allowedIdps.Count -ne 1 -or $allowedIdps[0] -ne $otp[0].id) { throw "Access application must be bound only to the One-time PIN provider" }

  $policies = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/access/apps/$($cfg['CLOUDFLARE_ACCESS_APP_ID'])/policies"
  if (-not (Test-ExactPolicy $policies.result)) { throw "Access application is not exactly one Allow policy for the approved testers" }

  $tunnelConfig = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/cfd_tunnel/$($cfg['CLOUDFLARE_TUNNEL_ID'])/configurations"
  $ingress = @($tunnelConfig.result.config.ingress)
  if ($ingress.Count -ne 2) { throw "Tunnel ingress must contain exactly the staging hostname and a catch-all" }
  if ($ingress[0].hostname -ne "staging-remote.naijadeals.com" -or $ingress[0].service -ne "http://127.0.0.1:3200") { throw "Tunnel ingress hostname/service mismatch" }
  if ($ingress[1].hostname) { throw "Tunnel catch-all must not have a hostname" }
  if ($ingress[1].service -ne "http_status:404") { throw "Tunnel catch-all must be http_status:404" }
} catch {
  throw "Protected startup refused: $($_.Exception.Message)"
}

if ($CheckOnly) {
  Write-Output "startup checks: PASS (no process started)"
  exit 0
}

New-Item -ItemType Directory -Force -Path $runDir | Out-Null
if (Test-Path $pidPath) {
  $oldPid = 0
  [void][int]::TryParse((Get-Content $pidPath -Raw).Trim(), [ref]$oldPid)
  if ($oldPid -gt 0) {
    $old = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
  } else {
    $old = $null
  }
  if ($old -and $old.ProcessName -eq "cloudflared") {
    Write-Output "tracked tunnel already running PID $oldPid"
    exit 0
  }
  Remove-Item $pidPath -Force
}
$untracked = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'tunnel run' })
if ($untracked.Count -gt 0) {
  throw "An untracked cloudflared tunnel is already running; refusing to start a duplicate"
}

$logDir = "C:\NaijaDeals-Staging\logs\tunnel"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$env:TUNNEL_TOKEN = $cfg["CLOUDFLARE_TUNNEL_TOKEN"]
try {
  $proc = Start-Process -FilePath "C:\cloudflared\cloudflared.exe" -ArgumentList @("--no-autoupdate", "tunnel", "run") `
    -RedirectStandardOutput (Join-Path $logDir "stdout.log") `
    -RedirectStandardError (Join-Path $logDir "stderr.log") -WindowStyle Hidden -PassThru
} finally {
  Remove-Item Env:TUNNEL_TOKEN -ErrorAction SilentlyContinue
}
if (-not $proc) { throw "cloudflared did not return a process handle" }
Set-Content -Path $pidPath -Value $proc.Id
$healthy = $false
for ($attempt = 0; $attempt -lt 3; $attempt++) {
  Start-Sleep -Seconds 3
  $proc.Refresh()
  if ($proc.HasExited) { break }
  $state = Invoke-Cf "https://api.cloudflare.com/client/v4/accounts/$($cfg['CLOUDFLARE_ACCOUNT_ID'])/cfd_tunnel/$($cfg['CLOUDFLARE_TUNNEL_ID'])"
  if ($state.result.status -eq "healthy" -and @($state.result.connections).Count -gt 0) {
    $healthy = $true
    break
  }
}
if (-not $healthy) {
  Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
  throw "tunnel did not become healthy; inspect $logDir"
}
Write-Output "tunnel started PID $($proc.Id); status is healthy; verify with status-tunnel.ps1"
