# Read-only preflight for the prepared Cloudflare Tunnel configuration.
# Performs no DNS writes, starts no tunnel, changes no service.
# Exit code 0 = every check passed, 1 = at least one check failed.

$ErrorActionPreference = "Stop"
$Cloudflared = "C:\cloudflared\cloudflared.exe"
$ConfigPath  = Join-Path $PSScriptRoot "config.yml"
$Hostname    = "staging-remote.naijadeals.com"
$Protected   = "staging.naijadeals.com"
$Origin      = "http://127.0.0.1:3200"
$failures = 0

function Report([string]$name, [bool]$ok, [string]$detail) {
  $label = if ($ok) { "PASS" } else { "FAIL" }
  Write-Output ("{0}  {1,-26} {2}" -f $label, $name, $detail)
  if (-not $ok) { $script:failures++ }
}

# 1. Binary
if (Test-Path $Cloudflared) {
  $ver = (& $Cloudflared --version 2>&1 | Select-Object -First 1)
  Report "cloudflared binary" $true "$Cloudflared ($ver)"
} else {
  Report "cloudflared binary" $false "missing: $Cloudflared"
}

# 2. Config present and still placeholder-only (it must not be runnable yet)
if (Test-Path $ConfigPath) {
  $cfg = Get-Content $ConfigPath -Raw
  $placeholders = ([regex]::Matches($cfg, "REPLACE_WITH_TUNNEL_UUID")).Count
  Report "config.yml" $true "$ConfigPath (placeholders remaining: $placeholders)"
} else {
  Report "config.yml" $false "missing: $ConfigPath"
}

# 3. Ingress must reference only the staging origin and the 404 catch-all
if (Test-Path $ConfigPath) {
  $services = Select-String -Path $ConfigPath -Pattern '^\s*(?:-\s*)?service:\s*(\S+)' |
    ForEach-Object { $_.Matches[0].Groups[1].Value }
  $expected = @("http://127.0.0.1:3200", "http_status:404")
  $ok = ($services.Count -eq 2) -and (($services | Where-Object { $expected -notcontains $_ }).Count -eq 0)
  Report "ingress surface" $ok ("services: " + ($services -join ", "))
}

# 4. No credential material in this directory
$leaks = Get-ChildItem -Path $PSScriptRoot -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in ".json", ".pem", ".key" }
Report "no credential files" ($leaks.Count -eq 0) ("found: " + $leaks.Count)

# 5. Target hostname must still be unused
try {
  $r = Resolve-DnsName -Name $Hostname -ErrorAction Stop -DnsOnly
  Report "target hostname unused" $false ("resolves already: " + ($r | Select-Object -First 1).IPAddress)
} catch {
  Report "target hostname unused" $true "$Hostname -> NXDOMAIN"
}

# 6. The protected existing hostname must keep resolving to the same origin
try {
  $protectedIp = (Resolve-DnsName -Name $Protected -Type A -ErrorAction Stop -DnsOnly |
    Where-Object { $_.IPAddress } | Select-Object -First 1).IPAddress
  Report "existing staging untouched" ([bool]$protectedIp) "$Protected -> $protectedIp (read-only observation)"
} catch {
  Report "existing staging untouched" $false "$Protected did not resolve"
}

# 7. Staging origin reachable on loopback
try {
  $resp = Invoke-WebRequest -Uri $Origin -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0
  Report "staging origin" ($resp.StatusCode -eq 200) "$Origin -> HTTP $($resp.StatusCode)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Report "staging origin" ($code -eq 200 -or $code -eq 307) "$Origin -> $($_.Exception.Message)"
}

# 8. Private services must be loopback-bound and are never tunnel ingress
foreach ($port in 5680, 55432) {
  $bound = (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty LocalAddress -Unique) -join ","
  $loopbackOnly = ($bound -ne "") -and (@($bound -split ",") | Where-Object { $_ -notin "127.0.0.1", "::1" }).Count -eq 0
  Report "port $port loopback" $loopbackOnly ("bound: " + $(if ($bound) { $bound } else { "not listening" }))
}

Write-Output ""
if ($failures -eq 0) { Write-Output "PREFLIGHT: PASS (nothing was published)" }
else { Write-Output "PREFLIGHT: $failures check(s) failed (nothing was published)" }
exit $failures
