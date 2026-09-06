$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
Write-Host '=== NodeTrade One-Command Launcher ===' -ForegroundColor Cyan
function Require-Cmd($name) { if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name tidak ditemukan. Install dulu lalu jalankan lagi." } }
Require-Cmd 'node'; Require-Cmd 'npm'; Require-Cmd 'ngrok'
$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) { try { & py -3.11 --version *> $null; if ($LASTEXITCODE -eq 0) { $python = 'py -3.11' } } catch {} }
if (-not $python -and (Get-Command python -ErrorAction SilentlyContinue)) { $python = 'python' }
if (-not $python) { throw 'Python 3.11 tidak ditemukan.' }
if (-not (Test-Path '.venv\Scripts\python.exe')) { Write-Host 'Membuat Python venv...' -ForegroundColor Yellow; if ($python -eq 'py -3.11') { & py -3.11 -m venv .venv } else { & python -m venv .venv } }
Write-Host 'Install/update Python AI dependencies...' -ForegroundColor Yellow
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r .\ai_service\requirements.txt
Write-Host 'Install/update Node dependencies...' -ForegroundColor Yellow
npm install

$terminalRoots = @()
$mtRoot = Join-Path $env:APPDATA 'MetaQuotes\Terminal'
if (Test-Path $mtRoot) { $terminalRoots = @(Get-ChildItem -LiteralPath $mtRoot -Directory | Sort-Object LastWriteTime -Descending) }
$metaEditor = $null
$metaCandidates = @(
  (Join-Path $env:ProgramFiles 'MetaTrader 5\metaeditor64.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'MetaTrader 5\metaeditor64.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\MetaTrader 5\metaeditor64.exe')
)
foreach ($candidate in $metaCandidates) {
  if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $metaEditor = (Get-Item -LiteralPath $candidate).FullName; break }
}
if (-not $metaEditor) {
  $metaCmd = Get-Command metaeditor64.exe -ErrorAction SilentlyContinue
  if ($metaCmd) { $metaEditor = (Get-Item -LiteralPath $metaCmd.Path -ErrorAction SilentlyContinue).FullName }
}
if ($metaEditor -and $terminalRoots.Count -gt 0) {
  $terminalRoot = $terminalRoots[0].FullName
  $dataExperts = Join-Path $terminalRoot 'MQL5\Experts'
  $dataMql5 = Join-Path $terminalRoot 'MQL5'
  New-Item -ItemType Directory -Force -Path $dataExperts | Out-Null
  $eaSource = Join-Path $dataExperts 'NodeTradeEA.mq5'
  Copy-Item '.\server\nodetrade\NodeTradeEA_v3.mq5' $eaSource -Force
  $eaLog = [System.IO.Path]::ChangeExtension($eaSource, '.log')
  $eaEx5 = [System.IO.Path]::ChangeExtension($eaSource, '.ex5')
  Remove-Item -LiteralPath $eaLog -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $eaEx5 -Force -ErrorAction SilentlyContinue
  Write-Host "MetaEditor: [$metaEditor]" -ForegroundColor DarkGray
  Write-Host "Compile EA: [$eaSource]" -ForegroundColor Yellow
  $compileArg = "/compile:$eaSource"
  $includeArg = "/include:$dataMql5"
  $metaProc = Start-Process -FilePath $metaEditor -ArgumentList $compileArg,$includeArg,'/log' -WorkingDirectory (Split-Path $metaEditor) -Wait -PassThru
  $metaExit = $metaProc.ExitCode
  Start-Sleep -Seconds 2
  if (Test-Path -LiteralPath $eaLog -PathType Leaf) { Write-Host '=== MetaEditor compile log ===' -ForegroundColor Cyan; Get-Content -LiteralPath $eaLog | Select-Object -Last 80 | ForEach-Object { Write-Host $_ } }
  if (Test-Path -LiteralPath $eaEx5 -PathType Leaf) { Write-Host "NodeTradeEA.ex5 compiled: $eaEx5" -ForegroundColor Green } else { Write-Host "EA compile gagal (MetaEditor exit code: $metaExit)." -ForegroundColor Red }
} else { Write-Host 'MetaEditor/MT5 data folder belum ditemukan; EA v3 tetap ada di server/nodetrade/.' -ForegroundColor Yellow }

Write-Host 'Starting NodeTrade + Python Ensemble...' -ForegroundColor Green
$nodeOut = Join-Path $PSScriptRoot 'nodetrade-node.log'
$nodeErr = Join-Path $PSScriptRoot 'nodetrade-node-error.log'
Remove-Item $nodeOut,$nodeErr -Force -ErrorAction SilentlyContinue
$nodeProc = Start-Process -FilePath 'node.exe' -ArgumentList 'start-nodetrade.mjs' -WorkingDirectory $PSScriptRoot -RedirectStandardOutput $nodeOut -RedirectStandardError $nodeErr -PassThru
Start-Sleep -Seconds 5
if ($nodeProc.HasExited) {
  Write-Host "NodeTrade langsung crash. Exit code: $($nodeProc.ExitCode)" -ForegroundColor Red
  Write-Host '=== NodeTrade stdout ===' -ForegroundColor Cyan
  if (Test-Path $nodeOut) { Get-Content $nodeOut | Select-Object -Last 100 }
  Write-Host '=== NodeTrade stderr ===' -ForegroundColor Red
  if (Test-Path $nodeErr) { Get-Content $nodeErr | Select-Object -Last 100 }
  exit 1
}
Write-Host 'Starting ngrok -> NodeTrade gateway :3001 ...' -ForegroundColor Green
$ngrokProc = Start-Process -FilePath 'ngrok.exe' -ArgumentList 'http','3001' -WorkingDirectory $PSScriptRoot -PassThru
Start-Sleep -Seconds 4
try {
  $t = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5
  $url = ($t.tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1).public_url
  if ($url) { Write-Host "`nNodeTrade PUBLIC URL: $url" -ForegroundColor Green; Write-Host "MT5 WebRequest URL:  $url" -ForegroundColor Green; Write-Host "Dashboard:           $url" -ForegroundColor Green } else { Write-Host 'ngrok hidup tetapi URL belum tersedia.' -ForegroundColor Yellow }
} catch { Write-Host 'ngrok belum mengembalikan URL. Cek http://127.0.0.1:4040.' -ForegroundColor Yellow }
Write-Host '`nNodeTrade berjalan. Jangan tutup PowerShell ini.' -ForegroundColor Cyan
while (-not $nodeProc.HasExited) { Start-Sleep -Seconds 2 }
Write-Host "NodeTrade process berhenti. Exit code: $($nodeProc.ExitCode)" -ForegroundColor Red
Write-Host '=== NodeTrade stdout terakhir ===' -ForegroundColor Cyan
if (Test-Path $nodeOut) { Get-Content $nodeOut | Select-Object -Last 120 }
Write-Host '=== NodeTrade stderr terakhir ===' -ForegroundColor Red
if (Test-Path $nodeErr) { Get-Content $nodeErr | Select-Object -Last 120 }
if ($ngrokProc -and -not $ngrokProc.HasExited) { Stop-Process -Id $ngrokProc.Id -Force }
