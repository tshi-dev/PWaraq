# Disk guard (no Claude, no tokens): every 10 minutes, while C: has less than MinFreeGB free, delete model downloads nothing uses,
# biggest first, one at a time, until there is room again. Start it detached:
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','tools\ocr-gpu\disk-guard.ps1'
# -DryRun lists what it would delete and exits. Deletions are noted in WORK\pipeline.log.
# Only ever deleted: Qwen/Qwen3-VL (Qari 4B loads unsloth/Qwen3-VL, not this copy) and dots.ocr (never run). The work data (pool pages,
# line crops, gt02p, models, results) is never touched: it lives on D: (run-forever.ps1 -Work), which has room for the whole run.
# Not persistent: it ends at a reboot or when nothing is left to delete.
param([int]$MinFreeGB = 25, [switch]$DryRun)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path; $work = 'D:\ocr-gpu-work'; if (-not (Test-Path $work)) { $work = Join-Path (Split-Path $root) 'ocr-gpu-work' }
$hub = Join-Path $(if (Test-Path 'D:\hf-cache') { 'D:\hf-cache' } else { "$env:USERPROFILE\.cache\huggingface" }) 'hub'; $log = Join-Path $work 'pipeline.log'
function Note($m) { [IO.File]::AppendAllText($log, (Get-Date -Format HH:mm:ss) + " disk-guard: $m`r`n") }
function FreeGB { [math]::Round((Get-PSDrive C).Free / 1GB, 1) }
$unused = @("$hub\models--Qwen--Qwen3-VL-4B-Instruct", "$hub\models--rednote-hilab--dots.ocr")
if ($DryRun) { "free: $(FreeGB) GB, limit $MinFreeGB GB"; $unused | Where-Object { Test-Path $_ }; exit }
if (Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*disk-guard.ps1*' }) { exit }   # already running
Note "watching C: (delete below $MinFreeGB GB free; now $(FreeGB) GB)"
while (@($unused | Where-Object { Test-Path $_ }).Count) {
  foreach ($d in $unused | Where-Object { Test-Path $_ }) {
    if ((FreeGB) -ge $MinFreeGB) { break }
    $before = FreeGB; Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue
    Note "deleted $d (free $before -> $(FreeGB) GB)"
  }
  Start-Sleep 600
}
Note 'nothing left to delete: stopped'
