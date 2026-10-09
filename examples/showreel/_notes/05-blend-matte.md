# 05-blend-matte — stumble notes
Model: opus (Claude Opus 5.5, self-reported)   Cycles: 6   Result: works

## Went smoothly because the docs said so
- Named matte shared by three layers (`mask: 'band'` on a panel, a hatch path and the word) worked on the first run with `warnings none`; the docs said plainly that the band itself is not drawn and must live as long as its users (I let it live the whole chapter).
- A matte with a `parent` follows the null (dsl.md, Named mattes rule 3): ONE null moves the invisible band AND the two drawn edge lines, so the edges always sit exactly on the matte. Rule 3 also warned me not to put `parent` on the masked layers.
- `blendMode` on a layer that also has a named `mask` (the color-dodge leak cut to the letters) just worked, as rule 5 promises.
- dsl.md blendMode rule 8 ("color-dodge over a dark backdrop gives a saturated colour") explained at once what I saw in stumble 2.

## Stumbles
### 1. The luma gradient ran top to bottom, so the "soft" reveal had a hard edge   [GAP / MY-MISTAKE]
- tried: a wide rect `fillGradient: { stops: [[0,'#fff'],[0.62,'#fff'],[1,'#000']] }` slid left to right as `{ layer: 'fade', channel: 'luma' }`.
- happened: no warning; the word was revealed with a HARD vertical edge (the rect's own right edge) and the bottoms of the letters were darkened. The gradient was vertical.
- cause: a linear `fillGradient` defaults to `angle: 90` (top → bottom). dsl.md's table says "(default)", but the cheatsheet only says `angle? /* linear, deg, 90 = top→bottom */`, which I read as an example, not the default. Fixed with `angle: 0`.
- would have prevented it: the cheatsheet saying "default 90 = top→bottom; 0 = left→right", and the Named-mattes text ("a wide gradient rectangle that you slide across the layers") showing that rectangle with `angle: 0`.

### 2. A color-dodge light leak over the dark room was a muddy red disc   [SPEC-ODD (documented)]
- tried: the `light-leak` recipe's `color-dodge` radial over ink with a vermilion word.
- happened: on the letters it burned beautifully to gold; around them, over near-black, it made a big saturated dark-red blob that read as a stain, not light.
- cause: dodge divides the backdrop by (1 − source): each channel of a near-black lifts separately, red the most. dsl.md rule 8 says so.
- fix: a fourth, matte-only text layer `letters` (white `MATTE`) as the leak's `mask`, so the dodge only burns the letters; the warm haze in the room is a separate `screen` radial. Would have helped: the `light-leak` recipe noting "over a dark picture, cut the dodge to the bright subject with a matte and use `screen` for the haze".

### 3. A wide soft edge read as murky, not soft   [MY-MISTAKE]
- tried: a 1400 px soft zone on the luma matte.
- happened: half-revealed vermilion over ink is brown, so for a second the word looked dirty rather than fading in. Narrowed the zone to ~760 px and shortened the move (1.8 s): it reads as a soft wave now.

### 4. `review` lists the word copies as 100 % overlaps   [TOOLING]
- The ghost outline, the band word and the luma word are deliberate copies; the check lists three 100 % overlaps on every frame. Harmless (it says they are often intentional), just noise; a way to mark a layer as an intentional copy (or skipping text layers that are masked by a named matte) would quiet it.

### 5. Audio notes say "quiet / silent"   [TOOLING]
- -30 LUFS and "silent from 4.5 s to 7 s" are expected (two sfx hits; the reel's music is the bed). Fine, but the chapter harness could say that the music is added later.

## Wished the library had
- A union of mattes (`mask: { any: ['band', 'fade'] }`): I needed a second copy of the word because a list is only an intersection.
- `fillGradient: { direction: 'to right' }` (CSS words) next to `angle`, so the direction is never a guess.
