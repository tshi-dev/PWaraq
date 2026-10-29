# One command, no model and no tokens needed: teachers -> silver labels -> Tesseract fine-tune -> measure -> keep/drop verdict.
#   powershell -ExecutionPolicy Bypass -File tools\ocr-gpu\run-pipeline.ps1 [-CommonsPages 10000] [-Every 5] [-Offsets 0,2] [-Variants Q:5000:0.0001,R:3000:0.00005] [-Full]
# Every stage is resumable (it skips what already exists), so a reboot or Ctrl+C is harmless: run it again. Output: WORK\SUMMARY.md
# and WORK\pipeline.log. Nothing is wired into the app and nothing is pushed: a KEEP verdict only tells you to review (release gate).
# Needs: .venv-gpu (see README), WSL Ubuntu with tesseract-ocr + tesstrain tools (README), node deps, public/ocr/ara_best.traineddata.gz
# (node tools/get-ocr.mjs --best), the real test set (node tools/get-ocr-set.mjs --all --wikisource), and a stock baseline log (made here if missing).
param([int]$CommonsPages = 0, [int]$Every = 5, [int[]]$Offsets = @(0, 2), [string[]]$Variants = @('Q:5000:0.0001'), [string]$Work = '', [string]$ExtraGt = '', [switch]$Full)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $Work) { $Work = Join-Path (Split-Path $root) 'ocr-gpu-work' }
New-Item -ItemType Directory -Force $Work, "$Work\pool", "$Work\results", "$Work\models" | Out-Null
$py = Join-Path $root '.venv-gpu\Scripts\python.exe'; $log = Join-Path $Work 'pipeline.log'
$env:HF_HUB_DISABLE_XET = '1'; $env:PYTHONIOENCODING = 'utf8'
function Say($m) { $l = '{0:HH:mm:ss} {1}' -f (Get-Date), $m; Write-Host $l; [IO.File]::AppendAllText($log, "$l`r`n") }   # open-append-close: the log stays readable while a stage runs
function Run($exe, $argv) { Say ("> $exe " + ($argv -join ' ')); $ErrorActionPreference = 'Continue'; & $exe @argv 2>&1 | ForEach-Object { [IO.File]::AppendAllText($log, "$_`r`n") }; if ($LASTEXITCODE -ne 0) { throw "$exe failed ($LASTEXITCODE)" } }   # PS 5.1 turns native stderr into errors: judge by exit code, keep all output in the log
function Lines($f) { if (Test-Path $f) { (Get-Content $f | Measure-Object -Line).Lines } else { 0 } }
function ToWslPath($p) { ((& wsl.exe wslpath -a $p) -replace "`0", '').Trim() }
Set-Location $root
# keep Windows awake while this process lives (not a persistent power setting; released when the process ends)
Add-Type -Namespace W -Name K -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][W.K]::SetThreadExecutionState([uint32]2147483649)   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
foreach ($need in @($py, "$root\public\ocr\ara_best.traineddata.gz", "$root\tests\fixtures\ocr\real\manifest.json")) { if (-not (Test-Path $need)) { throw "missing: $need (see tools/ocr-gpu/README.md)" } }

# 1 pool pages (public scanned book pages, never the test rows) and 2 their line boxes
foreach ($o in $Offsets) { if (-not (Test-Path "$Work\pool\pool-$Every-$o.done")) { Run node @('tools/ocr-gpu/get-pool.mjs', '--every', $Every, '--offset', $o, '--work', $Work); New-Item "$Work\pool\pool-$Every-$o.done" -ItemType File | Out-Null } }
if ($CommonsPages -gt 0 -and -not (Test-Path "$Work\pool\commons-$CommonsPages.done")) { Run node @('tools/ocr-gpu/get-commons.mjs', '--pages', $CommonsPages, '--work', $Work); New-Item "$Work\pool\commons-$CommonsPages.done" -ItemType File | Out-Null }   # public-domain book scans (Wikimedia Commons)
Run node @('tools/ocr-gpu/split-lines.mjs', '--work', $Work)          # resumable: skips pages already in lines.json
# 3 tight line crops (2 % padding)
Run $py @('-I', 'tools/ocr-gpu/crop_lines.py', $Work, '0.02', 'lines02')
$jobs = "$Work\pool\lines02.list.json"
# 4 teacher A (Qari v0.3, all lines), 5 shortlist, teacher B (Qari 4B, plausible lines only)
Run $py @('-I', 'tools/ocr-gpu/read_pages.py', '--model', 'qari', '--lines', $jobs, '--out', "$Work\pool\qari.jsonl", '--batch', 16)
Run node @('tools/ocr-gpu/agree.mjs', "$Work\pool\qari.jsonl", '--list', '--work', $Work, '--jobs', 'lines02.list.json')
Run $py @('-I', 'tools/ocr-gpu/read_pages.py', '--model', 'qari4', '--lines', "$Work\pool\lines2.list.json", '--out', "$Work\pool\qari4.jsonl", '--batch', 48)
# 6 agreement (normalised CER <= 2 %), unvowelled lines only (vowelled lines with marks stripped made the model drop dotted letters)
Run node @('tools/ocr-gpu/agree.mjs', "$Work\pool\qari.jsonl", "$Work\pool\qari4.jsonl", '--work', $Work, '--jobs', 'lines02.list.json', '--out', 'gt02p', '--plain')
if ($ExtraGt) { Copy-Item "$ExtraGt\*" "$Work\gt02p\" -Force; Say "added $ExtraGt" }
$n = (Get-ChildItem "$Work\gt02p\*.gt.txt").Count; Say "silver lines: $n"
if ($n -lt 500) { throw "only $n silver lines: fetch more pool pages (-Offsets 0,1,2,3,4)" }
# 7 baseline (stock ara, full real set) once
$base = "$Work\results\base-ara.log"
if (-not (Test-Path $base) -or -not (Select-String -Path $base -Pattern '^all pages' -Quiet)) { Say 'stock baseline (about 1.5 h)'; cmd /c "node tools\ocr-accuracy.mjs --only real/s,real/m,real/w --ara ara > ""$base"" 2>&1" }
# 8 train each variant in WSL (CPU), 9 measure on the thinned set (every 5th bulk page + all other real pages), 10 verdict
$ocrDir = ToWslPath "$root\public\ocr"; $gtW = ToWslPath "$Work\gt02p"; $trainSh = ToWslPath "$root\tools\ocr-gpu\train.sh"
$report = @("# OCR GPU pipeline summary ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))", '', "silver lines: $n (teachers Qari v0.3 + Qari 4B, CER <= 2 %, unvowelled)", '')
foreach ($v in $Variants) {
  $name, $it, $lr = $v.Split(':'); $model = "ara_${name}p"
  if (-not (Test-Path "$Work\models\$model.traineddata.gz")) {
    Run wsl.exe @('-e', 'bash', $trainSh, "wq$name", $gtW, $it, $lr, $ocrDir)
    Move-Item "$root\public\ocr\ara_wq${name}p.traineddata.gz" "$Work\models\$model.traineddata.gz" -Force
  }
  Copy-Item "$Work\models\$model.traineddata.gz" "$root\public\ocr\$model.traineddata.gz" -Force   # git-ignored; removed again below
  $thin = "$Work\results\thin5-$model.log"
  if (-not (Test-Path $thin) -or -not (Select-String -Path $thin -Pattern '^all pages' -Quiet)) { cmd /c "node tools\ocr-accuracy.mjs --only real/s,real/m,real/w --thin 5 --ara $model > ""$thin"" 2>&1" }
  $ErrorActionPreference = 'Continue'; $v1 = & $py -I tools/ocr-gpu/verdict.py $base $thin; $ok = ($LASTEXITCODE -eq 0); $ErrorActionPreference = 'Stop'
  $report += "## $name ($it it, LR $lr): thinned set", '```', $v1, '```'
  if ($ok -and $Full) {
    $full = "$Work\results\full-$model.log"
    if (-not (Test-Path $full) -or -not (Select-String -Path $full -Pattern '^all pages' -Quiet)) { cmd /c "node tools\ocr-accuracy.mjs --only real/s,real/m,real/w --ara $model > ""$full"" 2>&1" }
    $v2 = & $py -I tools/ocr-gpu/verdict.py $base $full
    $report += "### full 413 pages", '```', $v2, '```'
  }
  Remove-Item "$root\public\ocr\$model.traineddata.gz" -Force -ErrorAction SilentlyContinue
}
$report += '', 'A KEEP verdict means: measure again in the browser build and ask the owner before wiring it into the OCR pack (release gate).'
Set-Content "$Work\SUMMARY.md" $report -Encoding utf8
Say "done: $Work\SUMMARY.md"
