#!/bin/bash
# package.sh IN.traineddata OUT.traineddata : keep the START model's config + dawgs, put in IN's lstm / lstm-unicharset / lstm-recoder
# (tesstrain's own output drops config and the three dawgs: Arabic then loses rows and its dictionary).
set -e
IN=$1; OUT=$2; T=$(mktemp -d); ORIG=/root/waraq-train/tessdata/ara.traineddata
combine_tessdata -u "$ORIG" $T/o. > /dev/null
combine_tessdata -u "$IN" $T/n. > /dev/null
for c in lstm lstm-unicharset lstm-recoder; do cp $T/n.$c $T/o.$c; done
combine_tessdata $T/o. > /dev/null
cp $T/o.traineddata "$OUT"
combine_tessdata -d "$OUT" | grep -E "^[0-9]+:" | tr '\n' ' '
echo
