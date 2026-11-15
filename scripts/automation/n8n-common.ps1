# Shared n8n paths and helpers. All state stays on NTFS.
$ErrorActionPreference = "Stop"
$script:Root = "C:\NaijaDeals-Automation"
$script:Node = Join-Path $Root "node24\node.exe"
$script:N8n = Join-Path $Root "n8n\node_modules\n8n\bin\n8n"
$script:EnvFile = Join-Path $Root "config\n8n.env"
$script:Port = 5680

function Set-N8nEnv {
  if (-not (Test-Path $script:EnvFile)) { throw "Missing n8n config: $($script:EnvFile)" }
  Get-Content $script:EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') { Set-Item -Path ("Env:" + $matches[1]) -Value $matches[2] }
  }
}

function Test-N8nPort {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $script:Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(400)
    if ($ok) { $client.EndConnect($async) }
    $client.Close()
    return $ok
  } catch { return $false }
}
