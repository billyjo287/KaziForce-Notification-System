# One load test from start to finish (Windows PowerShell). Docker must be running
# (docker compose up -d) and the backend built (npm run build -w backend).
#   .\loadtest\run.ps1                 # the full test: 1,000 a minute for 10 minutes
#   .\loadtest\run.ps1 -Duration 1m    # a short rehearsal
#   .\loadtest\run.ps1 -Chaos          # also restart Redis and Postgres during the test
# Results: loadtest\data\report.txt (and k6-summary.json, server.log, health.log).
param(
  [string]$Duration = '10m',
  [int]$Rate = 1000,
  [switch]$Chaos
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Force $data | Out-Null
Set-Location $root

# Keep the computer awake while the test runs (a sleeping laptop pauses everything and ruins the
# numbers). Only for this script's lifetime; no power settings are changed.
Add-Type -Namespace KaziForce -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
'@
[KaziForce.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null  # CONTINUOUS + SYSTEM_REQUIRED

function Stop-Tree($proc) {
  if ($proc -and -not $proc.HasExited) { taskkill /T /F /PID $proc.Id | Out-Null }
}

# Fresh test data first, while nothing else uses the load-test database.
Push-Location backend
npx tsx scripts/loadtest/setup.ts
$setupFailed = $LASTEXITCODE -ne 0
Pop-Location
if ($setupFailed) { throw 'Setting up the test data failed (see above).' }

Write-Host 'Starting the built backend on the load-test database (port 4002)...'
$server = Start-Process -PassThru -NoNewWindow -FilePath 'node' `
  -ArgumentList 'scripts/loadtest/server.mjs' -WorkingDirectory "$root\backend" `
  -RedirectStandardOutput "$data\server.log" -RedirectStandardError "$data\server.err.log"
try {
  $ready = $false
  for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
    Start-Sleep -Seconds 2
    try { $ready = (Invoke-RestMethod http://localhost:4002/health).status -eq 'ok' } catch {}
  }
  if (-not $ready) { throw 'The backend did not start: see loadtest\data\server.err.log' }

  $listener = Start-Process -PassThru -NoNewWindow -FilePath 'node' `
    -ArgumentList 'node_modules/tsx/dist/cli.mjs', 'backend/scripts/loadtest/listener.ts' `
    -RedirectStandardOutput "$data\listener.log" -RedirectStandardError "$data\listener.err.log"
  $health = Start-Process -PassThru -NoNewWindow -FilePath 'node' `
    -ArgumentList 'backend/scripts/loadtest/watch-health.mjs' `
    -RedirectStandardOutput "$data\health.log" -RedirectStandardError "$data\health.err.log"
  Start-Sleep -Seconds 5

  $chaosProc = $null
  if ($Chaos) {
    # Redis after 2 minutes, Postgres after 5 (see docs/performance.md, resilience test).
    $chaosProc = Start-Process -PassThru -NoNewWindow -FilePath 'node' `
      -ArgumentList 'backend/scripts/loadtest/chaos.mjs' `
      -RedirectStandardOutput "$data\chaos.log" -RedirectStandardError "$data\chaos.err.log"
  }

  Write-Host "k6: $Rate notifications a minute for $Duration..."
  docker run --rm -v "${PSScriptRoot}:/loadtest" -w /loadtest grafana/k6:latest run --quiet `
    -e DURATION=$Duration -e RATE=$Rate notifications.js

  if ($chaosProc) { $chaosProc.WaitForExit() }
  # Let the last alerts (and any retries after a restart) arrive.
  Write-Host 'Waiting 45 s for the last alerts...'
  Start-Sleep -Seconds 45
  Stop-Tree $listener
  Stop-Tree $health
  Push-Location backend
  npx tsx scripts/loadtest/report.ts
  Pop-Location
}
finally {
  Stop-Tree $server
  [KaziForce.Power]::SetThreadExecutionState([uint32]2147483648) | Out-Null  # sleep allowed again
}
