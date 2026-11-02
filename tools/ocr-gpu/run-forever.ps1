# Unattended driver (no Claude, no tokens). Downloads run in the background (the rest of freococo, then 10,000 public-domain
# Commons pages) while the GPU works in rounds on whatever pages have arrived (split, crop, teacher A, shortlist, teacher B,
# agreement); when the downloads are done and a round finds nothing new, it trains and measures the sweep (-Full) once.
# Every step is resumable and a failed round is retried 10 minutes later (at most 30 failures). Start it detached:
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','tools\ocr-gpu\run-forever.ps1'
# Check WORK\pipeline.log (progress), WORK\fetch.log (downloads), WORK\SUMMARY.md (verdicts), WORK\DONE (finished).
# WORK defaults to D:\ocr-gpu-work (2 TB drive: a two-week run is about 150 GB and nothing is ever deleted); -Pages / -Per set the Commons target (140,000 / 500 a work).
# -SweepAt: reading stops and the sweep starts then, read or not (the GPU reads about 4,000 pages a day, downloads arrive about 6x faster; unread pages stay for later).
param([string]$Work = 'D:\ocr-gpu-work', [int]$Pages = 140000, [int]$Per = 500, [datetime]$SweepAt = '2026-11-14 00:00')
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path; $work = $Work
New-Item -ItemType Directory -Force $work | Out-Null; $log = Join-Path $work 'pipeline.log'
function Note($m) { [IO.File]::AppendAllText($log, (Get-Date -Format HH:mm:ss) + " run-forever: $m`r`n") }   # no -f: messages may hold braces
if (Test-Path (Join-Path $work 'DONE')) { exit }   # finished earlier: delete DONE to run again
if (Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*run-forever.ps1*' }) { exit }   # already running
Set-Location $root
$fetchCmd = "node tools/ocr-gpu/get-commons.mjs --pages $Pages --per $Per --work ""$work"""   # freococo is complete (all 5 offsets of get-pool.mjs --every 5 are in the pool)
$fetch = Start-Process cmd -ArgumentList '/c', "$fetchCmd > ""$work\fetch.log"" 2>&1" -WindowStyle Hidden -PassThru
Note "downloads started (pid $($fetch.Id))"
$fails = 0; $round = 0
function Lines($f) { if (Test-Path $f) { [IO.File]::ReadAllLines($f).Count } else { 0 } }
while ($true) {   # GPU rounds over the pages that are there
  $round++; $before = Lines "$work\pool\qari.jsonl"; $done = $fetch.HasExited
  try { & (Join-Path $PSScriptRoot 'run-pipeline.ps1') -Work $work -Offsets @() -Variants @() } catch { $fails++; Note "round $round FAILED: $($_.Exception.Message)"; if ($fails -ge 30) { exit 1 }; Start-Sleep 600; continue }
  $new = (Lines "$work\pool\qari.jsonl") - $before; Note "round $round read $new new lines"
  if ($done -and $new -eq 0) { break }   # downloads had finished before this round and it found nothing new
  if ((Get-Date) -ge $SweepAt) { Note "sweep time ($SweepAt) reached"; break }
  if ($new -eq 0) { Start-Sleep 600 }     # waiting for pages
}
for ($try = 1; $try -le 30; $try++) {   # the sweep: train in WSL, measure, verdicts in SUMMARY.md
  try {
    & (Join-Path $PSScriptRoot 'run-pipeline.ps1') -Work $work -Offsets @() -Full -Variants 'A:10000:0.0001','B:20000:0.00005','C:6000:0.0002','D:30000:0.00005','E:10000:0.00003','F:30000:0.00005:modern'   # F = D + 30 % modern-font lines (synth.py modern)
    Note 'finished'; Set-Content (Join-Path $work 'DONE') (Get-Date); break
  } catch { Note "sweep FAILED: $($_.Exception.Message)"; Start-Sleep 600 }
}
