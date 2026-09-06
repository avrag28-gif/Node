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
if (Test-Path $mtRoot) { $terminalRoots = @(Get-ChildItem -LiteralPath $mtRoot -Directory | Sort-Object LastWriteTime -Descending) }
$metaEditor = $null
$metaCandidates = @(
  (Join-Path $env:ProgramFiles 'MetaTrader 5\metaeditor64.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'MetaTrader 5\metaeditor64.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\MetaTrader 5\metaeditor64.exe')
)
foreach ($candidate in $metaCandidates) {
  if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    $metaEditor = (Get-Item -LiteralPath $candidate).FullName
    break
  }
}
if (-not $metaEditor) {
  $metaCmd = Get-Command metaeditor64.exe -ErrorAction SilentlyContinue
  if ($metaCmd) { $metaEditor = (Get-Item -LiteralPath $metaCmd.Path -ErrorAction SilentlyContinue).FullName }
}
if (-not $metaEditor) {
  $searchRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  $found = Get-ChildItem -LiteralPath $searchRoots -Filter 'metaeditor64.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $metaEditor = $found.FullName }
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
  if (-not (Test-Path -LiteralPath $metaEditor -PathType Leaf)) { throw "MetaEditor tidak ditemukan di path: $metaEditor" }
  $compileArg = "/compile:`"$eaSource`""
  $includeArg = "/include:`"$dataMql5`""
  & "$metaEditor" $compileArg $includeArg '/log'
  $metaExit = $LASTEXITCODE
  Start-Sleep -Seconds 2
  if (Test-Path -LiteralPath $eaLog -PathType Leaf) {
    Write-Host '=== MetaEditor compile log ===' -ForegroundColor Cyan
    Get-Content -LiteralPath $eaLog | Select-Object -Last 80 | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host 'MetaEditor tidak membuat file .log.' -ForegroundColor Red
  }
  if (Test-Path -LiteralPath $eaEx5 -PathType Leaf) {
    Write-Host "NodeTradeEA.ex5 compiled: $eaEx5" -ForegroundColor Green
  } else {
    Write-Host "EA compile gagal (MetaEditor exit code: $metaExit)." -ForegroundColor Red
    Write-Host "Log: $eaLog" -ForegroundColor Red
  }
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
while ($true) {
  if ($nodeProc.HasExited) {
    Write-Host "NodeTrade process berhenti. Exit code: $($nodeProc.ExitCode)" -ForegroundColor Red
    break
  }
  Start-Sleep -Seconds 2
}
if ($ngrokProc -and -not $ngrokProc.HasExited) { Stop-Process -Id $ngrokProc.Id -Force }
