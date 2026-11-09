# Status of the unattended OCR run, in plain words (no Claude, no tokens). Reads only; changes nothing.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\ocr-gpu\status.ps1
# The desktop shortcut "OCR training status" runs this.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$work = if (Test-Path 'D:\ocr-gpu-work\pool') { 'D:\ocr-gpu-work' } else { Join-Path (Split-Path $root) 'ocr-gpu-work' }
function Count($f) { if (-not (Test-Path $f)) { return 0 }; $r = New-Object IO.StreamReader([IO.FileStream]::new($f, 'Open', 'Read', 'ReadWrite')); $n = 0; while ($null -ne $r.ReadLine()) { $n++ }; $r.Close(); $n }   # ReadWrite: a teacher is appending to it
function Files($d, $p) { if (Test-Path $d) { [Linq.Enumerable]::Count([IO.Directory]::EnumerateFiles($d, $p)) } else { 0 } }
function Head($t) { ''; Write-Host $t -ForegroundColor Cyan }
$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | ForEach-Object { $_.CommandLine }
function Running($pat) { [bool]($procs | Where-Object { $_ -like $pat }) }

Write-Host ("OCR training status  {0:ddd d MMM HH:mm}   (work folder: $work)" -f (Get-Date)) -ForegroundColor White

Head 'Now'
$doing = @()
if (Running '*get-commons.mjs*' -or Running '*get-pool.mjs*') { $doing += 'downloading book pages' }
if (Running '*split-lines.mjs*') { $doing += 'finding text lines on new pages' }
if (Running '*crop_lines.py*') { $doing += 'cutting line pictures' }
if (Running '*read_pages.py*--model qari4*') { $doing += 'teacher B (Qari 4B) reading lines on the GPU' } elseif (Running '*read_pages.py*--model qari *') { $doing += 'teacher A (Qari 2B) reading lines on the GPU' }
if (Running '*agree.mjs*') { $doing += 'comparing the two teachers' }
$tr = ($procs | Where-Object { $_ -like '*train.sh wq*' } | Select-Object -First 1)
if ($tr -match 'train\.sh wq(\w)') { $doing += "training version $($Matches[1]) (in Ubuntu, on the CPU)" }
$ev = ($procs | Where-Object { $_ -like '*ocr-accuracy.mjs*--ara ara_*' } | Select-Object -First 1)
if ($ev -match '--ara ara_(\w)p') { $doing += "testing version $($Matches[1]) on the test pages" + $(if ($ev -notmatch '--thin') { ' (full 413-page check: it passed the quick test)' }) }
$driver = Running '*run-forever.ps1*' -or Running '*run-pipeline.ps1*'
$waiter = Running '*move-then-restart.ps1*'
if ($doing) { $doing | ForEach-Object { Write-Host "  * $_" -ForegroundColor Green } }
elseif ($driver) { Write-Host '  * between steps (waiting for new pages or about to start the next step)' -ForegroundColor Green }
if (-not $driver -and $waiter) { Write-Host '  * waiting for the current sweep to finish, then moving the work folder to D: and starting the two-week run' -ForegroundColor Yellow }
if (Test-Path "$work\DONE") { Write-Host "  * FINISHED $(Get-Content "$work\DONE" | Select-Object -First 1). Results below." -ForegroundColor Green }
elseif (-not $driver -and -not $waiter) {
  Write-Host '  ! NOTHING IS RUNNING (a reboot or Windows update stops it). To continue where it left off, run in the waraq-next folder:' -ForegroundColor Red
  Write-Host '    powershell -NoProfile -ExecutionPolicy Bypass -File tools\ocr-gpu\run-forever.ps1' -ForegroundColor Red
}
$log = "$work\pipeline.log"
$lastRound = Get-Content $log -Tail 3000 -ErrorAction SilentlyContinue | Where-Object { $_ -like '*run-forever: round*' -or $_ -like '*sweep FAILED*' } | Select-Object -Last 1
if ($lastRound -like '*FAILED*') { Write-Host "  ! the last round FAILED: $($lastRound.Substring(0, [math]::Min(130, $lastRound.Length)))" -ForegroundColor Red }
if (Test-Path $log) {
  $age = [int]((Get-Date) - (Get-Item $log).LastWriteTime).TotalMinutes
  $last = "$(Get-Content $log -Tail 1)" -replace '/mnt/c/Users/Abdullah/Documents/ChatGPT/PDF Open Source/', '' -replace 'C:\\Users\\Abdullah\\Documents\\ChatGPT\\PDF Open Source\\', ''
  Write-Host "  last log entry $age min ago:" $last.Substring(0, [math]::Min(110, $last.Length))
}
$it = wsl.exe -e bash -c 'f=$(ls -t /root/waraq-train/wq*.log 2>/dev/null | head -1); [ -n "$f" ] && echo "$(basename $f .log) $(grep -a "At iteration" $f | tail -1 | cut -d, -f1,4)"' 2>$null
if ($tr -and $it) { Write-Host "  training: $($it -replace '^wq', 'version ')" }
$gpu = & nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader,nounits 2>$null
if ($gpu) { $g = $gpu.Split(',').Trim(); Write-Host "  GPU: $($g[0]) % busy, $($g[1]) MB memory, $($g[2]) C" }

Head 'Data so far'
$pages = Files "$work\pool\pages" '*.jpg'; $commons = Files "$work\pool\pages" 'c-*.jpg'
"  book pages downloaded : {0:N0}  ({1:N0} public-domain Commons, target about 147,000)" -f $pages, $commons
"  lines read by teacher A: {0:N0}" -f (Count "$work\pool\qari.jsonl")
"  lines read by teacher B: {0:N0}" -f (Count "$work\pool\qari4.jsonl")
"  silver training lines  : {0:N0}  (both teachers agree)" -f (Files "$work\gt02p" '*.gt.txt')

Head 'Verdicts (stock ara: 73.5 % words on the quick test; KEEP = beats it overall, no slice drops more than 1 point)'
$sums = Get-ChildItem "$work\SUMMARY*.md" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime
$res = Get-ChildItem "$work\results\thin5-ara_[A-Z]p.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime
foreach ($r in $res) {
  $m = $r.BaseName -replace 'thin5-ara_', '' -replace 'p$', ''
  if (-not (Select-String -Path $r.FullName -Pattern '^all pages' -Quiet)) { "  version ${m}: still testing"; continue }
  $v = & "$root\.venv-gpu\Scripts\python.exe" -I "$root\tools\ocr-gpu\verdict.py" "$work\results\base-ara.log" $r.FullName 2>$null
  $all = ($v | Where-Object { $_ -like 'all *' }) -replace '\s+', ' '; $verdict = $v | Where-Object { $_ -like 'VERDICT*' }
  $words = if ($all -match '\| [\d.]+ / [\d.]+ / [\d.]+ \| ([\d.]+) / [\d.]+ / [\d.]+ \| ([+-][\d.]+)') { "$($Matches[1]) % words ($($Matches[2]))" } else { '' }
  $col = if ($verdict -like '*KEEP*') { 'Green' } else { 'Gray' }
  Write-Host ("  version {0}  {1,-22} {2}   [{3:d MMM}]" -f $m, $words, ($verdict -replace 'VERDICT: ', ''), $r.LastWriteTime) -ForegroundColor $col
}
if (-not $res) { '  none yet' }
if ($sums) { "  full tables: $($sums[-1].FullName)" }

Head 'Disk'
Get-PSDrive C, D -ErrorAction SilentlyContinue | ForEach-Object { $f = [math]::Round($_.Free / 1GB); Write-Host ("  {0}: {1} GB free" -f $_.Name, $f) -ForegroundColor $(if ($_.Name -eq 'C' -and $f -lt 25) { 'Red' } else { 'Gray' }) }

Head 'Plan'
'  until Sat 14 Nov 00:00: the two teachers read pages (GPU, about 4,000 pages a day); downloads (up to 137,500 pages) run ahead and are all kept'
'  14-15 Nov           : train and test 8 versions (CPU, about 16 h; F, G, H add modern-font lines), then DONE'
'  a KEEP still needs a check in the app and your yes before it ships'
''
