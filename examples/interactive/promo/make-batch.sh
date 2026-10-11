#!/bin/zsh
# Six real renders of the card page, one MP4 per name: what the promo's grid plays. Run from the repository root after `npm run build`.
cd "$(dirname "$0")/../../.." || exit 1
mkdir -p examples/interactive/promo/clips
render() { node ai/tools/render.mjs examples/interactive/card.html -o "examples/interactive/promo/clips/batch-$1.mp4" --var "name=$2" --var "age=$3" --var "top=$4" --var "bottom=$5" --quality medium --quiet; }
render aiko Aiko 30 '#ff7e5f' '#feb47b'
render ben Ben 12 '#2193b0' '#6dd5ed'
render chloe 'Chloé' 25 '#7f53ac' '#647dee'
render dev Dev 41 '#11998e' '#38ef7d'
render emi Emi 8 '#ff7e5f' '#feb47b'
render finn Finn 63 '#2193b0' '#6dd5ed'
