# Read-only health report for the C: staging stack. Exit 0 healthy, 1 unhealthy.
. "$PSScriptRoot\common.ps1"
$map = Read-StagingEnv
$fail = @()

$appUp = Test-Port $AppPort
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $AppPort -ErrorAction SilentlyContinue)
$addresses = @($listeners | Select-Object -ExpandProperty LocalAddress -Unique)
$buildId = if (Test-Path (Join-Path $AppDir ".next\BUILD_ID")) { (Get-Content (Join-Path $AppDir ".next\BUILD_ID") -Raw).Trim() } else { "none" }

Write-Output ("app      : " + $(if ($appUp) { "listening" } else { "not running" }) + " on " + ($addresses -join "," ) + " -> http://127.0.0.1:" + $AppPort)
Write-Output ("build    : " + $buildId + " (" + $AppDir + ")")
Write-Output ("postgres : " + $(if (Test-Port 55432) { "listening" } else { "not running" }) + " -> 127.0.0.1:55432/" + $ExpectedDatabase + " (" + $PgData + ")")

if (-not $appUp) { $fail += "app not listening" }
if ($addresses.Count -gt 1) { $fail += "duplicate app listeners: $($addresses -join ',')" }
if ($addresses.Count -ge 1 -and ($addresses | Where-Object { $_ -notin @("127.0.0.1", "::1") })) { $fail += "app bound beyond localhost: $($addresses -join ',')" }
if ($buildId -eq "none") { $fail += "no production build" }
if (-not (Test-Port 55432)) { $fail += "postgres not listening" }

if (Test-Port 55432) {
  $env:PGPASSWORD = ($map["DATABASE_URL"] -replace '^.*://[^:]+:([^@]+)@.*$', '$1')
  $db = & (Join-Path $PgBin "psql.exe") -h 127.0.0.1 -p 55432 -U nd_staging -d $ExpectedDatabase -At -c "select current_database()" 2>$null
  if ($db -ne $ExpectedDatabase) { $fail += "database identity mismatch: $db" }
}

if ($fail.Count -gt 0) { Write-Output ("UNHEALTHY: " + ($fail -join "; ")); exit 1 }
Write-Output "HEALTHY"
exit 0
