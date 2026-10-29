#!/bin/bash
# train.sh NAME GT_DIR ITERATIONS LEARNING_RATE OCR_DIR   (run inside WSL Ubuntu; paths are WSL paths)
# Fine-tunes ara_best on GT_DIR (tesstrain layout: line .png + .gt.txt), packs an integer model WITH the START model's config and
# dawgs, and writes OCR_DIR/ara_<NAME>p.traineddata.gz (OCR_DIR = the app's git-ignored public/ocr; ara_best.traineddata.gz must be there).
# One-time set-up: apt install tesseract-ocr libtesseract-dev make python3-pil python3-bidi python3-numpy ; git clone tesstrain.
set -e
NAME=$1; GT=$2; IT=$3; LR=$4; OCR=$5; R=/root/waraq-train; T=$R/tesstrain
mkdir -p $R/tessdata
[ -f $R/tessdata/ara.traineddata ] || gzip -dc "$OCR/ara_best.traineddata.gz" > $R/tessdata/ara.traineddata
[ -d $T ] || git clone -q https://github.com/tesseract-ocr/tesstrain.git $T
cd $T; mkdir -p data/$NAME-ground-truth; cp -n "$GT"/* data/$NAME-ground-truth/
make -j8 training MODEL_NAME=$NAME START_MODEL=ara TESSDATA=$R/tessdata LANG_TYPE=RTL PSM=13 GROUND_TRUTH_DIR=data/$NAME-ground-truth MAX_ITERATIONS=$IT LEARNING_RATE=$LR > $R/$NAME.log 2>&1
lstmtraining --stop_training --continue_from data/$NAME/checkpoints/${NAME}_checkpoint --traineddata data/$NAME/$NAME.traineddata --convert_to_int --model_output $R/${NAME}_int.traineddata > /dev/null 2>&1
bash "$(dirname "$0")/package.sh" $R/${NAME}_int.traineddata $R/${NAME}_pi.traineddata > /dev/null
gzip -9 -c $R/${NAME}_pi.traineddata > "$OCR/ara_${NAME}p.traineddata.gz"
echo "trained $NAME -> $OCR/ara_${NAME}p.traineddata.gz"
