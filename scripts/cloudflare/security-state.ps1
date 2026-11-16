# Shared security-state helpers for the protected staging tunnel.
#
# These helpers read and write only non-secret state: a PID file, a hold file,
# a last-cycle state file, a lock file and a JSONL transition log. They never
# store or print the Access allowlist, the API token or the tunnel token.
#
# The live paths are fixed by the callers. The mock-mode callers must pass an
# isolated state root; watchdog.ps1 refuses the live root in mock mode.

function Get-SecurityStatePaths {
  param(
    [string]$StateRoot = "C:\NaijaDeals-Staging\run",
    [string]$LogRoot = "C:\NaijaDeals-Staging\logs\security"
  )
  [pscustomobject]@{
    StateRoot = $StateRoot
    LogRoot   = $LogRoot
    PidFile   = Join-Path $StateRoot "cloudflared.pid"
    HoldFile  = Join-Path $StateRoot "security-hold.json"
    StateFile = Join-Path $StateRoot "watchdog-state.json"
    LockFile  = Join-Path $StateRoot "watchdog.lock"
    AlertFile = Join-Path $LogRoot "watchdog-alert.json"
    LogFile   = Join-Path $LogRoot "watchdog-log.jsonl"
  }
}

function Resolve-SecurityPath {
  param([Parameter(Mandatory)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path).TrimEnd([char[]]@('\', '/'))
}

function Test-PathUnder {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Root
  )
  $p = (Resolve-SecurityPath $Path).ToLowerInvariant()
  $r = (Resolve-SecurityPath $Root).ToLowerInvariant()
  $sep = [System.IO.Path]::DirectorySeparatorChar
  return ($p -eq $r) -or $p.StartsWith($r + $sep)
}

function Get-SecurityHold {
  param([Parameter(Mandatory)][string]$HoldPath)
  if (-not (Test-Path -LiteralPath $HoldPath)) { return $null }
  try {
    $raw = Get-Content -LiteralPath $HoldPath -Raw -ErrorAction Stop
    if (-not $raw -or -not $raw.Trim()) { throw "empty hold file" }
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $obj -or -not (@($obj.PSObject.Properties.Name) -contains "status")) { throw "hold shape" }
    return $obj
  } catch {
    # A hold that exists but cannot be parsed must still block a restart.
    return [pscustomobject]@{
      schemaVersion = 0
      status        = "HOLD"
      createdAt     = $null
      updatedAt     = $null
      reasonCodes   = @("hold_file_unreadable")
      action        = "unknown"
      corrupt       = $true
    }
  }
}

function Write-SecurityHold {
  param(
    [Parameter(Mandatory)][string]$HoldPath,
    [Parameter(Mandatory)][string[]]$ReasonCodes,
    [Parameter(Mandatory)][string]$Action,
    [string]$Status = "HOLD"
  )
  $dir = Split-Path -Parent $HoldPath
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $existing = Get-SecurityHold -HoldPath $HoldPath
  $created = if ($existing -and -not $existing.corrupt -and $existing.createdAt) { $existing.createdAt } else { (Get-Date).ToUniversalTime().ToString("o") }
  $obj = [ordered]@{
    schemaVersion    = 1
    status           = $Status
    createdAt        = $created
    updatedAt        = (Get-Date).ToUniversalTime().ToString("o")
    reasonCodes      = @($ReasonCodes | Sort-Object -Unique)
    action           = $Action
    clearInstruction = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cloudflare/watchdog.ps1 -ClearHold"
  }
  $tmp = "$HoldPath.tmp"
  ($obj | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $HoldPath -Force
  return [pscustomobject]$obj
}

function Remove-SecurityHold {
  param([Parameter(Mandatory)][string]$HoldPath)
  if (Test-Path -LiteralPath $HoldPath) { Remove-Item -LiteralPath $HoldPath -Force }
}

function Write-SecurityState {
  param(
    [Parameter(Mandatory)][string]$StatePath,
    [Parameter(Mandatory)]$State
  )
  $dir = Split-Path -Parent $StatePath
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $tmp = "$StatePath.tmp"
  ($State | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $StatePath -Force
}

function Add-SecurityLog {
  param(
    [Parameter(Mandatory)][string]$LogPath,
    [Parameter(Mandatory)]$Event
  )
  $dir = Split-Path -Parent $LogPath
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  ($Event | ConvertTo-Json -Compress -Depth 6) | Add-Content -LiteralPath $LogPath -Encoding UTF8
}

function Write-SecurityAlert {
  param(
    [Parameter(Mandatory)][string]$AlertPath,
    [Parameter(Mandatory)]$Alert
  )
  $dir = Split-Path -Parent $AlertPath
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $tmp = "$AlertPath.tmp"
  ($Alert | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $AlertPath -Force
}

# Returns the tracked connector state. State is one of:
#   absent | invalid | not_running | invalid_process | running
# In live mode the executable must be the pinned cloudflared binary. In mock
# mode it must live under the isolated mock root, so a test cannot stop the
# live connector even if the mock PID file is edited.
function Get-TrackedTunnelProcess {
  param(
    [Parameter(Mandatory)][string]$PidPath,
    [switch]$MockMode,
    [string]$MockRoot,
    [string]$ExpectedExecutable = "C:\cloudflared\cloudflared.exe"
  )
  $result = [ordered]@{
    State          = "absent"
    Pid            = $null
    Process        = $null
    Reason         = "pid_file_absent"
    ExecutablePath = $null
  }
  if (-not (Test-Path -LiteralPath $PidPath)) { return [pscustomobject]$result }
  try {
    $raw = (Get-Content -LiteralPath $PidPath -Raw -ErrorAction Stop).Trim()
  } catch {
    $result.State = "invalid"
    $result.Reason = "pid_file_unreadable"
    return [pscustomobject]$result
  }
  $parsed = 0
  if (-not [int]::TryParse($raw, [ref]$parsed) -or $parsed -le 0) {
    $result.State = "invalid"
    $result.Reason = "pid_file_invalid"
    return [pscustomobject]$result
  }
  $result.Pid = $parsed
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$parsed" -ErrorAction SilentlyContinue
  if (-not $proc) {
    $result.State = "not_running"
    $result.Reason = "tracked_pid_not_running"
    return [pscustomobject]$result
  }
  $result.Process = $proc
  $result.ExecutablePath = $proc.ExecutablePath
  if ($proc.Name -ne "cloudflared.exe") {
    $result.State = "invalid_process"
    $result.Reason = "tracked_pid_not_cloudflared"
    return [pscustomobject]$result
  }
  if ($proc.CommandLine -notmatch 'tunnel\s+run') {
    $result.State = "invalid_process"
    $result.Reason = "tracked_pid_wrong_command"
    return [pscustomobject]$result
  }
  if (-not $proc.ExecutablePath) {
    $result.State = "invalid_process"
    $result.Reason = "tracked_pid_no_executable_path"
    return [pscustomobject]$result
  }
  if ($MockMode) {
    if (-not $MockRoot -or -not (Test-PathUnder -Path $proc.ExecutablePath -Root $MockRoot)) {
      $result.State = "invalid_process"
      $result.Reason = "tracked_pid_outside_mock_root"
      return [pscustomobject]$result
    }
  } elseif (-not $proc.ExecutablePath.Equals($ExpectedExecutable, [System.StringComparison]::OrdinalIgnoreCase)) {
    $result.State = "invalid_process"
    $result.Reason = "tracked_pid_unexpected_executable"
    return [pscustomobject]$result
  }
  $result.State = "running"
  $result.Reason = "ok"
  return [pscustomobject]$result
}

# Revalidates immediately before stopping, then stops only that PID. The
# caller is responsible for removing the PID file after a confirmed exit.
function Stop-TrackedTunnel {
  param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][string]$PidPath,
    [switch]$MockMode,
    [string]$MockRoot,
    [string]$ExpectedExecutable = "C:\cloudflared\cloudflared.exe",
    [int]$WaitSeconds = 10
  )
  $check = Get-TrackedTunnelProcess -PidPath $PidPath -MockMode:$MockMode -MockRoot $MockRoot -ExpectedExecutable $ExpectedExecutable
  if ($check.State -ne "running" -or $check.Pid -ne $ProcessId) {
    return [pscustomobject]@{ Stopped = $false; Exited = $false; Reason = $check.Reason; Detail = "revalidation_failed" }
  }
  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
  } catch {
    return [pscustomobject]@{ Stopped = $false; Exited = $false; Reason = "stop_failed"; Detail = $_.Exception.GetType().Name }
  }
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
      return [pscustomobject]@{ Stopped = $true; Exited = $true; Reason = "ok"; Detail = $null }
    }
    Start-Sleep -Milliseconds 250
  }
  return [pscustomobject]@{ Stopped = $true; Exited = $false; Reason = "stop_timeout"; Detail = $null }
}
