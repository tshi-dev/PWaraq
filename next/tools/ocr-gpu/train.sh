#!/bin/bash
# train.sh NAME GT_DIR ITERATIONS LEARNING_RATE OCR_DIR [EXTRA_GT_DIR]   (run inside WSL Ubuntu; paths are WSL paths)
# Fine-tunes ara_best on GT_DIR (tesstrain layout: line .png + .gt.txt), packs an integer model WITH the START model's config and
# dawgs, and writes OCR_DIR/ara_<NAME>p.traineddata.gz (OCR_DIR = the app's git-ignored public/ocr; ara_best.traineddata.gz must be there).
# One-time set-up: apt install tesseract-ocr libtesseract-dev make python3-pil python3-bidi python3-numpy ; git clone tesstrain.
set -e
NAME=$1; GT=$2; IT=$3; LR=$4; OCR=$5; EXTRA=$6; R=/root/waraq-train; T=$R/tesstrain
mkdir -p $R/tessdata
[ -f $R/tessdata/ara.traineddata ] || gzip -dc "$OCR/ara_best.traineddata.gz" > $R/tessdata/ara.traineddata
[ -d $T ] || git clone -q https://github.com/tesseract-ocr/tesstrain.git $T
cd $T; G=data/silver-ground-truth${EXTRA:+-$(basename "$EXTRA")}; mkdir -p $G; cp -r --update=none "$GT"/. $G/; [ -z "$EXTRA" ] || cp -r --update=none "$EXTRA"/. $G/   # one folder for every variant: tesstrain builds each line file once (and no "*": 59k files is too many arguments); with EXTRA lines a folder of its own
[ ! -e data/$NAME ] || { mkdir -p $R/old; mv data/$NAME $R/old/$NAME-$(date +%m%d%H%M); mv data/$NAME.traineddata $R/old/ 2>/dev/null || true; }   # tesstrain resumes an old checkpoint (one already at MAX_ITERATIONS trains nothing): start fresh, keep the old one
make -j8 training MODEL_NAME=$NAME START_MODEL=ara TESSDATA=$R/tessdata LANG_TYPE=RTL PSM=13 GROUND_TRUTH_DIR=$G MAX_ITERATIONS=$IT LEARNING_RATE=$LR > $R/$NAME.log 2>&1
lstmtraining --stop_training --continue_from data/$NAME/checkpoints/${NAME}_checkpoint --traineddata data/$NAME/$NAME.traineddata --convert_to_int --model_output $R/${NAME}_int.traineddata > /dev/null 2>&1
bash "$(dirname "$0")/package.sh" $R/${NAME}_int.traineddata $R/${NAME}_pi.traineddata > /dev/null
gzip -9 -c $R/${NAME}_pi.traineddata > "$OCR/ara_${NAME}p.traineddata.gz"
echo "trained $NAME -> $OCR/ara_${NAME}p.traineddata.gz"
