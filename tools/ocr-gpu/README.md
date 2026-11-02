# OCR on the GPU: teachers for fine-tuning Tesseract (measurement tooling, nothing here ships)

Idea: big local models read scanned Arabic lines on the GPU (teachers); the lines two teachers agree on become training
data (silver labels) for the small Tesseract `ara` model that Waraq ships. Everything runs on this PC, no cloud, no paid API.

## Set-up (once)
```
python -m venv .venv-gpu                      # git-ignored
.venv-gpu\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
.venv-gpu\Scripts\pip install transformers accelerate pillow qwen-vl-utils huggingface_hub bitsandbytes pymupdf
set HF_HUB_DISABLE_XET=1                      # the Xet download path stalled at 0 bytes on this PC
```
Versions on the PC (29 Oct 2026): Windows 11, RTX 3060 Ti 8 GB (driver 610.88, CUDA 13.3), Python 3.11.9,
torch 2.14.1+cu126 (`torch.cuda.is_available()` = True), transformers 5.21.0, accelerate 1.15.0, bitsandbytes 0.50.2,
pymupdf, huggingface_hub.

Surya OCR 2 on the GPU needs llama.cpp's CUDA build (release b11756 `llama-b11756-bin-win-cuda-12.4-x64.zip` + the
`cudart-llama-bin-win-cuda-12.4-x64.zip`, MIT) unpacked into `.venv-gpu/llama`; the download was blocked by this session's
permission guard — see the report.

## Files
- `read_pages.py` — a teacher reads page pictures (`--model qari|qari4`; `--lines` for line pictures) → `DIR/<name>.txt`, `times.json`.
- `score.mjs` — words right / chars right per slice, same text comparison as `tools/ocr-accuracy.mjs`.

## Workflow (data and models live outside git, in `../ocr-gpu-work/`)
1. `node tools/ocr-gpu/get-pool.mjs --every 5 [--offset 2]` — pool pages (freococo/ocr_arabic_books, CC BY-NC-ND 4.0; the 8 test rows skipped).
2. `node tools/ocr-gpu/split-lines.mjs` → `.venv-gpu\Scripts\python -I tools\ocr-gpu\crop_lines.py WORK 0.02 lines02` (2 % padding: tight crops matter).
3. `read_pages.py --model qari --lines WORK/pool/lines02.list.json --out WORK/pool/qari.jsonl`, then `agree.mjs A.jsonl --list` (shortlist) and `read_pages.py --model qari4 ...` for the second teacher.
4. `node tools/ocr-gpu/agree.mjs qari.jsonl qari4.jsonl --jobs lines02.list.json --out gt02p --plain` (`--plain` = unvowelled lines only).
5. WSL: `make training MODEL_NAME=x START_MODEL=ara TESSDATA=<dir with ara_best as ara.traineddata> LANG_TYPE=RTL PSM=13 GROUND_TRUTH_DIR=data/gt02p-ground-truth MAX_ITERATIONS=5000 LEARNING_RATE=0.0001`, then `export_ckpt.sh` / `package.sh` (tesstrain's own output has no `config` or dawgs: always repackage).
6. `node tools/ocr-accuracy.mjs --only real/s,real/m,real/w --ara ara_x` and `python tools/ocr-gpu/slices.py base.log new.log`.

## Result (29 Oct 2026, report: `Archive-2026-10-12/reviews/OCR-GPU-2026-10-29.md`)
Best fine-tune (2,002 unvowelled silver lines) 70.7 % words vs stock 72.6 % on the 413 real scans: not kept. It gains +9.3 words on full-tashkeel pages and +11.9 on old books but loses 2.8 on plain prints. Things that broke it, in order: missing config/dawgs in tesstrain output, 25 % crop padding, vowelled lines with marks stripped from the label, synthetic fonts.

## Unattended run (no Claude, no tokens)
`run-pipeline.ps1` does every step above in order and skips what is already done (re-run it after a reboot); `verdict.py` applies
the keep rule (beats stock words overall, no slice drops > 1 point, placement >= 95 %) and `WORK\SUMMARY.md` gets the tables.
`run-forever.ps1` runs it over the whole pool, `-Pages` (140,000; at most `-Per` 500 a work) public-domain Commons pages (`get-commons.mjs`: works indexed by Arabic
Wikisource, licence "Public domain" checked per file, the test set's work excluded) and a 5-variant sweep, retrying after failures.
Start it detached; it keeps Windows awake only while it runs; nothing is wired into the app or pushed:
```
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','tools\ocr-gpu\run-forever.ps1'
```
Since 2 Nov the work folder is `D:\ocr-gpu-work` (`-Work`; 2 TB drive, nothing is deleted) and the teachers' downloads are `D:\hf-cache`
(`HF_HOME`, set by `run-pipeline.ps1`). `disk-guard.ps1` frees the two unused model downloads if C: ever falls under 25 GB.
Status in plain words: `tools\ocr-gpu\status.ps1` (desktop shortcut "OCR training status"). Moving the HF cache: robocopy /MOVE
breaks its snapshot links (blobs move first); re-link with hf_hub_download, and leave a junction at the old place.
Check: `D:\ocr-gpu-work\pipeline.log` (progress), `SUMMARY.md` (verdicts), `DONE` (finished). Stop: end the hidden powershell /
python / node processes whose command line mentions `ocr-gpu`.
