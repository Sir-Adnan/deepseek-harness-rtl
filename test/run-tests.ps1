<#
  DSH RTL — اجراکنندهٔ تست‌های مرورگری
  ---------------------------------------------------------------------------
  دو تست را در کروم headless اجرا می‌کند و نتیجه را چاپ می‌کند:
    ۱) test/selftest.html      → قواعد RTL در برابر قواعد شبیه‌سازی‌شدهٔ خود اپ
    ۲) test/popup-probe.html   → چیدمان و نبود سرریز افقی در پاپ‌آپ

  استفاده:
      pwsh -File test/run-tests.ps1
  پیش‌نیاز: Node.js و Google Chrome
#>

[CmdletBinding()]
param(
  [int]$Port = 8791
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'manifest.json'))) { $root = $PSScriptRoot }

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'کروم/اِج پیدا نشد.' }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js پیدا نشد.' }

Write-Host "root   : $root"
Write-Host "chrome : $chrome"
Write-Host "node   : $node"
Write-Host ''

$server = Start-Process -FilePath $node `
  -ArgumentList @((Join-Path $root 'test\serve.js'), $root, $Port) `
  -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 900

function Invoke-Page([string]$url, [string]$label) {
  $profile = Join-Path $env:TEMP ("dsh-rtl-test-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $dump = Join-Path $env:TEMP ("dsh-rtl-dump-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.html')
  $cmd = '"{0}" --headless=new --disable-gpu --no-sandbox --no-first-run --force-device-scale-factor=1 --user-data-dir="{1}" --window-size=420,900 --virtual-time-budget=8000 --dump-dom "{2}" > "{3}" 2>&1' -f $chrome, $profile, $url, $dump
  cmd /c $cmd | Out-Null
  Start-Sleep -Milliseconds 250

  $text = Get-Content $dump -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  Remove-Item $dump -ErrorAction SilentlyContinue
  Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue

  $m = [regex]::Match([string]$text, '(?s)<pre id="out">(.*?)</pre>')
  if (-not $m.Success) {
    Write-Host "[$label] نتیجه‌ای پیدا نشد (صفحه لود نشد؟)" -ForegroundColor Red
    return $false
  }
  $body = $m.Groups[1].Value -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&quot;', '"'
  $lines = $body -split "`n"
  $fails = @($lines | Where-Object { $_ -match '^FAIL' })
  $passCount = @($lines | Where-Object { $_ -match '^PASS' }).Count

  Write-Host "[$label] PASS=$passCount FAIL=$($fails.Count)"
  $fails | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
  return ($fails.Count -eq 0)
}

$ok1 = $false
$ok2 = $false
$ok3 = $false
try {
  $ok1 = Invoke-Page "http://127.0.0.1:$Port/test/selftest.html" 'rtl-css'
  $ok2 = Invoke-Page "http://127.0.0.1:$Port/test/popup-probe.html" 'popup'

  Write-Host ''
  Write-Host '--- E2E: بارگذاری واقعی افزونه در کروم ---'
  $env:PROBE_PORT = "$Port"
  & $node (Join-Path $root 'test\e2e.js') $chrome
  $ok3 = ($LASTEXITCODE -eq 0)
  if ($LASTEXITCODE -eq 3) {
    Write-Host 'E2E: مرورگر افزونه را نپذیرفت (کروم ۱۳۷+ بدون پرچم اشکال‌زدایی).' -ForegroundColor Yellow
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($ok1 -and $ok2 -and $ok3) {
  Write-Host 'همهٔ تست‌ها پاس شدند ✔' -ForegroundColor Green
  exit 0
}
Write-Host 'بعضی تست‌ها رد شدند ✘' -ForegroundColor Red
exit 1
