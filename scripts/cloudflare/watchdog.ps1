# NaijaDeals protected staging access - local security watchdog.
#
# Purpose: while the named Cloudflare Tunnel is running, periodically verify
# that the Access gate and the tunnel ingress still match the approved
# contract. On a confirmed mismatch, stop ONLY the connector tracked by the
# existing PID file, write a local security hold that blocks start-tunnel.ps1,
# and emit a local alert. On an inability to verify, retry a bounded number of
# times and then fail closed the same way.
#
# It never creates or edits an Access application, policy, identity provider,
# DNS record or tunnel ingress. Every Cloudflare call is a GET.
#
# Secrets: the API token and tunnel token are read from the protected local
# config and are never printed, logged or written to state. The allowlist is
# compared by pinned hash; individual tester addresses are never emitted.
#
# Exit codes:
#   0 PASS (protection verified; no hold)
#   1 DRIFT (verified mismatch; tracked connector stopped and/or hold written)
#   2 UNVERIFIABLE (bounded retries exhausted; fail-closed action taken)
#   3 refused / busy / invalid invocation (no protection claim, no live action
#     except refusing to run)
#
# Modes:
#   (default)     one live verify-and-enforce cycle
#   -CheckOnly    one read-only verification; never stops or writes state
#   -Loop         repeat the enforce cycle every -IntervalSeconds (live only)
#   -ClearHold    re-verify live, then clear the hold only if every check passes
#   -Fixture      isolated mock mode for failure-path tests; requires -StateRoot
#                 and -LogRoot under a temporary directory, never the live one
[CmdletBinding()]
param(
  [switch]$CheckOnly,
  [switch]$Loop,
  [int]$IntervalSeconds = 60,
  [string]$Fixture,
  [string]$StateRoot,
  [string]$LogRoot,
  [switch]$ClearHold,
  [int]$Attempts = 3,
  [int]$RetryDelaySeconds = 5,
  [int]$ApiTimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "security-state.ps1")

$Hostname                = "staging-remote.naijadeals.com"
$ExpectedOrigin          = "http://127.0.0.1:3200"
$ExpectedSessionDuration = "8h"
$ForbiddenPorts          = @(3047, 3107, 3109, 5680, 55432)
$LiveStateRoot           = "C:\NaijaDeals-Staging\run"
$LiveLogRoot             = "C:\NaijaDeals-Staging\logs\security"
$StagingRoot             = "C:\NaijaDeals-Staging"
$LiveConfigPath          = "C:\NaijaDeals-Automation\config\cloudflare.env"
$CloudflaredPath         = "C:\cloudflared\cloudflared.exe"
$PinnedHashPath          = Join-Path $PSScriptRoot "approved-testers.sha256"
$TunnelLogPath           = "C:\NaijaDeals-Staging\logs\tunnel\stderr.log"

$MockMode = [bool]$Fixture
$script:CfTimeout = $ApiTimeoutSeconds

function Stop-WithRefusal([string]$Message) {
  Write-Output "watchdog: REFUSED $Message"
  exit 3
}

# --- invocation safety -------------------------------------------------------
if ($CheckOnly -and $ClearHold) { Stop-WithRefusal "-CheckOnly and -ClearHold are mutually exclusive" }
if ($ClearHold -and $MockMode) { Stop-WithRefusal "-ClearHold requires live mode; mock fixtures cannot clear a live hold" }
if ($ClearHold -and $Loop) { Stop-WithRefusal "-ClearHold is a one-shot operator action" }
if ($CheckOnly -and $Loop) { Stop-WithRefusal "-CheckOnly is a one-shot read-only action" }
if ($Loop -and $IntervalSeconds -lt 15) { Stop-WithRefusal "the live interval must be at least 15 seconds" }

if ($MockMode) {
  if (-not $StateRoot -or -not $LogRoot) { Stop-WithRefusal "mock mode requires -StateRoot and -LogRoot" }
  if ((Test-PathUnder -Path $StateRoot -Root $StagingRoot) -or (Test-PathUnder -Path $LogRoot -Root $StagingRoot)) {
    Stop-WithRefusal "mock state and log roots must not be inside $StagingRoot"
  }
} else {
  if ($StateRoot -or $LogRoot) { Stop-WithRefusal "state/log overrides are mock-only; live paths are fixed" }
  if ($Attempts -ne 3 -or $RetryDelaySeconds -ne 5 -or $ApiTimeoutSeconds -ne 10) {
    Stop-WithRefusal "retry/timeout overrides are mock-only; the live retry bound is fixed at 3 attempts, 5 s delay, 10 s timeout"
  }
}

$paths = if ($MockMode) {
  Get-SecurityStatePaths -StateRoot $StateRoot -LogRoot $LogRoot
} else {
  Get-SecurityStatePaths -StateRoot $LiveStateRoot -LogRoot $LiveLogRoot
}
$mockRoot = if ($MockMode) { (Resolve-SecurityPath $StateRoot) } else { $null }

# --- small helpers -----------------------------------------------------------
function Add-Reason {
  param($List, [string]$Code)
  if (-not $List.Contains($Code)) { $List.Add($Code) }
}

function Get-CanonicalAllowlistHash {
  param([string[]]$Emails)
  [string[]]$norm = @($Emails | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() })
  [System.Array]::Sort($norm, [System.StringComparer]::Ordinal)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($norm -join "`n"))
    return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Test-HostnameCovered {
  param([string]$Domain, [string]$HostnameToCheck)
  if (-not $Domain) { return $false }
  $d = $Domain.Trim().ToLowerInvariant()
  $h = $HostnameToCheck.ToLowerInvariant()
  if ($d -eq "*") { return $true }
  if ($d -eq $h) { return $true }
  if ($d.StartsWith("*.")) {
    $suffix = $d.Substring(2)
    return $h.EndsWith("." + $suffix)
  }
  return $false
}

function Read-ProtectedConfig {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "config_incomplete:file_absent" }
  $cfg = @{}
  try {
    Get-Content -LiteralPath $Path | ForEach-Object {
      if ($_ -match '^([^#][^=]*)=(.*)$') { $cfg[$matches[1]] = $matches[2].Trim() }
    }
  } catch {
    throw "config_incomplete:unreadable"
  }
  $required = @(
    "CLOUDFLARE_STAGING_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_ZONE_ID",
    "CLOUDFLARE_TUNNEL_ID",
    "CLOUDFLARE_TUNNEL_TOKEN",
    "CLOUDFLARE_ACCESS_APP_ID"
  )
  $missing = @($required | Where-Object { -not $cfg[$_] })
  if ($missing.Count -gt 0) { throw ("config_incomplete:" + ($missing -join "+")) }
  [pscustomobject]@{
    ApiToken     = $cfg["CLOUDFLARE_STAGING_API_TOKEN"]
    AccountId    = $cfg["CLOUDFLARE_ACCOUNT_ID"]
    ZoneId       = $cfg["CLOUDFLARE_ZONE_ID"]
    TunnelId     = $cfg["CLOUDFLARE_TUNNEL_ID"]
    TunnelToken  = $cfg["CLOUDFLARE_TUNNEL_TOKEN"]
    AccessAppId  = $cfg["CLOUDFLARE_ACCESS_APP_ID"]
  }
}

function Read-PinnedHash {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "pinned_allowlist_missing" }
  $value = (Get-Content -LiteralPath $Path -Raw).Trim().ToLowerInvariant()
  if ($value -notmatch '^[0-9a-f]{64}$') { throw "pinned_allowlist_invalid" }
  return $value
}

function Invoke-CfApi {
  param([string]$Url)
  $resp = Invoke-RestMethod -Method Get -Uri $Url -Headers $script:CfHeaders -TimeoutSec $script:CfTimeout -ErrorAction Stop
  if (-not ($resp.PSObject.Properties.Name -contains "success") -or -not $resp.success) {
    throw "api_failure"
  }
  return $resp
}

function Get-LiveModel {
  param($Config, [string]$ExpectedHash)
  $base = "https://api.cloudflare.com/client/v4"
  $script:CfHeaders = @{ Authorization = "Bearer $($Config.ApiToken)" }
  $zone = Invoke-CfApi "$base/zones/$($Config.ZoneId)"
  $apps = Invoke-CfApi "$base/accounts/$($Config.AccountId)/access/apps"
  $idps = Invoke-CfApi "$base/accounts/$($Config.AccountId)/access/identity_providers"
  $appList = @($apps.result | Where-Object { $_ })
  $app = $appList | Where-Object { $_.id -eq $Config.AccessAppId } | Select-Object -First 1
  $policies = if ($app) {
    Invoke-CfApi "$base/accounts/$($Config.AccountId)/access/apps/$($app.id)/policies"
  } else { $null }
  $tunnel = Invoke-CfApi "$base/accounts/$($Config.AccountId)/cfd_tunnel/$($Config.TunnelId)"
  $tunnelConfig = Invoke-CfApi "$base/accounts/$($Config.AccountId)/cfd_tunnel/$($Config.TunnelId)/configurations"
  [pscustomobject]@{
    Source                = "live"
    Config                = $Config
    ExpectedAllowlistHash = $ExpectedHash
    Zone                  = $zone.result
    Apps                  = $appList
    Idps                  = @($idps.result | Where-Object { $_ })
    Policies              = if ($policies) { @($policies.result | Where-Object { $_ }) } else { @() }
    Tunnel                = $tunnel.result
    TunnelConfig          = $tunnelConfig.result
    AfterStop             = $null
  }
}

function Get-FixtureModel {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "fixture_unreadable" }
  try {
    $fx = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "fixture_unreadable"
  }
  if ($fx.api -and $fx.api.apiError) { throw ("api_unavailable:simulated_" + [string]$fx.api.apiError) }
  $c = $fx.config
  if (-not $c -or -not $c.accountId -or -not $c.zoneId -or -not $c.accessAppId -or -not $c.tunnelId -or -not $c.tunnelToken) {
    throw "fixture_invalid:config"
  }
  if (-not $fx.expected -or -not $fx.expected.allowlistSha256) { throw "fixture_invalid:expected" }
  $config = [pscustomobject]@{
    ApiToken    = "fixture"
    AccountId   = [string]$c.accountId
    ZoneId      = [string]$c.zoneId
    TunnelId    = [string]$c.tunnelId
    TunnelToken = [string]$c.tunnelToken
    AccessAppId = [string]$c.accessAppId
  }
  [pscustomobject]@{
    Source                = "fixture"
    Config                = $config
    ExpectedAllowlistHash = ([string]$fx.expected.allowlistSha256).ToLowerInvariant()
    Zone                  = $fx.api.zone
    Apps                  = @($fx.api.apps | Where-Object { $_ })
    Idps                  = @($fx.api.idps | Where-Object { $_ })
    Policies              = @($fx.api.policies | Where-Object { $_ })
    Tunnel                = $fx.api.tunnel
    TunnelConfig          = $fx.api.tunnelConfig
    AfterStop             = $fx.api.afterStop
  }
}

function Get-TokenCheck {
  param([string]$Token, [string]$AccountId, [string]$TunnelId)
  $r = [ordered]@{
    Parse          = "failed"
    AccountMatch   = $false
    TunnelMatch    = $false
    SecretBytes    = $null
    ShapeValid     = $false
  }
  if (-not $Token) { return [pscustomobject]$r }
  try {
    $b64 = $Token.Replace('-', '+').Replace('_', '/')
    while ($b64.Length % 4 -ne 0) { $b64 += '=' }
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
    $obj = $json | ConvertFrom-Json -ErrorAction Stop
    if (($obj.a -isnot [string]) -or ($obj.t -isnot [string]) -or ($obj.s -isnot [string])) { return [pscustomobject]$r }
    $r.Parse = "ok"
    $r.AccountMatch = (([string]$obj.a).ToLowerInvariant() -eq $AccountId.ToLowerInvariant())
    $r.TunnelMatch = (([string]$obj.t).ToLowerInvariant() -eq $TunnelId.ToLowerInvariant())
    $r.ShapeValid = ([string]$obj.t -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    $s = ([string]$obj.s).Replace('-', '+').Replace('_', '/')
    while ($s.Length % 4 -ne 0) { $s += '=' }
    $r.SecretBytes = [Convert]::FromBase64String($s).Length
  } catch {
    $r.Parse = "failed"
    $r.AccountMatch = $false
    $r.TunnelMatch = $false
    $r.SecretBytes = $null
  }
  return [pscustomobject]$r
}

# --- verification ------------------------------------------------------------
function Invoke-Verification {
  param($Model)
  $reasons = New-Object System.Collections.Generic.List[string]
  $d = [ordered]@{}
  $cfg = $Model.Config
  $apps = @($Model.Apps)
  $idps = @($Model.Idps)
  $policies = @($Model.Policies)

  # Zone
  $d.zoneStatus = if ($Model.Zone) { [string]$Model.Zone.status } else { "unknown" }
  if ($d.zoneStatus -ne "active") { Add-Reason $reasons "zone_not_active" }

  # Access application coverage: exactly one app may cover the hostname, and it
  # must be the configured app. A wildcard app or a second app is a gate change.
  $covering = @()
  foreach ($app in $apps) {
    $domains = @()
    if ($app.domain) { $domains += [string]$app.domain }
    if ($app.self_hosted_domains) { $domains += @($app.self_hosted_domains | ForEach-Object { [string]$_ }) }
    if ($app.destinations) {
      foreach ($dest in @($app.destinations)) {
        if ($dest -and $dest.uri) { $domains += [string]$dest.uri }
      }
    }
    if (@($domains | Where-Object { Test-HostnameCovered -Domain $_ -HostnameToCheck $Hostname }).Count -gt 0) {
      $covering += $app
    }
  }
  $configured = $apps | Where-Object { $_.id -eq $cfg.AccessAppId } | Select-Object -First 1
  $d.accessAppCount = $apps.Count
  $d.accessAppDomain = if ($configured) { [string]$configured.domain } else { $null }
  $d.accessAppType = if ($configured) { [string]$configured.type } else { $null }
  if (-not $configured) { Add-Reason $reasons "access_app_missing" }
  if ($covering.Count -gt 1) {
    Add-Reason $reasons "access_app_ambiguous"
  } elseif ($covering.Count -eq 1 -and $configured -and $covering[0].id -ne $cfg.AccessAppId) {
    Add-Reason $reasons "access_app_id_mismatch"
  }
  if ($configured) {
    if (([string]$configured.domain).ToLowerInvariant() -ne $Hostname) { Add-Reason $reasons "access_app_domain_mismatch" }
    if (([string]$configured.type) -ne "self_hosted") { Add-Reason $reasons "access_app_type" }
    if ($configured.PSObject.Properties.Name -contains "self_hosted_domains") {
      $shd = @($configured.self_hosted_domains | ForEach-Object { ([string]$_).ToLowerInvariant() })
      if ($shd.Count -ne 1 -or $shd[0] -ne $Hostname) { Add-Reason $reasons "access_app_extra_domain" }
    }
    if ($configured.PSObject.Properties.Name -contains "destinations") {
      $dests = @($configured.destinations | Where-Object { $_ })
      if ($dests.Count -lt 1) { Add-Reason $reasons "access_app_extra_domain" }
      foreach ($dest in $dests) {
        if (-not $dest.uri -or ([string]$dest.type) -ne "public" -or ([string]$dest.uri).ToLowerInvariant() -ne $Hostname) {
          Add-Reason $reasons "access_app_extra_domain"
        }
      }
    }
    $d.sessionDuration = if ($configured.PSObject.Properties.Name -contains "session_duration") { [string]$configured.session_duration } else { $null }
    if ($d.sessionDuration -ne $ExpectedSessionDuration) { Add-Reason $reasons "access_session_duration" }
    if ($configured.PSObject.Properties.Name -contains "http_only_cookie_attribute" -and $configured.http_only_cookie_attribute -ne $true) {
      Add-Reason $reasons "access_cookie_policy"
    }
    if ($configured.PSObject.Properties.Name -contains "same_site_cookie_attribute" -and [string]$configured.same_site_cookie_attribute -ne "lax") {
      Add-Reason $reasons "access_cookie_policy"
    }
    if ($configured.PSObject.Properties.Name -contains "options_preflight_bypass" -and $configured.options_preflight_bypass -ne $false) {
      Add-Reason $reasons "access_preflight_bypass"
    }
    if ($configured.PSObject.Properties.Name -contains "enabled" -and $configured.enabled -ne $true) {
      Add-Reason $reasons "access_app_disabled"
    }
  } else {
    $d.sessionDuration = $null
  }

  # One-time PIN must be the only bound identity provider.
  $otp = @($idps | Where-Object { $_.type -eq "onetimepin" })
  $d.otpProviderCount = $otp.Count
  if ($otp.Count -ne 1) { Add-Reason $reasons "otp_provider_count" }
  if ($configured) {
    $allowed = @($configured.allowed_idps | Where-Object { $_ })
    $d.otpBound = ($otp.Count -eq 1 -and $allowed.Count -eq 1 -and $allowed[0] -eq $otp[0].id)
    if (-not $d.otpBound) { Add-Reason $reasons "otp_binding_mismatch" }
  } else {
    $d.otpBound = $false
  }

  # Exactly one Allow policy, exactly three email-only includes, and a hash
  # match against the pinned approved-tester digest.
  $d.policyCount = $policies.Count
  if ($policies.Count -ne 1) { Add-Reason $reasons "policy_count" }
  $policy = if ($policies.Count -ge 1) { $policies[0] } else { $null }
  $emails = @()
  if ($policy) {
    if (([string]$policy.decision).ToLowerInvariant() -ne "allow") { Add-Reason $reasons "policy_decision" }
    $includes = @($policy.include | Where-Object { $_ })
    $d.policyIncludeCount = $includes.Count
    if ($includes.Count -ne 3) { Add-Reason $reasons "policy_include_count" }
    $shapeOk = $true
    foreach ($rule in $includes) {
      $names = @($rule.PSObject.Properties.Name)
      if ($names.Count -ne 1 -or $names[0] -ne "email") { $shapeOk = $false; continue }
      $value = $rule.email
      if (-not $value) { $shapeOk = $false; continue }
      $inner = @($value.PSObject.Properties.Name)
      if ($inner.Count -ne 1 -or $inner[0] -ne "email" -or -not ($value.email -is [string])) { $shapeOk = $false; continue }
      $emails += [string]$value.email
    }
    if (-not $shapeOk) { Add-Reason $reasons "policy_include_shape" }
    $normalized = @($emails | ForEach-Object { $_.Trim().ToLowerInvariant() })
    if (@($normalized | Where-Object { $_ -notmatch '^[^@\s]+@[^@\s]+$' }).Count -gt 0) { Add-Reason $reasons "policy_include_shape" }
    if (@($normalized | Select-Object -Unique).Count -ne $normalized.Count) { Add-Reason $reasons "policy_include_duplicate" }
    $computed = Get-CanonicalAllowlistHash -Emails $normalized
    $d.allowlistHashMatch = ($computed -eq $Model.ExpectedAllowlistHash)
    if (-not $d.allowlistHashMatch) { Add-Reason $reasons "allowlist_hash_mismatch" }
  } else {
    $d.policyIncludeCount = 0
    $d.allowlistHashMatch = $false
  }

  # Tunnel identity, authority and ingress.
  $tunnel = $Model.Tunnel
  $tc = $Model.TunnelConfig
  $d.tunnelStatus = if ($tunnel) { [string]$tunnel.status } else { "missing" }
  $d.tunnelConnections = if ($tunnel) { @($tunnel.connections | Where-Object { $_ }).Count } else { 0 }
  if (-not $tunnel) {
    Add-Reason $reasons "tunnel_missing"
  } else {
    if (([string]$tunnel.id).ToLowerInvariant() -ne ([string]$cfg.TunnelId).ToLowerInvariant()) { Add-Reason $reasons "tunnel_id_mismatch" }
    if (($tunnel.PSObject.Properties.Name -contains "remote_config") -and $tunnel.remote_config -ne $true) { Add-Reason $reasons "tunnel_remote_config_disabled" }
    $d.tunnelConfigSource = if ($tunnel.PSObject.Properties.Name -contains "config_src") { [string]$tunnel.config_src } else { "unknown" }
    if ($d.tunnelConfigSource -ne "cloudflare") { Add-Reason $reasons "tunnel_config_source" }
  }
  if (-not $tc) {
    Add-Reason $reasons "tunnel_config_missing"
  } else {
    if ($tc.tunnel_id -and ([string]$tc.tunnel_id).ToLowerInvariant() -ne ([string]$cfg.TunnelId).ToLowerInvariant()) {
      Add-Reason $reasons "tunnel_config_tunnel_id"
    }
    if (($tc.PSObject.Properties.Name -contains "source") -and ([string]$tc.source) -ne "cloudflare") {
      Add-Reason $reasons "tunnel_config_source"
    }
    $ingress = @()
    if ($tc.config -and $tc.config.ingress) { $ingress = @($tc.config.ingress | Where-Object { $_ }) }
    $d.ingressCount = $ingress.Count
    if ($ingress.Count -ne 2) { Add-Reason $reasons "ingress_count" }
    if ($ingress.Count -ge 1) {
      if (([string]$ingress[0].hostname).ToLowerInvariant() -ne $Hostname) { Add-Reason $reasons "ingress_hostname" }
      if (([string]$ingress[0].service) -ne $ExpectedOrigin) { Add-Reason $reasons "ingress_service" }
    }
    if ($ingress.Count -ge 2) {
      $catchAll = $ingress[$ingress.Count - 1]
      if ($catchAll.hostname) { Add-Reason $reasons "ingress_catchall" }
      if (([string]$catchAll.service) -ne "http_status:404") { Add-Reason $reasons "ingress_catchall" }
    }
    foreach ($entry in $ingress) {
      $service = [string]$entry.service
      if ($service -and $service -ne $ExpectedOrigin -and $service -ne "http_status:404") { Add-Reason $reasons "ingress_service" }
      foreach ($port in $ForbiddenPorts) {
        if ($service -match (":" + $port + "(?:/|$|\?|:)")) { Add-Reason $reasons "ingress_forbidden_service" }
      }
      if ($service -match "^https?://" -and $service -notmatch "^https?://(127\.0\.0\.1|\[::1\]):") {
        Add-Reason $reasons "ingress_service"
      }
    }
    $d.warpRouting = $false
    if ($tc.config -and $tc.config.PSObject.Properties.Name -contains "warp-routing") {
      $warp = $tc.config.'warp-routing'
      if ($warp -and $warp.enabled -eq $true) { $d.warpRouting = $true; Add-Reason $reasons "warp_routing_enabled" }
    }
    $d.ingress = (($ingress | ForEach-Object {
      if ($_.hostname) { "$($_.hostname)->$($_.service)" } else { "(catch-all)->$($_.service)" }
    }) -join ",")
  }

  # Local token/ID association. The token is decoded in memory; only booleans
  # and lengths are emitted. A token minted for another account or tunnel is a
  # contract failure.
  $token = Get-TokenCheck -Token $cfg.TunnelToken -AccountId $cfg.AccountId -TunnelId $cfg.TunnelId
  $d.tokenParse = $token.Parse
  $d.tokenAccountMatch = $token.AccountMatch
  $d.tokenTunnelMatch = $token.TunnelMatch
  $d.tokenSecretBytes = $token.SecretBytes
  if ($token.Parse -ne "ok") { Add-Reason $reasons "token_unparseable" }
  elseif (-not $token.ShapeValid) { Add-Reason $reasons "token_unparseable" }
  else {
    if (-not $token.AccountMatch) { Add-Reason $reasons "token_account_mismatch" }
    if (-not $token.TunnelMatch) { Add-Reason $reasons "token_tunnel_mismatch" }
    if ($null -eq $token.SecretBytes -or $token.SecretBytes -lt 32) { Add-Reason $reasons "token_secret_invalid" }
  }

  # Optional credential file is never required for token-run, but if it exists
  # its identity must agree with the configured tunnel and account.
  $d.credentialsFile = "skipped_mock"
  if ($Model.Source -eq "live") {
    $credPath = Join-Path $env:USERPROFILE ".cloudflared\$($cfg.TunnelId).json"
    $d.credentialsFile = "absent"
    if (Test-Path -LiteralPath $credPath) {
      try {
        $cred = Get-Content -LiteralPath $credPath -Raw | ConvertFrom-Json -ErrorAction Stop
        if (([string]$cred.TunnelID).ToLowerInvariant() -eq ([string]$cfg.TunnelId).ToLowerInvariant() -and
            ([string]$cred.AccountTag).ToLowerInvariant() -eq ([string]$cfg.AccountId).ToLowerInvariant() -and
            $cred.TunnelSecret) {
          $d.credentialsFile = "match"
        } else {
          $d.credentialsFile = "mismatch"
          Add-Reason $reasons "credentials_file_mismatch"
        }
      } catch {
        $d.credentialsFile = "unreadable"
        Add-Reason $reasons "credentials_file_mismatch"
      }
    }
  }

  # Corroborating local evidence only; not a failure reason by itself.
  $d.connectorLog = "not_checked"
  if ($Model.Source -eq "live") {
    if (Test-Path -LiteralPath $TunnelLogPath) {
      try {
        $tail = Get-Content -LiteralPath $TunnelLogPath -Tail 400 -ErrorAction Stop
        $ids = @($tail | Select-String -Pattern 'tunnelID=([0-9a-fA-F-]{36})' -AllMatches |
          ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() } | Select-Object -Unique)
        if ($ids.Count -eq 0) { $d.connectorLog = "absent" }
        elseif ($ids -contains ([string]$cfg.TunnelId).ToLowerInvariant()) { $d.connectorLog = "match" }
        else { $d.connectorLog = "mismatch" }
      } catch {
        $d.connectorLog = "unreadable"
      }
    } else {
      $d.connectorLog = "absent"
    }
  }

  # The connector must be stoppable through the existing PID file whenever the
  # configured tunnel has live connections; otherwise a drift cannot be contained.
  $tracked = Get-TrackedTunnelProcess -PidPath $paths.PidFile -MockMode:$MockMode -MockRoot $mockRoot -ExpectedExecutable $CloudflaredPath
  $d.trackedState = $tracked.State
  $d.trackedPid = $tracked.Pid
  if ($tracked.State -ne "running" -and $d.tunnelConnections -gt 0) {
    Add-Reason $reasons "untracked_connector"
  }

  $status = if ($reasons.Count -eq 0) { "PASS" } else { "DRIFT" }
  [pscustomobject]@{
    Status      = $status
    ReasonCodes = @($reasons)
    Details     = $d
    Model       = $Model
    Tracked     = $tracked
    ErrorType   = $null
  }
}

function Invoke-VerificationWithRetry {
  param([string]$FixturePath, $Config, [string]$ExpectedHash, [string]$ConfigError, [string]$HashError, [int]$MaxAttempts, [int]$DelaySeconds)
  $last = $null
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      if (-not $FixturePath -and $ConfigError) { throw $ConfigError }
      if (-not $FixturePath -and $HashError) { throw $HashError }
      $model = if ($FixturePath) {
        Get-FixtureModel -Path $FixturePath
      } else {
        Get-LiveModel -Config $Config -ExpectedHash $ExpectedHash
      }
      return Invoke-Verification -Model $model
    } catch {
      $message = $_.Exception.Message
      $code = "api_unavailable"
      if ($message -match '^(config_incomplete|pinned_allowlist_missing|pinned_allowlist_invalid|token_missing|fixture_unreadable|fixture_invalid|api_unavailable)') {
        $code = $matches[1]
      }
      if ($FixturePath -and ($code -eq "fixture_unreadable" -or $code -eq "fixture_invalid")) { throw }
      $last = [pscustomobject]@{
        Status      = "UNVERIFIABLE"
        ReasonCodes = @($code)
        Details     = [ordered]@{ error = $message; attempt = $attempt; maxAttempts = $MaxAttempts }
        Model       = $null
        Tracked     = $null
        ErrorType   = $_.Exception.GetType().Name
      }
      if ($attempt -lt $MaxAttempts) { Start-Sleep -Seconds $DelaySeconds }
    }
  }
  return $last
}

# --- reporting ---------------------------------------------------------------
function Write-WatchdogSummary {
  param($Result, [string]$Prefix = "watchdog")
  $suffix = if ($Result.ReasonCodes.Count -gt 0) { " reason=" + ($Result.ReasonCodes -join ",") } else { "" }
  Write-Output ("{0}: {1}{2}" -f $Prefix, $Result.Status, $suffix)
  $d = $Result.Details
  if ($d -is [System.Collections.IDictionary] -and $d.Contains("error")) {
    Write-Output ("  error: {0} (attempt {1}/{2})" -f $d["error"], $d["attempt"], $d["maxAttempts"])
    return
  }
  Write-Output ("  access: zone={0} apps={1} domain={2} otp={3} policies={4} include={5} hash_match={6} session={7}" -f `
    $d.zoneStatus, $d.accessAppCount, $d.accessAppDomain, $d.otpBound, $d.policyCount, $d.policyIncludeCount, $d.allowlistHashMatch, $d.sessionDuration)
  Write-Output ("  token: parse={0} account_match={1} tunnel_match={2} secret_bytes={3} credentials_file={4}" -f `
    $d.tokenParse, $d.tokenAccountMatch, $d.tokenTunnelMatch, $d.tokenSecretBytes, $d.credentialsFile)
  Write-Output ("  tunnel: status={0} connections={1} config_src={2} ingress=[{3}] warp={4} connector_log={5}" -f `
    $d.tunnelStatus, $d.tunnelConnections, $d.tunnelConfigSource, $d.ingress, $d.warpRouting, $d.connectorLog)
  Write-Output ("  tracked: state={0} pid={1}" -f $d.trackedState, $d.trackedPid)
}

function Read-PreviousState {
  param([string]$StatePath)
  if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
  try { return (Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json -ErrorAction Stop) } catch { return $null }
}

function Test-StateChanged {
  param($Previous, [string]$Status, [string[]]$ReasonCodes)
  if (-not $Previous) { return $true }
  if ([string]$Previous.status -ne $Status) { return $true }
  $prev = @($Previous.reasonCodes | ForEach-Object { [string]$_ })
  $now = @($ReasonCodes | Sort-Object -Unique)
  return (($prev -join ",") -ne ($now -join ","))
}

function Write-CycleState {
  param($Paths, $Result, [string]$Mode, [string]$Action, $Residual, $Tracked, [bool]$HoldPresent)
  $state = [ordered]@{
    schemaVersion       = 1
    lastCycleAt         = (Get-Date).ToUniversalTime().ToString("o")
    mode                = $Mode
    status              = $Result.Status
    reasonCodes         = @($Result.ReasonCodes | Sort-Object -Unique)
    hold                = $HoldPresent
    action              = $Action
    residualConnections = $Residual
    trackedPid          = if ($Tracked) { $Tracked.Pid } else { $null }
    trackedState        = if ($Tracked) { $Tracked.State } else { "unknown" }
    details             = $Result.Details
  }
  Write-SecurityState -StatePath $Paths.StateFile -State $state
  return $state
}

# --- enforcement -------------------------------------------------------------
function Invoke-Enforcement {
  param($Result, $Paths, [string]$Mode, $FixtureAfterStop)
  $tracked = Get-TrackedTunnelProcess -PidPath $Paths.PidFile -MockMode:$MockMode -MockRoot $mockRoot -ExpectedExecutable $CloudflaredPath
  $reasons = New-Object System.Collections.Generic.List[string]
  foreach ($reason in @($Result.ReasonCodes)) { Add-Reason $reasons $reason }

  # Write the hold BEFORE stopping, so a crash between the two actions still
  # prevents start-tunnel.ps1 from restarting an unprotected tunnel.
  $holdWritten = $true
  $holdError = $null
  try {
    Write-SecurityHold -HoldPath $Paths.HoldFile -ReasonCodes @($reasons) -Action "stop_requested" | Out-Null
  } catch {
    $holdWritten = $false
    $holdError = $_.Exception.GetType().Name
  }

  $action = "none"
  $stopDetail = $null
  $pidRemoved = $false
  if ($tracked.State -eq "running") {
    $stop = Stop-TrackedTunnel -ProcessId $tracked.Pid -PidPath $Paths.PidFile -MockMode:$MockMode -MockRoot $mockRoot -ExpectedExecutable $CloudflaredPath -WaitSeconds 10
    if ($stop.Exited) {
      $action = "tracked_tunnel_stopped"
      try {
        Remove-Item -LiteralPath $Paths.PidFile -Force -ErrorAction Stop
        $pidRemoved = $true
      } catch {
        $stopDetail = "pid_file_remove_failed"
      }
    } elseif ($stop.Stopped) {
      $action = "tracked_tunnel_stop_timeout"
      $stopDetail = $stop.Reason
    } else {
      $action = "stop_refused"
      $stopDetail = $stop.Reason
    }
  } else {
    if ($tracked.State -in @("absent", "not_running")) {
      $action = "tracked_tunnel_absent"
    } else {
      # A PID file exists but does not identify a trustworthy connector. Never
      # kill it; keep the file for investigation and fail closed through the hold.
      $action = "stop_refused"
    }
    $stopDetail = $tracked.Reason
  }

  # After a stop, verify no other connector keeps the tunnel connected. The
  # watchdog never kills an untracked process; it reports the residual risk.
  $residual = $null
  if ($action -eq "tracked_tunnel_stopped") {
    if ($MockMode) {
      $residual = if ($FixtureAfterStop -and ($FixtureAfterStop.PSObject.Properties.Name -contains "connections")) {
        [int]$FixtureAfterStop.connections
      } else { 0 }
    } else {
      Start-Sleep -Seconds 3
      if ($script:CfConfig) {
        try {
          $t = Invoke-CfApi "https://api.cloudflare.com/client/v4/accounts/$($script:CfConfig.AccountId)/cfd_tunnel/$($script:CfConfig.TunnelId)"
          $residual = @($t.result.connections | Where-Object { $_ }).Count
        } catch {
          $residual = "unavailable"
        }
      } else {
        $residual = "unavailable"
      }
    }
    if ($residual -is [int] -and $residual -gt 0) { Add-Reason $reasons "residual_connections" }
  }

  try {
    Write-SecurityHold -HoldPath $Paths.HoldFile -ReasonCodes @($reasons) -Action $action | Out-Null
  } catch {
    $holdError = $_.Exception.GetType().Name
  }
  # The interlock is effective if a hold file exists, regardless of whether the
  # final update succeeded; the initial write may already have blocked restart.
  $holdWritten = Test-Path -LiteralPath $Paths.HoldFile

  $alert = [ordered]@{
    event               = "security_drift_detected"
    at                  = (Get-Date).ToUniversalTime().ToString("o")
    status              = $Result.Status
    reasonCodes         = @($reasons | Sort-Object -Unique)
    action              = $action
    stopDetail          = $stopDetail
    trackedPid          = $tracked.Pid
    trackedState        = $tracked.State
    residualConnections = $residual
    holdWritten         = $holdWritten
    holdError           = $holdError
    pidFileRemoved      = $pidRemoved
    note                = "local alert only; no email/SMS/pager sent"
  }
  try { Write-SecurityAlert -AlertPath $Paths.AlertFile -Alert $alert } catch { Write-Warning "watchdog: ALERT FILE WRITE FAILED" }
  $previous = Read-PreviousState -StatePath $Paths.StateFile
  $stateChanged = Test-StateChanged -Previous $previous -Status $Result.Status -ReasonCodes @($reasons)
  $actionChanged = (-not $previous) -or ([string]$previous.action -ne $action)
  if ($stateChanged -or $actionChanged) {
    try { Add-SecurityLog -LogPath $Paths.LogFile -Event $alert } catch { Write-Warning "watchdog: ALERT LOG WRITE FAILED" }
  }
  $state = Write-CycleState -Paths $Paths -Result $Result -Mode $Mode -Action $action -Residual $residual -Tracked $tracked -HoldPresent $holdWritten
  return [pscustomobject]@{
    Action      = $action
    StopDetail  = $stopDetail
    Residual    = $residual
    Reasons     = @($reasons)
    Tracked     = $tracked
    HoldWritten = $holdWritten
    HoldError   = $holdError
    State       = $state
  }
}

function Invoke-PassState {
  param($Result, $Paths, [string]$Mode)
  $hold = Get-SecurityHold -HoldPath $Paths.HoldFile
  $tracked = Get-TrackedTunnelProcess -PidPath $Paths.PidFile -MockMode:$MockMode -MockRoot $mockRoot -ExpectedExecutable $CloudflaredPath
  $previous = Read-PreviousState -StatePath $Paths.StateFile
  $state = Write-CycleState -Paths $Paths -Result $Result -Mode $Mode -Action "none" -Residual $null -Tracked $tracked -HoldPresent ($null -ne $hold)
  if ($previous -and ([string]$previous.status -ne "PASS")) {
    try {
      Add-SecurityLog -LogPath $Paths.LogFile -Event ([ordered]@{
        event       = "protection_restored"
        at          = (Get-Date).ToUniversalTime().ToString("o")
        status      = "PASS"
        holdPresent = ($null -ne $hold)
        note        = "verification passed; the hold is not cleared automatically"
      })
    } catch { Write-Warning "watchdog: STATE LOG WRITE FAILED" }
  }
  return $state
}

# --- main cycle --------------------------------------------------------------
function Invoke-Cycle {
  param([bool]$IsClearHold)
  $script:CycleExitCode = 3
  $modeName = if ($MockMode) { "mock" } else { "live" }
  $config = $null
  $expectedHash = $null
  $configError = $null
  $hashError = $null
  if (-not $MockMode) {
    try {
      $config = Read-ProtectedConfig -Path $LiveConfigPath
      $script:CfConfig = $config
    } catch {
      $configError = $_.Exception.Message
    }
    if (-not $configError) {
      try {
        $expectedHash = Read-PinnedHash -Path $PinnedHashPath
      } catch {
        $hashError = $_.Exception.Message
      }
    }
  }
  $result = $null
  try {
    $result = Invoke-VerificationWithRetry -FixturePath $Fixture -Config $config -ExpectedHash $expectedHash -ConfigError $configError -HashError $hashError -MaxAttempts $Attempts -DelaySeconds $RetryDelaySeconds
  } catch {
    Write-Output ("watchdog: REFUSED invalid fixture ({0}); no live action taken" -f $_.Exception.Message)
    $script:CycleExitCode = 3
    return
  }
  if (-not $result) {
    $result = [pscustomobject]@{
      Status      = "UNVERIFIABLE"
      ReasonCodes = @("verification_failed")
      Details     = [ordered]@{ error = "verification produced no result"; attempt = $Attempts; maxAttempts = $Attempts }
      Model       = $null
      Tracked     = $null
      ErrorType   = $null
    }
  }
  Write-WatchdogSummary -Result $result

  if ($CheckOnly) {
    $hold = Get-SecurityHold -HoldPath $paths.HoldFile
    if ($hold) {
      Write-Output ("watchdog: HOLD PRESENT reason=" + (@($hold.reasonCodes) -join ",") + " (not cleared by -CheckOnly)")
    } else {
      Write-Output "watchdog: HOLD absent; -CheckOnly made no changes"
    }
    if ($result.Status -eq "PASS") { $script:CycleExitCode = 0; return }
    if ($result.Status -eq "DRIFT") { $script:CycleExitCode = 1; return }
    $script:CycleExitCode = 2; return
  }

  if ($IsClearHold) {
    if ($result.Status -eq "PASS") {
      Remove-SecurityHold -HoldPath $paths.HoldFile
      if (Test-Path -LiteralPath $paths.AlertFile) { Remove-Item -LiteralPath $paths.AlertFile -Force -ErrorAction SilentlyContinue }
      $tracked = Get-TrackedTunnelProcess -PidPath $paths.PidFile -MockMode:$MockMode -MockRoot $mockRoot -ExpectedExecutable $CloudflaredPath
      Write-CycleState -Paths $paths -Result $result -Mode $modeName -Action "hold_cleared" -Residual $null -Tracked $tracked -HoldPresent $false | Out-Null
      try {
        Add-SecurityLog -LogPath $paths.LogFile -Event ([ordered]@{
          event  = "hold_cleared"
          at     = (Get-Date).ToUniversalTime().ToString("o")
          status = "PASS"
          note   = "operator cleared the hold after a full live verification"
        })
      } catch { Write-Warning "watchdog: STATE LOG WRITE FAILED" }
      Write-Output "watchdog: hold cleared after a passing live verification"
      $script:CycleExitCode = 0
      return
    }
    try {
      Add-SecurityLog -LogPath $paths.LogFile -Event ([ordered]@{
        event       = "hold_clear_refused"
        at          = (Get-Date).ToUniversalTime().ToString("o")
        status      = $result.Status
        reasonCodes = @($result.ReasonCodes | Sort-Object -Unique)
        note        = "verification did not pass; hold retained"
      })
    } catch { Write-Warning "watchdog: STATE LOG WRITE FAILED" }
    Write-Output "watchdog: hold retained; verification did not pass"
    if ($result.Status -eq "DRIFT") { $script:CycleExitCode = 1 } else { $script:CycleExitCode = 2 }
    return
  }

  if ($result.Status -eq "PASS") {
    Invoke-PassState -Result $result -Paths $paths -Mode $modeName | Out-Null
    $holdAfter = Get-SecurityHold -HoldPath $paths.HoldFile
    if ($holdAfter) {
      Write-Output ("watchdog: HOLD PRESENT reason=" + (@($holdAfter.reasonCodes) -join ",") + "; verification passes, but restart stays blocked until watchdog.ps1 -ClearHold passes")
    }
    $script:CycleExitCode = 0
    return
  }

  $enforcement = Invoke-Enforcement -Result $result -Paths $paths -Mode $modeName -FixtureAfterStop $(if ($result.Model) { $result.Model.AfterStop } else { $null })
  Write-Output ("watchdog: ACTION {0}{1}" -f $enforcement.Action, $(if ($enforcement.StopDetail) { " (" + $enforcement.StopDetail + ")" } else { "" }))
  if (-not $enforcement.HoldWritten) { Write-Output ("watchdog: HOLD WRITE FAILED ({0}) - restart interlock is NOT effective" -f $enforcement.HoldError) }
  Write-Output ("watchdog: ALERT {0} and {1}" -f $paths.AlertFile, $paths.LogFile)
  Write-Output "watchdog: restart is blocked until the drift is fixed and watchdog.ps1 -ClearHold passes"
  if ($result.Status -eq "DRIFT") { $script:CycleExitCode = 1 } else { $script:CycleExitCode = 2 }
}

# --- lock + dispatch ---------------------------------------------------------
$script:CycleExitCode = 3
if ($CheckOnly) {
  Invoke-Cycle -IsClearHold $false
  exit $script:CycleExitCode
}

$stateDir = Split-Path -Parent $paths.StateFile
if (-not (Test-Path -LiteralPath $stateDir)) { New-Item -ItemType Directory -Force -Path $stateDir | Out-Null }
$lock = $null
try {
  try {
    $lock = [System.IO.File]::Open($paths.LockFile, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch {
    Write-Output ("watchdog: BUSY another watchdog cycle holds {0}" -f $paths.LockFile)
    exit 3
  }

  if ($ClearHold) {
    Invoke-Cycle -IsClearHold $true
    exit $script:CycleExitCode
  }
  if ($Loop) {
    while ($true) {
      Invoke-Cycle -IsClearHold $false
      Write-Output ("watchdog: next cycle in {0}s" -f $IntervalSeconds)
      Start-Sleep -Seconds $IntervalSeconds
    }
  }
  Invoke-Cycle -IsClearHold $false
  exit $script:CycleExitCode
} finally {
  if ($lock) { $lock.Dispose() }
}
