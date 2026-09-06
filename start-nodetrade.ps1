$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host '=== NodeTrade One-Command Launcher ===' -ForegroundColor Cyan
function Require-Cmd($name) { if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name tidak ditemukan. Install dulu lalu jalankan lagi." } }
Require-Cmd 'node'; Require-Cmd 'npm'
$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) { try { & py -3.11 --version *> $null; if ($LASTEXITCODE -eq 0) { $python = 'py -3.11' } } catch {} }
if (-not $python -and (Get-Command python -ErrorAction SilentlyContinue)) { $python = 'python' }
if (-not $python) { throw 'Python 3.11 tidak ditemukan.' }
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) { Write-Host 'ngrok belum ada. Mencoba install via winget...' -ForegroundColor Yellow; if (Get-Command winget -ErrorAction SilentlyContinue) { winget install ngrok -s msstore --accept-package-agreements --accept-source-agreements } else { throw 'ngrok tidak ditemukan dan winget tidak tersedia.' } }
Require-Cmd 'ngrok'
if (-not (Test-Path '.venv\Scripts\python.exe')) { Write-Host 'Membuat Python venv...' -ForegroundColor Yellow; if ($python -eq 'py -3.11') { & py -3.11 -m venv .venv } else { & python -m venv .venv } }
Write-Host 'Install/update Python AI dependencies...' -ForegroundColor Yellow
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r .\ai_service\requirements.txt
Write-Host 'Install/update Node dependencies...' -ForegroundColor Yellow
npm install

$terminalRoots = @()
$mtRoot = Join-Path $env:APPDATA 'MetaQuotes\Terminal'
if (Test-Path $mtRoot) { $terminalRoots = Get-ChildItem $mtRoot -Directory | Sort-Object LastWriteTime -Descending }
$metaEditor = $null
$metaCandidates = @(
  (Join-Path $env:ProgramFiles 'MetaTrader 5\metaeditor64.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'MetaTrader 5\metaeditor64.exe')
) | Where-Object { $_ -and (Test-Path $_) }
if ($metaCandidates.Count -gt 0) { $metaEditor = $metaCandidates[0] }
if (-not $metaEditor) { $metaCmd = Get-Command metaeditor64.exe -ErrorAction SilentlyContinue; if ($metaCmd) { $metaEditor = $metaCmd.Source } }
if ($metaEditor -and $terminalRoots.Count -gt 0) {
  $dataExperts = Join-Path $terminalRoots[0].FullName 'MQL5\Experts'
  New-Item -ItemType Directory -Force -Path $dataExperts | Out-Null
  $eaSource = Join-Path $dataExperts 'NodeTradeEA.mq5'
  Copy-Item '.\server\nodetrade\NodeTradeEA_v3.mq5' $eaSource -Force
  Write-Host "Compile EA: $eaSource" -ForegroundColor Yellow
  $compileArg = "/compile:$eaSource"
  Start-Process -FilePath $metaEditor -ArgumentList $compileArg,'/log' -Wait -NoNewWindow
  $eaEx5 = [System.IO.Path]::ChangeExtension($eaSource, '.ex5')
  if (Test-Path $eaEx5) { Write-Host "NodeTradeEA.ex5 compiled: $eaEx5" -ForegroundColor Green } else { Write-Host 'EA compile gagal; cek MetaEditor log.' -ForegroundColor Red }
} else { Write-Host 'MetaEditor/MT5 data folder belum ditemukan; EA v3 tetap ada di server/nodetrade/.' -ForegroundColor Yellow }

if ($env:NGROK_AUTHTOKEN) { ngrok config add-authtoken $env:NGROK_AUTHTOKEN }
Write-Host 'Starting NodeTrade + Python Ensemble...' -ForegroundColor Green
$nodeProc = Start-Process -FilePath 'node' -ArgumentList 'start-nodetrade.mjs' -WorkingDirectory $PWD -PassThru
Start-Sleep -Seconds 4
Write-Host 'Starting ngrok -> NodeTrade gateway :3001 ...' -ForegroundColor Green
$ngrokProc = Start-Process -FilePath 'ngrok' -ArgumentList 'http','3001' -WorkingDirectory $PWD -PassThru
Start-Sleep -Seconds 3
try {
  $t = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 5
  $url = ($t.tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1).public_url
  if ($url) { Write-Host "`nNodeTrade PUBLIC URL: $url" -ForegroundColor Green; Write-Host "MT5 WebRequest URL:  $url" -ForegroundColor Green; Write-Host "Dashboard:           $url" -ForegroundColor Green } else { Write-Host 'ngrok hidup tetapi URL belum tersedia.' -ForegroundColor Yellow }
} catch { Write-Host 'ngrok belum mengembalikan URL. Cek http://127.0.0.1:4040.' -ForegroundColor Yellow }
Write-Host '`nNodeTrade berjalan. Jangan tutup PowerShell ini.' -ForegroundColor Cyan
Wait-Process -Id $nodeProc.Id
if (-not $ngrokProc.HasExited) { Stop-Process -Id $ngrokProc.Id -Force }
