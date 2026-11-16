#!/bin/bash
# One run of one sample, by a fresh Claude Opus session, exactly as a visitor would send it (site/samples/README.md).
#   site/samples/harness/run.sh <id> <run#> [<work-root>]
# The message is briefs.json's, unchanged: nothing is added to it. The session runs in a new empty folder, with no settings of this
# repository; npm is told to take a release of today (an environment variable, not part of the message). Wall clock is kept in time.txt.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ID="$1"; RUN="$2"; ROOT="${3:-${TMPDIR:-/tmp}/pe-samples}"
MSG="$(node -e "const b=require('$HERE/briefs.json').find(x=>x.id===process.argv[1]); if(!b){process.exit(2)} process.stdout.write(b.message)" "$ID")" || { echo "no brief $ID"; exit 2; }
D="$ROOT/$ID-run$RUN"; rm -rf "$D"; mkdir -p "$D"; cd "$D"
printf '%s' "$MSG" > message.txt
S=$(date +%s)
npm_config_min_release_age=0 timeout 3000 claude -p "$MSG" --model opus --setting-sources project,local --disable-slash-commands \
  --permission-mode dontAsk --allowedTools Bash Read Write Edit WebFetch Glob Grep --output-format json > result.json 2> err.txt
echo "$? $S $(date +%s)" > time.txt
echo "$ID run $RUN: $(cat time.txt) in $D"
