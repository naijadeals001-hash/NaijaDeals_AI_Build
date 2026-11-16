# Failure-path tests for the protected staging security watchdog.
#
# The tests never touch the live Cloudflare configuration, the live Access
# policy, the live tunnel or the live previews. They use:
#   - synthetic fixtures (fake account, tunnel, token and tester addresses);
#   - an isolated state/log root under %TEMP%;
#   - a copied cmd.exe named cloudflared.exe as the "tracked connector" so the
#     real stop path can be exercised without starting a second connector.
#
# Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cloudflare/watchdog-tests.ps1
#
# Exit 0 = all assertions passed. Exit 1 = at least one failed.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "security-state.ps1")

$Watchdog = Join-Path $PSScriptRoot "watchdog.ps1"
$Hostname = "staging-remote.naijadeals.com"
$Origin = "http://127.0.0.1:3200"
$Passed = 0
$Failed = 0
$MockPids = New-Object System.Collections.Generic.List[int]

$TempRoot = Join-Path $env:TEMP ("nd-cloudflare-watchdog-" + [guid]::NewGuid().ToString("N"))
$StateRoot = Join-Path $TempRoot "state"
$LogRoot = Join-Path $TempRoot "logs"
$FixtureRoot = Join-Path $TempRoot "fixtures"
$ToolDir = Join-Path $StateRoot "tools"
New-Item -ItemType Directory -Force -Path $StateRoot, $LogRoot, $FixtureRoot, $ToolDir | Out-Null

# A copied cmd.exe keeps the image name cloudflared.exe but lives under the
# isolated mock root, so the watchdog's live-mode executable pin still refuses
# to touch it and the mock-mode guard accepts it.
$MockExe = Join-Path $ToolDir "cloudflared.exe"
Copy-Item -LiteralPath (Join-Path $env:SystemRoot "System32\cmd.exe") -Destination $MockExe -Force

function Write-TestResult {
  param([string]$Name, [bool]$Ok, [string]$Detail = "")
  if ($Ok) {
    $script:Passed++
    Write-Output ("PASS  {0}" -f $Name)
  } else {
    $script:Failed++
    Write-Output ("FAIL  {0} {1}" -f $Name, $Detail)
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Name, [string]$Detail = "")
  Write-TestResult -Name $Name -Ok $Condition -Detail $Detail
}

function Assert-Equal {
  param($Expected, $Actual, [string]$Name)
  $ok = ([string]$Expected -eq [string]$Actual)
  Write-TestResult -Name $Name -Ok $ok -Detail ("(expected '$Expected', got '$Actual')")
}

function Assert-Match {
  param([string]$Text, [string]$Pattern, [string]$Name)
  $ok = $Text -match $Pattern
  Write-TestResult -Name $Name -Ok $ok -Detail ("(pattern '$Pattern' not found)")
}

function Get-TestHash {
  param([string[]]$Emails)
  [string[]]$norm = @($Emails | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() })
  [System.Array]::Sort($norm, [System.StringComparer]::Ordinal)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($norm -join "`n")))).Replace("-", "").ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function New-FakeTunnelToken {
  param([string]$AccountId, [string]$TunnelId)
  $secret = [Convert]::ToBase64String([byte[]](1..64 | ForEach-Object { 7 }))
  $json = [ordered]@{ a = $AccountId; t = $TunnelId; s = $secret } | ConvertTo-Json -Compress
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}

$AccountId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
$ZoneId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
$AppId = "11111111-2222-3333-4444-555555555555"
$OtpId = "99999999-8888-7777-6666-555555555555"
$TunnelId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
$OtherTunnelId = "ffffffff-0000-1111-2222-333333333333"
$Emails = @("alpha@example.test", "bravo@example.test", "charlie@example.test")
$ExpectedHash = Get-TestHash -Emails $Emails
$Token = New-FakeTunnelToken -AccountId $AccountId -TunnelId $TunnelId

function New-BaseFixture {
  $app = [ordered]@{
    id                           = $AppId
    domain                       = $Hostname
    self_hosted_domains          = @($Hostname)
    destinations                 = @([ordered]@{ type = "public"; uri = $Hostname })
    type                         = "self_hosted"
    session_duration             = "8h"
    allowed_idps                 = @($OtpId)
    http_only_cookie_attribute   = $true
    same_site_cookie_attribute   = "lax"
    options_preflight_bypass     = $false
    enabled                      = $true
  }
  $includes = @($Emails | ForEach-Object { [ordered]@{ email = [ordered]@{ email = $_ } } })
  return [ordered]@{
    config = [ordered]@{
      accountId   = $AccountId
      zoneId      = $ZoneId
      accessAppId = $AppId
      tunnelId    = $TunnelId
      tunnelToken = $Token
    }
    expected = [ordered]@{ allowlistSha256 = $ExpectedHash }
    api      = [ordered]@{
      zone   = [ordered]@{ status = "active" }
      apps   = @($app)
      idps   = @([ordered]@{ id = $OtpId; type = "onetimepin" })
      policies = @([ordered]@{
        decision = "allow"
        name     = "Approved staging testers"
        include  = $includes
        require  = @()
        exclude  = @()
      })
      tunnel = [ordered]@{
        id            = $TunnelId
        status        = "healthy"
        remote_config = $true
        config_src    = "cloudflare"
        connections   = @(@{}, @{}, @{}, @{})
      }
      tunnelConfig = [ordered]@{
        tunnel_id = $TunnelId
        source    = "cloudflare"
        config    = [ordered]@{
          ingress       = @(
            [ordered]@{ hostname = $Hostname; service = $Origin },
            [ordered]@{ service = "http_status:404" }
          )
          "warp-routing" = [ordered]@{ enabled = $false }
        }
      }
      afterStop = [ordered]@{ connections = 0 }
    }
  }
}

function New-Fixture {
  param([string]$Name, [scriptblock]$Mutate)
  $fixture = New-BaseFixture
  if ($Mutate) { & $Mutate $fixture }
  $path = Join-Path $FixtureRoot ("$Name.json")
  ($fixture | ConvertTo-Json -Depth 12) | Set-Content -LiteralPath $path -Encoding UTF8
  return $path
}

function Reset-State {
  foreach ($name in @("cloudflared.pid", "security-hold.json", "watchdog-state.json", "watchdog.lock")) {
    Remove-Item -LiteralPath (Join-Path $StateRoot $name) -Force -ErrorAction SilentlyContinue
  }
  foreach ($name in @("watchdog-alert.json", "watchdog-log.jsonl")) {
    Remove-Item -LiteralPath (Join-Path $LogRoot $name) -Force -ErrorAction SilentlyContinue
  }
}

function Start-MockTunnel {
  $proc = Start-Process -FilePath $MockExe -ArgumentList @("/c", "pause >nul & rem tunnel run") -PassThru -WindowStyle Hidden
  $MockPids.Add($proc.Id)
  for ($i = 0; $i -lt 30; $i++) {
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction SilentlyContinue
    if ($cim -and $cim.CommandLine -match "tunnel run") { return $proc }
    Start-Sleep -Milliseconds 100
  }
  throw "mock tunnel process $($proc.Id) did not expose the expected command line"
}

function Stop-MockTunnelTree {
  param([int]$ProcessId)
  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
    try { & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null } catch { }
  }
}

function Set-MockPidFile {
  param([int]$ProcessId)
  Set-Content -LiteralPath (Join-Path $StateRoot "cloudflared.pid") -Value $ProcessId -Encoding ASCII
}

function Invoke-Watchdog {
  param([string[]]$Arguments)
  $all = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Watchdog) + $Arguments
  $output = & powershell @all 2>&1
  return [pscustomobject]@{ Exit = $LASTEXITCODE; Output = (@($output) -join "`n") }
}

function Get-Hold {
  return Get-SecurityHold -HoldPath (Join-Path $StateRoot "security-hold.json")
}

function Get-Alert {
  $path = Join-Path $LogRoot "watchdog-alert.json"
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
}

function Get-TrackedState {
  return Get-TrackedTunnelProcess -PidPath (Join-Path $StateRoot "cloudflared.pid") -MockMode -MockRoot $StateRoot
}

function Get-LiveConnectorFingerprint {
  $rows = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq "C:\cloudflared\cloudflared.exe" } |
    ForEach-Object { "$($_.ProcessId):$($_.CreationDate.ToString('o'))" } | Sort-Object)
  return ($rows -join ",")
}

$baselineConnector = Get-LiveConnectorFingerprint
Write-Output ("baseline live connector: {0}" -f $(if ($baselineConnector) { $baselineConnector } else { "none" }))

# ---------------------------------------------------------------------------
# 1. Invocation and isolation guards
# ---------------------------------------------------------------------------
$r = Invoke-Watchdog -Arguments @("-StateRoot", "C:\NaijaDeals-Staging\run")
Assert-Equal 3 $r.Exit "guard: live path override refused"
Assert-Match $r.Output "mock-only" "guard: live path override explains the restriction"

$r = Invoke-Watchdog -Arguments @("-Attempts", "2")
Assert-Equal 3 $r.Exit "guard: live retry override refused"
Assert-Match $r.Output "retry/timeout overrides are mock-only" "guard: live retry override explains the fixed bound"

$r = Invoke-Watchdog -Arguments @("-Fixture", (New-Fixture -Name "healthy-guard" -Mutate $null), "-StateRoot", "C:\NaijaDeals-Staging\run", "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 3 $r.Exit "guard: mock state root inside staging refused"
Assert-Match $r.Output "must not be inside" "guard: mock state root refusal is explicit"

$healthy = New-Fixture -Name "healthy" -Mutate $null

Reset-State
$brokenFixture = Join-Path $FixtureRoot "broken.json"
Set-Content -LiteralPath $brokenFixture -Value "{not-json" -Encoding ASCII
$r = Invoke-Watchdog -Arguments @("-Fixture", $brokenFixture, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 3 $r.Exit "fixture: malformed fixture refused"
Assert-Match $r.Output "invalid fixture" "fixture: refusal message"
Assert-True ($null -eq (Get-Hold)) "fixture: no hold written"

# ---------------------------------------------------------------------------
# 2. Healthy path: pass, no stop, no hold
# ---------------------------------------------------------------------------
Reset-State
$mock = Start-MockTunnel
Set-MockPidFile -ProcessId $mock.Id
$r = Invoke-Watchdog -Arguments @("-Fixture", $healthy, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 0 $r.Exit "healthy: exit 0"
Assert-Match $r.Output "watchdog: PASS" "healthy: PASS status"
Assert-True ($null -ne (Get-Process -Id $mock.Id -ErrorAction SilentlyContinue)) "healthy: tracked mock connector still running"
Assert-True ($null -eq (Get-Hold)) "healthy: no hold written"
Assert-True (Test-Path -LiteralPath (Join-Path $StateRoot "cloudflared.pid")) "healthy: pid file preserved"
$state = Get-Content -LiteralPath (Join-Path $StateRoot "watchdog-state.json") -Raw | ConvertFrom-Json
Assert-Equal "PASS" $state.status "healthy: state file records PASS"
Assert-Equal "running" $state.trackedState "healthy: state file records the tracked connector"
Stop-MockTunnelTree -ProcessId $mock.Id

# ---------------------------------------------------------------------------
# 3. Confirmed drift: stop the tracked connector and hold
# ---------------------------------------------------------------------------
Reset-State
$mock = Start-MockTunnel
Set-MockPidFile -ProcessId $mock.Id
$driftIngress = New-Fixture -Name "drift-ingress" -Mutate {
  param($f)
  $f.api.tunnelConfig.config.ingress = @(
    [ordered]@{ hostname = $Hostname; service = $Origin },
    [ordered]@{ hostname = "n8n.naijadeals.com"; service = "http://127.0.0.1:5680" },
    [ordered]@{ service = "http_status:404" }
  )
}
$r = Invoke-Watchdog -Arguments @("-Fixture", $driftIngress, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 1 $r.Exit "drift: exit 1"
Assert-Match $r.Output "watchdog: DRIFT" "drift: DRIFT status"
Assert-True ($null -eq (Get-Process -Id $mock.Id -ErrorAction SilentlyContinue)) "drift: tracked mock connector stopped"
Assert-True (-not (Test-Path -LiteralPath (Join-Path $StateRoot "cloudflared.pid"))) "drift: pid file removed after confirmed exit"
$hold = Get-Hold
Assert-True ($null -ne $hold) "drift: hold written"
Assert-True (@($hold.reasonCodes) -contains "ingress_count") "drift: hold reason includes ingress_count"
Assert-True (@($hold.reasonCodes) -contains "ingress_forbidden_service") "drift: hold reason includes forbidden service"
Assert-Equal "tracked_tunnel_stopped" $hold.action "drift: hold action records the stop"
$alert = Get-Alert
Assert-True ($null -ne $alert) "drift: local alert written"
Assert-Equal "security_drift_detected" $alert.event "drift: alert event"
Assert-True (@($alert.reasonCodes) -contains "ingress_forbidden_service") "drift: alert carries the reason codes"
Assert-True (Test-Path -LiteralPath (Join-Path $LogRoot "watchdog-log.jsonl")) "drift: transition log written"
$state = Get-Content -LiteralPath (Join-Path $StateRoot "watchdog-state.json") -Raw | ConvertFrom-Json
Assert-Equal "DRIFT" $state.status "drift: state file records DRIFT"
Assert-True ($state.hold -eq $true) "drift: state file records the hold"

# Re-running while drift persists must not kill anything else or create a duplicate.
$r2 = Invoke-Watchdog -Arguments @("-Fixture", $driftIngress, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 1 $r2.Exit "drift repeat: still exit 1"
Assert-Match $r2.Output "tracked_tunnel_absent" "drift repeat: reports no tracked connector to stop"
Assert-True (Test-Path -LiteralPath (Join-Path $StateRoot "security-hold.json")) "drift repeat: hold retained"

# ---------------------------------------------------------------------------
# 4. CheckOnly is read-only
# ---------------------------------------------------------------------------
Reset-State
$mock = Start-MockTunnel
Set-MockPidFile -ProcessId $mock.Id
$r = Invoke-Watchdog -Arguments @("-CheckOnly", "-Fixture", $driftIngress, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 1 $r.Exit "checkonly: exit 1 on drift"
Assert-True ($null -ne (Get-Process -Id $mock.Id -ErrorAction SilentlyContinue)) "checkonly: mock connector not stopped"
Assert-True ($null -eq (Get-Hold)) "checkonly: no hold written"
Assert-True (-not (Test-Path -LiteralPath (Join-Path $StateRoot "watchdog-state.json"))) "checkonly: no state file written"
Assert-True (-not (Test-Path -LiteralPath (Join-Path $LogRoot "watchdog-alert.json"))) "checkonly: no alert written"
Assert-True (Test-Path -LiteralPath (Join-Path $StateRoot "cloudflared.pid")) "checkonly: pid file untouched"
Stop-MockTunnelTree -ProcessId $mock.Id

# ---------------------------------------------------------------------------
# 5. Unverifiable: bounded retries then fail closed
# ---------------------------------------------------------------------------
Reset-State
$mock = Start-MockTunnel
Set-MockPidFile -ProcessId $mock.Id
$unverifiable = New-Fixture -Name "unverifiable" -Mutate {
  param($f)
  $f.api.apiError = "timeout"
}
$r = Invoke-Watchdog -Arguments @("-Fixture", $unverifiable, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 2 $r.Exit "unverifiable: exit 2"
Assert-Match $r.Output "watchdog: UNVERIFIABLE" "unverifiable: UNVERIFIABLE status"
Assert-Match $r.Output "attempt 2/2" "unverifiable: bounded retry budget was consumed"
Assert-True ($null -eq (Get-Process -Id $mock.Id -ErrorAction SilentlyContinue)) "unverifiable: tracked mock connector stopped"
$hold = Get-Hold
Assert-True (@($hold.reasonCodes) -contains "api_unavailable") "unverifiable: hold reason api_unavailable"

# ---------------------------------------------------------------------------
# 6. Stale PID must never be killed
# ---------------------------------------------------------------------------
Reset-State
Set-Content -LiteralPath (Join-Path $StateRoot "cloudflared.pid") -Value $PID -Encoding ASCII
$staleFixture = New-Fixture -Name "drift-stale-pid" -Mutate {
  param($f)
  $f.api.tunnelConfig.config.ingress[0].service = "http://127.0.0.1:3107"
}
$r = Invoke-Watchdog -Arguments @("-Fixture", $staleFixture, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 1 $r.Exit "stale pid: exit 1"
Assert-True ($null -ne (Get-Process -Id $PID -ErrorAction SilentlyContinue)) "stale pid: unrelated test process not killed"
Assert-Match $r.Output "stop_refused" "stale pid: stop refused"
Assert-True (Test-Path -LiteralPath (Join-Path $StateRoot "cloudflared.pid")) "stale pid: pid file preserved for investigation"
Assert-True ($null -ne (Get-Hold)) "stale pid: hold written"

# ---------------------------------------------------------------------------
# 7. Connected tunnel without a tracked PID is an untracked connector
# ---------------------------------------------------------------------------
Reset-State
$r = Invoke-Watchdog -Arguments @("-Fixture", $healthy, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 1 $r.Exit "untracked: exit 1 while the tunnel is connected"
Assert-Match $r.Output "untracked_connector" "untracked: reason reported"
$hold = Get-Hold
Assert-Equal "tracked_tunnel_absent" $hold.action "untracked: no process was stopped"

# A stopped tunnel with no PID is a pass: nothing is exposed through it.
Reset-State
$noConnections = New-Fixture -Name "healthy-no-connections" -Mutate {
  param($f)
  $f.api.tunnel.status = "inactive"
  $f.api.tunnel.connections = @()
}
$r = Invoke-Watchdog -Arguments @("-Fixture", $noConnections, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 0 $r.Exit "stopped tunnel: exit 0"
Assert-True ($null -eq (Get-Hold)) "stopped tunnel: no hold"

# A passing cycle must not clear an existing hold automatically.
Reset-State
Write-SecurityHold -HoldPath (Join-Path $StateRoot "security-hold.json") -ReasonCodes @("prior_drift") -Action "tracked_tunnel_stopped" | Out-Null
$r = Invoke-Watchdog -Arguments @("-Fixture", $noConnections, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 0 $r.Exit "pass with hold: exit 0"
Assert-Match $r.Output "HOLD PRESENT" "pass with hold: warning printed"
$hold = Get-Hold
Assert-True ($null -ne $hold) "pass with hold: hold retained"
Assert-True (@($hold.reasonCodes) -contains "prior_drift") "pass with hold: original reasons retained"
$state = Get-Content -LiteralPath (Join-Path $StateRoot "watchdog-state.json") -Raw | ConvertFrom-Json
Assert-True ($state.hold -eq $true) "pass with hold: state records the hold"

# ---------------------------------------------------------------------------
# 8. Contract drift cases (each must fail closed)
# ---------------------------------------------------------------------------
function Invoke-DriftCase {
  param(
    [string]$Name,
    [scriptblock]$Mutate,
    [string]$ExpectedReason
  )
  Reset-State
  $mock = Start-MockTunnel
  Set-MockPidFile -ProcessId $mock.Id
  $fixture = New-Fixture -Name $Name -Mutate $Mutate
  $r = Invoke-Watchdog -Arguments @("-Fixture", $fixture, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
  $hold = Get-Hold
  Assert-Equal 1 $r.Exit ("drift/" + $Name + ": exit 1")
  Assert-True ($null -ne $hold) ("drift/" + $Name + ": hold written")
  if ($hold) {
    Assert-True (@($hold.reasonCodes) -contains $ExpectedReason) ("drift/" + $Name + ": reason " + $ExpectedReason)
  }
  Assert-True ($null -eq (Get-Process -Id $mock.Id -ErrorAction SilentlyContinue)) ("drift/" + $Name + ": tracked mock connector stopped")
  if ($null -ne (Get-Process -Id $mock.Id -ErrorAction SilentlyContinue)) { Stop-MockTunnelTree -ProcessId $mock.Id }
}

Invoke-DriftCase -Name "token-mismatch" -ExpectedReason "token_tunnel_mismatch" -Mutate {
  param($f)
  $f.config.tunnelToken = New-FakeTunnelToken -AccountId $AccountId -TunnelId $OtherTunnelId
}
Invoke-DriftCase -Name "warp-enabled" -ExpectedReason "warp_routing_enabled" -Mutate {
  param($f)
  $f.api.tunnelConfig.config.'warp-routing'.enabled = $true
}
Invoke-DriftCase -Name "second-wildcard-app" -ExpectedReason "access_app_ambiguous" -Mutate {
  param($f)
  $wild = [ordered]@{
    id = "22222222-3333-4444-5555-666666666666"
    domain = "*.naijadeals.com"
    self_hosted_domains = @("*.naijadeals.com")
    destinations = @([ordered]@{ type = "public"; uri = "*.naijadeals.com" })
    type = "self_hosted"
    session_duration = "8h"
    allowed_idps = @($OtpId)
    http_only_cookie_attribute = $true
    same_site_cookie_attribute = "lax"
  }
  $f.api.apps = @($f.api.apps[0], $wild)
}
Invoke-DriftCase -Name "session-duration" -ExpectedReason "access_session_duration" -Mutate {
  param($f)
  $f.api.apps[0].session_duration = "1 month"
}
Invoke-DriftCase -Name "policy-extra-email" -ExpectedReason "policy_include_count" -Mutate {
  param($f)
  $f.api.policies[0].include += [ordered]@{ email = [ordered]@{ email = "delta@example.test" } }
}
Invoke-DriftCase -Name "config-source-local" -ExpectedReason "tunnel_config_source" -Mutate {
  param($f)
  $f.api.tunnel.config_src = "local"
  $f.api.tunnelConfig.source = "local"
}
Invoke-DriftCase -Name "catchall-wrong" -ExpectedReason "ingress_catchall" -Mutate {
  param($f)
  $f.api.tunnelConfig.config.ingress[1].service = "http_status:200"
}
Invoke-DriftCase -Name "otp-unbound" -ExpectedReason "otp_binding_mismatch" -Mutate {
  param($f)
  $f.api.apps[0].allowed_idps = @("44444444-5555-6666-7777-888888888888")
}
Invoke-DriftCase -Name "postgres-ingress" -ExpectedReason "ingress_forbidden_service" -Mutate {
  param($f)
  $f.api.tunnelConfig.config.ingress = @(
    [ordered]@{ hostname = $Hostname; service = $Origin },
    [ordered]@{ hostname = "db.naijadeals.com"; service = "http://127.0.0.1:55432" },
    [ordered]@{ service = "http_status:404" }
  )
}
Invoke-DriftCase -Name "app-domain-mismatch" -ExpectedReason "access_app_domain_mismatch" -Mutate {
  param($f)
  $f.api.apps[0].domain = "staging-remote.example.test"
  $f.api.apps[0].self_hosted_domains = @("staging-remote.example.test")
  $f.api.apps[0].destinations = @([ordered]@{ type = "public"; uri = "staging-remote.example.test" })
}
Invoke-DriftCase -Name "app-extra-domain" -ExpectedReason "access_app_extra_domain" -Mutate {
  param($f)
  $f.api.apps[0].self_hosted_domains = @($Hostname, "*.naijadeals.com")
  $f.api.apps[0].destinations = @(
    [ordered]@{ type = "public"; uri = $Hostname },
    [ordered]@{ type = "public"; uri = "*.naijadeals.com" }
  )
}
Invoke-DriftCase -Name "policy-everyone" -ExpectedReason "policy_include_shape" -Mutate {
  param($f)
  $f.api.policies[0].include = @([ordered]@{ everyone = [ordered]@{} })
}

# ---------------------------------------------------------------------------
# 9. Lock and clear-hold guards
# ---------------------------------------------------------------------------
Reset-State
$mock = Start-MockTunnel
Set-MockPidFile -ProcessId $mock.Id
$lockPath = Join-Path $StateRoot "watchdog.lock"
$lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
  $r = Invoke-Watchdog -Arguments @("-Fixture", $healthy, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
} finally {
  $lockStream.Dispose()
}
Assert-Equal 3 $r.Exit "lock: busy exit 3"
Assert-Match $r.Output "BUSY" "lock: busy message"
Assert-True ($null -ne (Get-Process -Id $mock.Id -ErrorAction SilentlyContinue)) "lock: mock connector untouched"
Assert-True ($null -eq (Get-Hold)) "lock: no hold written"
Stop-MockTunnelTree -ProcessId $mock.Id

$r = Invoke-Watchdog -Arguments @("-ClearHold", "-Fixture", $healthy, "-StateRoot", $StateRoot, "-LogRoot", $LogRoot, "-Attempts", "2", "-RetryDelaySeconds", "0")
Assert-Equal 3 $r.Exit "clearhold: mock mode refused"
Assert-Match $r.Output "live mode" "clearhold: refusal explains the live requirement"

# ---------------------------------------------------------------------------
# 10. Shared hold helper (the start-tunnel interlock uses the same code)
# ---------------------------------------------------------------------------
$holdDir = Join-Path $TempRoot "hold-helper"
New-Item -ItemType Directory -Force -Path $holdDir | Out-Null
$holdPath = Join-Path $holdDir "security-hold.json"
$written = Write-SecurityHold -HoldPath $holdPath -ReasonCodes @("policy_include_count") -Action "test"
$read = Get-SecurityHold -HoldPath $holdPath
Assert-True ($null -ne $read) "hold helper: present hold is detected"
Assert-True (@($read.reasonCodes) -contains "policy_include_count") "hold helper: reason round-trips"
Set-Content -LiteralPath $holdPath -Value "{not-json" -Encoding ASCII
$corrupt = Get-SecurityHold -HoldPath $holdPath
Assert-True ($null -ne $corrupt) "hold helper: corrupt hold still blocks"
Assert-True ([bool]$corrupt.corrupt) "hold helper: corrupt hold is flagged"
Remove-SecurityHold -HoldPath $holdPath
Assert-True ($null -eq (Get-SecurityHold -HoldPath $holdPath)) "hold helper: cleared hold is absent"
Assert-True (Test-PathUnder -Path "C:\NaijaDeals-Staging\run\cloudflared.pid" -Root "C:\NaijaDeals-Staging\run") "path guard: live run path matches"
Assert-True (-not (Test-PathUnder -Path $StateRoot -Root "C:\NaijaDeals-Staging")) "path guard: temp root is outside staging"

# ---------------------------------------------------------------------------
# 10b. start-tunnel hold interlock, exercised on an isolated copy
# ---------------------------------------------------------------------------
$gateDir = Join-Path $TempRoot "gate"
New-Item -ItemType Directory -Force -Path $gateDir | Out-Null
$gateSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot "start-tunnel.ps1") -Raw
$gateText = $gateSource.Replace('$runDir = "C:\NaijaDeals-Staging\run"', ('$runDir = "' + $gateDir + '"'))
$gateText = $gateText.Replace('. (Join-Path $PSScriptRoot "security-state.ps1")', ('. "' + (Join-Path $PSScriptRoot "security-state.ps1") + '"'))
$gatePath = Join-Path $gateDir "start-tunnel.ps1"
Set-Content -LiteralPath $gatePath -Value $gateText -Encoding ASCII
Write-SecurityHold -HoldPath (Join-Path $gateDir "security-hold.json") -ReasonCodes @("test_hold") -Action "test" | Out-Null
$previousEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$out = & powershell -NoProfile -ExecutionPolicy Bypass -File $gatePath -CheckOnly 2>&1
$gateExit = $LASTEXITCODE
$ErrorActionPreference = $previousEap
$gateOutput = (@($out) -join "`n")
Assert-Equal 2 $gateExit "start gate: CheckOnly reports the hold as blocked"
Assert-Match $gateOutput "BLOCKED by security hold" "start gate: CheckOnly names the hold"
$previousEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$out = & powershell -NoProfile -ExecutionPolicy Bypass -File $gatePath 2>&1
$gateExit = $LASTEXITCODE
$ErrorActionPreference = $previousEap
$gateOutput = (@($out) -join "`n")
Assert-True ($gateExit -ne 0) "start gate: a normal start is refused while the hold exists"
Assert-Match $gateOutput "security hold present" "start gate: normal start explains the refusal"
Assert-True (-not (Test-Path -LiteralPath "C:\NaijaDeals-Staging\run\security-hold.json")) "start gate: live hold file untouched"

# ---------------------------------------------------------------------------
# 11. No duplicate connector / no live process change
# ---------------------------------------------------------------------------
$finalConnector = Get-LiveConnectorFingerprint
Assert-Equal $baselineConnector $finalConnector "connectors: live cloudflared fingerprint unchanged"
$mockLeftovers = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and (Test-PathUnder -Path $_.ExecutablePath -Root $StateRoot) })
Assert-Equal 0 $mockLeftovers.Count "connectors: no mock cloudflared process left behind"

# Cleanup
foreach ($mockPid in $MockPids) { Stop-MockTunnelTree -ProcessId $mockPid }
Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Output ""
Write-Output ("watchdog tests: {0} passed, {1} failed" -f $Passed, $Failed)
if ($Failed -eq 0) { exit 0 }
exit 1
