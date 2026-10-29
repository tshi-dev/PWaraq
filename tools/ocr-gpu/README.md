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
