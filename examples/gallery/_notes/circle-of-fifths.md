# circle-of-fifths — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 4 check runs and 3 renders   Result: works
poster: sonnet (Claude Sonnet 5.5, self-reported) (poster time 12.3 s in `movie.init`)
Made on 2026-10-11 in the main working session, NOT by a fresh subagent from the brief: the author knew the library. A field test of "tonal does the music theory, pixi-effects shows it and plays it", not of the documentation.

## How tonal is used (the page imports `tonal` through the import map; the library did not change)
- The wheel: `Note.transposeFifths('C', n)` spells the twelve keys in fifths (C G D A E B F# Db Ab Eb Bb F), `Key.majorKey(k).minorRelative` the inner ring, `Key.majorKey(k).alteration` the key signature in the hub.
- The chords: `Key.majorKey(k).triads` has the seven triads of a key; the progression picks indexes `[0, 4, 5, 3]` (I V vi IV). `Chord.get(name)` gives type and tonic, `Chord.notes(type, tonic + '3')` the notes WITH octaves.
- One source for picture and sound: the same `events` list lights the wheel segment, the piano keys (`Note.midi`) and the text, AND is turned into the `music` text (`[d3 f#3 a3]:2` for the pad, `d2:1.5 d2:0.5` for the bass, the chord moved up an octave with `Note.transpose(n, '8P')` for the arpeggio). Nothing is analysed from the audio; the notes are known before anything plays.

## Stumbles
### 1. `Progression.fromRomanNumerals('D', ['I', 'V', 'vi', 'IV'])` is `['D', 'A', 'B', 'G']`   [NOTE, found by printing it]
- The case of a roman numeral does not make a chord minor: `vi` gave B MAJOR. Quality comes from a suffix (`VIm`). I took the chords from `Key.majorKey(k).triads` instead, which is right by construction. An AI that writes the lowercase numeral would make a wrong, major, chord.
### 2. The package does not load in plain Node   [NOTE]
- `tonal@6.5.0` and its `@tonaljs/*` parts list a `main` file that is not there, so `import 'tonal'` fails in Node; a bundler (esbuild) and the browser through jsDelivr `+esm` are fine. The page uses `https://cdn.jsdelivr.net/npm/tonal@6.5.0/+esm`; it worked at once in Chrome.
### 3. Empty text counts as a layout problem   [MY-MISTAKE]
- Text layers that start as `''` and are filled by `set` keyframes made `check` say "text layer has no size" for the first 53 frames and fail. Each starts with its first value, invisible, and fades in when the first chord starts.
### 4. Small ones   [MY-MISTAKE]
- The film ended on the last IV chord while the music held the home chord. A final "outro" event (the tonic chord, 3.5 s) is now part of the same list, so picture and sound end together.
- The flat and sharp signs (♯ ♭) are tiny in the mono system font; the key signature is spelled "3 ♯" and "no ♯ or ♭".

## Went smoothly
- `check`: no warnings after the fixes, export 4.5 MB, 21.5 s; two renders have the same frame hashes.
- `set: { text }` keyframes for the chord name, the roman numeral and the notes (the countdown recipe), polygons for annulus segments placed by their bounds' centre (learned in `d3-story`), `mask` rise-in lines and `grain`.
