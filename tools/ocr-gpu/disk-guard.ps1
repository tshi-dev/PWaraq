# Disk guard (no Claude, no tokens): every 10 minutes, while C: has less than MinFreeGB free, delete what the OCR fine-tune no
# longer needs, biggest first, one folder at a time, until there is room again. Start it detached:
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','tools\ocr-gpu\disk-guard.ps1'
# -DryRun lists what it would delete (and in which order) and exits. Deletions are noted in WORK\pipeline.log.
# Tier 1, any time: model downloads nothing uses (Qari 4B loads unsloth/Qwen3-VL, not Qwen/Qwen3-VL; dots.ocr was never run) and the
# first round's crops. Tier 2, only once WORK\DONE exists (a sweep retry crops again from the pages): the pool pages and their crops.
# Never touched: gt02p (the training data), models, results, the line lists and teacher outputs, the teachers in use, .venv-gpu.
# Not persistent: it ends at a reboot or when nothing is left to delete.
param([int]$MinFreeGB = 25, [switch]$DryRun)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path; $work = Join-Path (Split-Path $root) 'ocr-gpu-work'
$hub = Join-Path $env:USERPROFILE '.cache\huggingface\hub'; $log = Join-Path $work 'pipeline.log'
function Note($m) { [IO.File]::AppendAllText($log, (Get-Date -Format HH:mm:ss) + " disk-guard: $m`r`n") }
function FreeGB { [math]::Round((Get-PSDrive C).Free / 1GB, 1) }
$tier1 = @("$hub\models--Qwen--Qwen3-VL-4B-Instruct", "$hub\models--rednote-hilab--dots.ocr", "$work\pool\lines", "$work\pool\lines08", "$work\gt02", "$work\gt08", "$work\gt")
$tier2 = @("$work\pool\lines02", "$work\pool\pages")
if ($DryRun) { "free: $(FreeGB) GB, limit $MinFreeGB GB"; $tier1 + $tier2 | Where-Object { Test-Path $_ } | ForEach-Object { $_ + $(if ($tier2 -contains $_) { '   (after DONE)' }) }; exit }
if (Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*disk-guard.ps1*' }) { exit }   # already running
Note "watching C: (delete below $MinFreeGB GB free; now $(FreeGB) GB)"
while (@($tier1 + $tier2 | Where-Object { Test-Path $_ }).Count) {
  $ready = $tier1 + $(if (Test-Path "$work\DONE") { $tier2 }) | Where-Object { Test-Path $_ }
  foreach ($d in $ready) {
    if ((FreeGB) -ge $MinFreeGB) { break }
    $before = FreeGB; Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue
    Note "deleted $d (free $before -> $(FreeGB) GB)"
  }
  Start-Sleep 600
}
Note 'nothing left to delete: stopped'
