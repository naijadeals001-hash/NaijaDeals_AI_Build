# NaijaDeals staging — shared helpers. Dot-source from the other scripts.
$ErrorActionPreference = "Stop"

$script:StagingRoot = "C:\NaijaDeals-Staging"
$script:AppDir = Join-Path $StagingRoot "app"
$script:EnvFile = Join-Path $StagingRoot "env\staging.env"
$script:PgData = Join-Path $StagingRoot "pgdata"
$script:PgBin = "C:\Program Files\PostgreSQL\18\bin"
$script:ExpectedDatabase = "naijadeals_staging"
$script:LogDir = Join-Path $StagingRoot "logs"
$script:AppPort = 3200
$script:N8nPort = 5680

function Read-StagingEnv {
  if (-not (Test-Path $script:EnvFile)) { throw "Missing staging env file: $($script:EnvFile)" }
  $map = @{}
  foreach ($line in Get-Content $script:EnvFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    $map[$name.Trim()] = $value
  }
  return $map
}

function Set-StagingProcessEnv([hashtable]$Map) {
  foreach ($key in $Map.Keys) { Set-Item -Path "Env:$key" -Value $Map[$key] }
}

function Get-StagingLog([string]$Name) {
  $target = Join-Path $script:LogDir $Name
  if (-not (Test-Path $target)) { New-Item -ItemType Directory -Force -Path $target | Out-Null }
  return $target
}

function Write-StagingEvent([string]$Name, [hashtable]$Data) {
  $dir = Get-StagingLog "events"
  $record = [ordered]@{ at = (Get-Date).ToString("o"); event = $Name }
  foreach ($key in $Data.Keys) { $record[$key] = $Data[$key] }
  ($record | ConvertTo-Json -Compress) | Add-Content -Path (Join-Path $dir "staging.jsonl")
}

function Test-Port([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(400)
    if ($ok) { $client.EndConnect($async) }
    $client.Close()
    return $ok
  } catch {
    return $false
  }
}

function Wait-Port([int]$Port, [int]$Seconds = 45) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $Port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Assert-StagingDatabase {
  $map = Read-StagingEnv
  if ($map["DATABASE_URL"] -notmatch "/$($script:ExpectedDatabase)(\?|$)") {
    throw "DATABASE_URL does not point at $($script:ExpectedDatabase); refusing to start staging."
  }
  $env:PGPASSWORD = ($map["DATABASE_URL"] -replace '^.*://[^:]+:([^@]+)@.*$', '$1')
  $name = & (Join-Path $script:PgBin "psql.exe") -h 127.0.0.1 -p 55432 -U nd_staging -d $script:ExpectedDatabase -At -c "select current_database()" 2>$null
  if ($name -ne $script:ExpectedDatabase) { throw "current_database() returned '$name'; refusing to start staging." }
  return $true
}
