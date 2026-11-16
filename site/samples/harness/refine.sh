#!/bin/bash
# One run of one refined sample: the first message in a fresh Claude Opus session, then each follow-up of briefs.json sent into the same
# session (--resume), exactly as written. Wall clock of the whole conversation in time.txt; every message in messages.txt.
#   site/samples/harness/refine.sh <id> <run#> [<work-root>]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ID="$1"; RUN="$2"; ROOT="${3:-${TMPDIR:-/tmp}/pe-samples}"
get() { node -e "const b=require('$HERE/briefs.json').find(x=>x.id===process.argv[1]); if(!b){process.exit(2)} const v=process.argv[2]==='n'?String((b.followups||[]).length):process.argv[2]==='m'?b.message:b.followups[Number(process.argv[2])]; process.stdout.write(v)" "$ID" "$1"; }
MSG="$(get m)" || { echo "no brief $ID"; exit 2; }
N="$(get n)"
D="$ROOT/$ID-run$RUN"; rm -rf "$D"; mkdir -p "$D"; cd "$D"
FLAGS=(--model opus --setting-sources project,local --disable-slash-commands --permission-mode dontAsk --allowedTools Bash Read Write Edit WebFetch Glob Grep --output-format json)
S=$(date +%s)
printf '%s\n' "$MSG" > messages.txt
npm_config_min_release_age=0 timeout 3000 claude -p "$MSG" "${FLAGS[@]}" > result-0.json 2> err-0.txt
SID="$(node -e "process.stdout.write(require('./result-0.json').session_id||'')")"
for ((i = 0; i < N; i++)); do
  F="$(get $i)"; printf '%s\n' "$F" >> messages.txt
  npm_config_min_release_age=0 timeout 3000 claude -p "$F" --resume "$SID" "${FLAGS[@]}" > "result-$((i + 1)).json" 2> "err-$((i + 1)).txt"
done
echo "0 $S $(date +%s)" > time.txt
echo "$ID run $RUN: $(cat time.txt) in $D"
