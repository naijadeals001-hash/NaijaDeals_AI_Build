param([int]$Port = 3010, [string]$Schema = "")
$ErrorActionPreference = "Stop"
$root = if ($Port -eq 3011) { "C:\Users\User\naijadeals-customer" } else { "C:\Users\User\naijadeals-live" }
Set-Location $root
$log = "C:\Users\User\Documents\naijadeals.com\qa-artifacts\preview-runtime-$Port.log"
if ($Schema) {
  $line = Get-Content (Join-Path $root ".env") | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1
  $base = ($line -replace "^DATABASE_URL=", "").Trim('"')
  $separator = if ($base.Contains("?")) { "&" } else { "?" }
  $env:DATABASE_URL = $base + $separator + "schema=" + $Schema
  $env:PRISMA_SCHEMA = $Schema
}
"START port=$Port schema=$Schema at $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding utf8
& 'C:\Program Files\nodejs\npm.cmd' run start -- --port $Port *>> $log
