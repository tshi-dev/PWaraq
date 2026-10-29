#!/bin/bash
# export_ckpt.sh MODEL CHECKPOINT_FILE NAME : one tesstrain checkpoint -> int model with the START model's config + dawgs -> public/ocr/ara_NAMEp.traineddata.gz
set -e
M=$1; C=$2; N=$3; D="/mnt/c/Users/Abdullah/Documents/ChatGPT/PDF Open Source/waraq-next/public/ocr"
cd /root/waraq-train/tesstrain
lstmtraining --stop_training --continue_from data/$M/checkpoints/$C --traineddata data/$M/$M.traineddata --convert_to_int --model_output /root/waraq-train/${N}_int.traineddata > /dev/null 2>&1
bash "/mnt/c/Users/Abdullah/Documents/ChatGPT/PDF Open Source/ocr-gpu-work/package.sh" /root/waraq-train/${N}_int.traineddata /root/waraq-train/${N}_pi.traineddata > /dev/null
gzip -9 -c /root/waraq-train/${N}_pi.traineddata > "$D/ara_${N}p.traineddata.gz"; echo done $N
