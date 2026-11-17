#!/bin/bash
# The promo of this project: a fresh Claude Opus session inside a clean clone of the site branch, given exactly the owner's phrase.
# AGENTS.md (and CLAUDE.md, which points to it) is the only guidance; nothing of this computer's user settings is loaded.
#   site/samples/harness/promo.sh <run#> <work-root> [<repository: a path or URL>] [<branch>]
# The message is briefs.json's "promo" entry, unchanged.
set -u
RUN="$1"; ROOT="$2"; REPO="${3:-https://github.com/yjmtmtk/pixi-effects}"; BRANCH="${4:-main}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MSG="$(node -e "process.stdout.write(require('$HERE/briefs.json').find(x=>x.id==='promo').message)")" || { echo "no promo brief"; exit 2; }
D="$ROOT/promo-run$RUN"; rm -rf "$D"; mkdir -p "$D"
git clone --quiet --branch "$BRANCH" "$REPO" "$D/pixi-effects" || exit 1
cd "$D/pixi-effects"
printf '%s' "$MSG" > ../message.txt
S=$(date +%s)
npm_config_min_release_age=0 timeout 3600 claude -p "$MSG" --model opus --setting-sources project,local --disable-slash-commands \
  --permission-mode dontAsk --allowedTools Bash Read Write Edit WebFetch Glob Grep --output-format json > ../result.json 2> ../err.txt
echo "$? $S $(date +%s)" > ../time.txt
echo "promo run $RUN: $(cat ../time.txt) in $D"
