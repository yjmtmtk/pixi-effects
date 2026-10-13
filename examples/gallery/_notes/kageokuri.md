# kageokuri - usability notes
Model: opus   Slot: S9-title-sequence   Cycles: 8   Result: works
Timeline: start 12:51; brief written +5 min; first page that rendered at +5 min (12:56, it worked on the first run, one warning); first contact sheet looked at at +6; done at +11 (13:02)

## Went smoothly because the docs said so
- The 2.5D light system did what the docs promised on the first try: a `spot` with `castsShadows`, a `threeD` wall and a `threeD` TEXT layer with `castsShadows` throws a real shadow of the letters, and moving the lamp slides the shadow. The check's `light` line (how lit each layer is) confirmed the lamp-off at 12.8 s (0.05).
- Named matte with `channel: 'luma'` on a gradient rect = a soft-edged slit that reveals text; the docs' sentence "a wide gradient rectangle slid across the layers is a soft, moving reveal" was exactly the recipe.
- `splitText()` gave per-letter x positions, so each letter's afterimage starts at the frame the slit's centre crosses it (linear ease, computed time), no guessing.
- The `music` read-back in `check` (bars per track, what starts where) let me verify the music-box notes land on beats 2/4/6/7.5 without listening; `waveform.png` showed the inaudible riser at once.
- The warning for `fillColor` on a path (stumble 2) named the fix verbatim.
- 0 library warnings at the end; layout check clean; full check incl. export about 40 s.
- `npx --no-install pixi-effects new kageokuri` worked at once; the AGENTS.md → quickstart → SKILL.md path is short.
- `help light` + `recipe spot-room` gave a full spot + cast shadow example in one screen; `help music` gave the token grammar and the beat rule.

## Stumbles   (one entry each, also small ones)
### 1. WebFetch of AGENTS.md returns a summary, not the file   [TOOLING]
- tried: WebFetch on raw.githubusercontent.com/.../AGENTS.md with "return the full text verbatim".
- happened: the fetch tool's small model refused to quote and gave a paraphrase. The paraphrase was enough to find quickstart/SKILL.md, but the exact commands had to come from the local copy.
- would have prevented it: nothing in the library; AGENTS.md is short enough that a summary still works (good sign).
### 2. `fillColor` on a path shape at top level is ignored   [MY-MISTAKE, warning was perfect]
- tried: `{ type: 'shape', shape: 'path', d, fillColor: '#fff' }` as a named matte (my `blinds()` helper spread extras at the top level).
- happened: `layer "blinds": "fillColor" is a property, not a path shape key, so it is ignored: write it in initial (initial: { fillColor: "#ffffff" }) or in a keyframe`. The matte had no fill, so the masked cast names were invisible. The warning said exactly what to write.
- note: `fillGradient` IS allowed at top level (the docs say "top level or in initial"), `fillColor` is not: the asymmetry is what tripped me.
### 3. Two copies of the same stripes (one matte, one visible) did not line up   [GAP]
- tried: the blinds as a named path matte for the lit text + a second, identical path (same d / x / y / rotation / keyframes) with a blur filter and a gradient fill as the visible light.
- happened: at 4.5 s the lit letters did not sit in the visible stripes (looked like a vertical gradient instead of slats). I did not find out why (the blur filter or the gradient's bounds may move the drawn copy).
- fix: the visible light became a full-frame warm rect masked by the same matte (`mask: 'blinds'`), with the blur on the matte itself. Now light and lit letters always coincide, one source of truth.
- would have prevented it: a line under "Named mattes": "to show the light of a matte, draw a rect masked by the matte instead of a second copy of the shape".
### 4. `initial: { fill }` on a text layer is silently ignored   [LIBRARY-BUG or GAP]
- tried: title text with `style.fill` tungsten and `initial: { ..., fill: '#6a5e4f' }`, then a keyframe `to: { fill: tungsten }` (the title should start the colour of the wall so only its shadow reads).
- happened: no warning; the title was tungsten from the first frame (6.5 s frame). Moving the start colour into `style.fill` worked at once.
- would have prevented it: either honour `fill` in `initial` (it is an animatable prop, everything else animatable works there) or warn "fill in initial is ignored on text: put the start colour in style.fill".

## Docs I read, and which answered my question
- AGENTS.md (WebFetch only returned a summary, not the text; the local copy in the repo is the same file), quickstart.md, SKILL.md: enough to start.
- `help light` + `recipe spot-room`: answered everything about the lamp and the cast shadow.
- `help music`: answered the score grammar (chord kinds incl. `maj7#11`, `madd9`, `vol` ramps, `ring`, `reverb` per track).
- `help mask`: answered the named matte + luma channel.
- `help sfx`: knobs and loud points (riser loudest at its end: `at = hit - duration`).
- `help fillGradient`, `help grain` (landed on the named-filter table, which has `grain`), `help splitText` (landed on pitfalls 52/63 + api, fine), `help camera`, `help blur` (landed on motion blur and the filter table; the blur options were in the table).
- Did not answer: why two identical paths (one matte, one drawn with a blur and a gradient) did not coincide (stumble 3); whether `fill` is allowed in a text layer's `initial` (stumble 4: the docs only say "under to/from/set, not under style").
- Not read: cheatsheet.md, pitfalls.md end to end, direction.md (a title sequence with invented content did not need its asset rules; brief.md covered the rest).

## Wished the library had
- A warning (or support) for `initial: { fill }` on text (stumble 4).
- A "light through a gobo" helper: a spot light whose cone is cut by a pattern (blinds, a window) would have let scene 2 use the real light system instead of a matte + additive rect. Today the cone is only a soft circle.
- `check` printing the export wall time (it prints the size; I timed `render` separately: 12.5 s for 14 s).
- The review list flags each per-letter afterimage as "overlapping" its lit copy (intended ghost copies): a way to mark a pair as intentional (e.g. `overlapOk: 'name1-lit'`) would make the list shorter for pieces that are built on copies.

## Self-assessment
1. Scene 2 (3-6 s): the cast names under the blinds read more as "warm gradient over grey text" than as crisp slats crossing the letters; the slats (20 px) are thinner than the glyphs (38 px). With 3 more cycles: wider slats (34 px, period 70), sharper matte (blur 0.5) and the names a touch larger so each slat clearly cuts through letters.
2. 7.2-9 s, and the final hold: the shadow is offset by less than a glyph, so it overlaps the letters of 送り and muddies them at the moment the letters warm up. I would push the lamp further left at the end (bigger lateral offset, ~70 px) so letter and shadow separate, and keep the shadow lighter (darkness 0.6).
3. The first bar is very sparse (a 2 px line and a small name in a 2.39 frame); it is deliberate restraint, but the slit could also faintly light a floor line or dust in its beam to give the room depth. Also the grain makes the export heavy (9.66 MB for 14 s); a lower grain (0.02) or `fps: 12` grain would halve it.

## Critique rounds
### Round 1 (after the first render, 12:57)
1. 6.4-11 s: the title's shadow sat ~100 px away, as hard and dark as the letters: it read as a doubled title. -> wall moved from z -160 to -70 (offset ~40-60 px), shadowDiffusion 5 -> 14, shadowDarkness 0.9 -> 0.75, lamp path changed so the shadow slides from upper-right to lower-right.
2. 4.5 s: cast names grey only; the lit copy was missing (matte without fill, stumble 2).
3. 9-11 s: KAGEOKURI 15 px and the year 17 px were lost in the grain; title (tungsten) on a bright tan wall had low contrast. -> 16 / 19 px, wall darkened #9c8d78 -> #6a5e4f.
### Round 2 (12:58)
1. 10.5 s: grain 0.05 made the wall look like cork/sandpaper. -> 0.03, size 1.2.
2. 10.5 s: KAGEOKURI crossed by the shadow of 影. -> moved 24 px lower.
3. 4.5 s: lit letters not inside the visible slats (stumble 3); the slat patch had hard ends inside the frame. -> light = rect masked by the matte; slats 1640 px long so their ends are off screen.
4. 6.4 s: the brief promised "the title is announced by its own shadow", but letters and shadow appeared together. -> letters start the wall's colour and warm up 7.2-9.0 s (stumble 4).
5. 3.8 s: the director's afterimage still on screen under the blinds. -> afterimage decay 2.0 -> 1.6 s, hold 0.7 -> 0.6.
### Round 3 (13:01, full sheet + waveform.png)
1. 4.0-6.0 s: the riser (brightness -0.6, volume 0.5) was invisible on the waveform and inaudible: the title hit came from nowhere. -> brightness -0.3, volume 1.0.
2. Whole piece: -20 LUFS integrated, quieter than the -14..-16 the docs name for web video. -> music volume 0.9 -> 1.35: -16.5 LUFS, true peak -2.6 dBTP.
3. 0.3 s: the lamp-on click was the loudest transient of the first bar (-13 dBFS peak against a -40 dB room). -> volume 0.6.
4. 1.3-2.5 s: the director's name (34 px) was a speck in an empty 2.39 frame. -> names 38 px (still restrained; role labels stay 15 px).
