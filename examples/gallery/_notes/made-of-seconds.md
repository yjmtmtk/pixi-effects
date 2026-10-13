# made-of-seconds - usability notes
Model: opus   Slot: S17-time-design   Cycles: 7 (edit/look)   Result: works
Timeline (by `date`): started 12:52; brief.md at about +3 min; first page rendered and first contact sheet looked at about +5 min (it worked on the first run, no warnings); done at +9 min (13:01). The library got out of the way: almost all the time went into design decisions.

## Went smoothly because the docs said so
- `quickstart.md` + SKILL.md were enough to start; `help set` answered "can a keyframe jump a colour" via dsl.md:959 (`set` = instantaneous assignment of any prop).
- `help click` printed the sfx table (preset lengths, brightness) and the note that sparse clicks need `volume` around 2.

## Stumbles   (one entry each, also small ones)
### 1. `echo ======` in my shell broke a chained help call   [MY-MISTAKE]
- tried: `help set; echo =====; help sfx` in zsh.
- happened: zsh `=word` expansion error; second help never ran. Nothing to do with the library.

### 2. Two unit kanji overlapped for 0.7 s each transition   [MY-MISTAKE, caught by the tool]
- tried: kanji layer k lives from the previous ring's close to the NEXT ring's close (off-by-one in my own `to`).
- happened: `check` listed under review: `text layers "kanji0" and "kanji1" overlap by 92% of the smaller one [22 frames, 150-315]`. Exactly right, with frames.
- would have prevented it: nothing; the review line is the right tool.
### 3. A formula line touched the counter without being flagged   [GAP]
- tried: count line `365 × 24 × 60 × 60` (30 px, x 276) beside the flush-right counter `31,536,000` (64 px).
- happened: the two strings butt against each other with 0 px gap at 11.5 s; `check` said "no collisions" (they touch, do not overlap). Seen only on the sheet.
- would have prevented it: a review line for text boxes closer than, say, 0.25 x the smaller font size ("tight: no gap between A and B").
### 4. Loudness: first mix -27 LUFS, then true peak -0.3 dBTP   [GAP, small]
- happened: notes said "quiet for web video" then "little headroom". Clicks at volume 2 were still quiet; the docs' hint ("a sparse track of clicks ... needed about 2 to reach -24 LUFS") was right. Two passes to land at -22 LUFS / -2.2 dBTP.
- would have prevented it: the note could say which layer sets the true peak (it named none).

## Critique round 1 (contact sheet at 0.6 ... 13.6 s)
- 11.5 s / 13.6 s: `365 × 24 × 60 × 60` collides with the counter. Fix: moved to a 15 px caption under the year dot.
- 5.1 s: during each collapse the left block shows `60 / 60` with no kanji (kanji ended, the next not yet in). Fix: the next unit's kanji and `00 / 60` come in when the ring closes.
- whole: -27 LUFS, the ticks are too timid to carry the idea. Fix: click volume 1.4-3.2 by spacing, hit 1.4, chime 1.6.
- 9.6 s: 1.5 px day ticks alias unevenly. Fix: 2 px.
- header: `1 YEAR` duplicated the YEAR label. Removed.

## Critique round 2 (4.7, 5.1, 5.4, 9.6, 11.5, 12.3, 13.6 s)
- 13.6 s: the end says 年 / YEAR while a new seconds ring is ticking: the narrative stops before its point. Fix: at the new ring 秒 / SECOND / `01 / 60` / header `01 / 04` return: the piece ends where it began, 31,536,001 seconds later.
- 11.5 s: the YEAR row has an empty count slot; accepted (the formula under the dot carries it).
- 12.3 s: two reds (year dot + nothing yet) are fine; the year dot turns bone exactly when the new tick turns red: the "now" moves.

## Critique round 3 (full sheet, onion 4.4-5.4 s, waveform)
- 11.3-12.2 s: the formula floating under the year dot read as decoration and cluttered the one moment that should be a single point. Fix: moved into the empty count slot under YEAR (15 px label style); the dot is alone.
- 10.3 s (poster): the days ring had already begun its expo.in shrink by 10.28 s. Fix: poster 10.2 s (ring full, 365 / 365, 31,536,000).
- onion 4.4-5.4 s: the collapse reads as "holds, then snaps into the centre" (expo.in): as intended; accepted.
- waveform: the four races sit at the same RMS plateau (about -28 dB); the pitch drop per unit (0, -5, -10, -15 st) is the only difference. Accepted, see weaknesses.

## Final check
`check` (full, with export): warnings none, layout clean over 57 frames, -22 LUFS, true peak -2.2 dBTP, mp4 735 KB, 13.83 s 1080x1080, whole check 17 s wall.

## Docs I read, and which answered my question
- quickstart.md, SKILL.md (all), `help set` (dsl.md "Changing text" + keyframe `set`), `help click`/`help sfx` (sfx table), `help null` (parent rigs).

## Wished the library had
- A "tight" review line for two text boxes with no gap (stumble 3).
- The true-peak note naming the loudest layer(s).
- `check --onion` was great for judging the collapse easing; an option to onion only some layers (the ring, not the text) would make it cleaner: the text cross-fades smear the picture.
- Nothing else: 500+ shape layers with `set` keyframes, nulls as ring rigs and 97 sfx layers built in 0.1 s and played without a hitch.

## Self-assessment
1. The four races sound alike (same click, same density at 30 Hz): with 3 more cycles I would give each unit its own timbre (a woody custom `voices` tick for hours, a faint pitched `bell` for days) so the ear also hears the scale grow.
2. The opening 0.25 s is a static header on black and the first real second (0.25-1.0) is quiet: a viewer scrolling may leave before tick 1. I would start the dim ring drawing on at frame 0 and land tick 1 at 0.8 s.
3. The 365-tick ring is close to the pixel grid's limit (2 px ticks every 5 px); on a phone-sized embed it becomes a grey band with moiré. I would try 365 dots or a continuous arc with 12 month gaps (which would also add a second layer of meaning).
