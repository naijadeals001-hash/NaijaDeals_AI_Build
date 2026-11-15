# Idempotent status for the C: staging stack.
. "$PSScriptRoot\common.ps1"
$map = Read-StagingEnv
Write-Output ("app      : http://localhost:" + $AppPort + " (" + $(if (Test-Port $AppPort) { "listening" } else { "not running" }) + ")")
Write-Output ("postgres : 127.0.0.1:55432/" + $ExpectedDatabase + " (" + $(if (Test-Port 55432) { "listening" } else { "not running" }) + ")")
Write-Output ("data dir : " + $PgData)
Write-Output ("build    : " + $(if (Test-Path (Join-Path $AppDir ".next\BUILD_ID")) { (Get-Content (Join-Path $AppDir ".next\BUILD_ID") -Raw).Trim() } else { "none" }))
Write-Output ("env      : " + $EnvFile)
