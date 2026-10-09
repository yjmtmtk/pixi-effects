# 01-type — stumble notes
Model: fable (Claude Fable 5.1, self-reported)   Cycles: 5   Result: works

## Went smoothly because the docs said so
- `animateText` as "one call, one layer per piece, x/y numbers, y is the TOP of the line box" (cheatsheet + pitfall 63): the rule under MOTION landed at `y + measureText().height + 14` first time.
- `splitText` returning top-left pieces with `width`: converting to a centred anchor (`x + width/2`, `y + lineHeight/2`) so each word scales about its own centre was obvious from the recipe.
- `stagger(layers, { each })` returns copies with `at` pushed back; the pitfall that keyframe `at` is layer-local made the "all words leave together" fix a one-line `duration: END - at` map.
- `{value}` + `format: { grouping: true }` counter from the count-up recipe; `styleFor` to colour `、` and `。` vermilion; `measureText` to size the display word to the margins (`fit()`), no eyeballing of 0.8 × fontSize.
- `check --at a,b,c` wrote exactly the frames I wanted to see; `warnings none` on the first run.

## Stumbles
### 1. A true counter was too small to read as a counter   [MY-MISTAKE]
- tried: counting this chapter's own text layers (`seq.filter(l => l.type === 'text').length`) — honest, self-referential.
- happened: the number was 26; at 380 px it reads "25 → 26", not "a counter counting". Nothing wrong in the library; a design miss.
- cause: a counter needs digits to spin; small true numbers do not move enough in 1 s.
- would have prevented it: a line in the recipes: "a counter reads as motion only with 4+ digits (or decimals); use `format.grouping` so the commas land".
- fix: count the pixels of one frame (1920 × 1080 = 2,073,600), sized with `fit()` on `PIXELS.toLocaleString('en-US')` so the final string fits.

### 2. `animateText`'s `out` leaves in the same wave as the entrance   [SPEC-ODD]
- tried: a quick clean exit for the five words that land on a beat (each 0.3 s apart).
- happened (foreseen from the cheatsheet, not a warning): with `out`, the words would leave 0.3 s apart in the same wave, 1.2 s spread for a cut that should be one beat. So beat 2 is `splitText` + `stagger` by hand with a hand-written `{ at: -0.2 }` exit and `duration: T2_END - at` per layer.
- would have prevented it: an `out: { …, stagger: false }` (or `outStagger`) option on `animateText`, so an exit can be a single beat while the entrance is a wave.

### 3. Vertical centring by eye   [MY-MISTAKE]
- tried: display word centred at y 450.
- happened: the first `at.png` showed the beats sitting high over the bottom caption's empty band; moved every beat's centre to 470–490.
- would have prevented it: nothing in the library; the contact sheet caught it on the first look, which is the point of looking.

### 4. A word arriving at scale 1.6 brushed its neighbour   [MY-MISTAKE]
- tried: words land with `from: { scale: 1.6 }` over 0.22 s; `splitText` places them at their resting width.
- happened: the full-run sheet caught "ON THE" touching for a few frames while THE was still oversized; `inspect` does not flag it (it is a 0.1 s overlap, and `review` lists it only when it lands on a sampled frame).
- fix: scale 1.35. Cost one wasted `--at` cycle too: I asked for 3.45–3.55 and the word lands at 3.6 (2.7 + 3 × 0.3); compute the beat times from the data before naming frames.
- would have prevented it: a note in the split-text recipe: "a scale-in from s > 1 needs s × width of room, or neighbours touch while it lands".

## Wished the library had
- `animateText` option to run the exit as one beat (`out: { stagger: false }`) instead of the entrance wave backwards.
- `fit`-style helper: `measureText` is enough, but a `fitText(text, style, maxWidth)` returning the largest fontSize is something every title needs.
- A reel-wide note that `-32 LUFS` from sparse sfx at volume 0.3–0.6 is expected when music is the bed (the check's "quiet for web video" note is right for a stand-alone piece, misleading for a chapter).
