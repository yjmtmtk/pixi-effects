# Music range — design (2026-11-22)

## Why
Every `music` score an AI writes sounds alike: soft maj7/m7 progressions in F or C, 80–120 bpm, keys + bass + pluck + pad. A
9-genre listening test (synthwave, cinematic, techno, funk, chip, ambient, waltz, trap, blues) showed that harmony, rhythm and
form can already vary, but timbre is capped by 8 soft, clean voices, and the docs show one lo-fi example that every AI copies.
The owner asked for features that widen the creative range and left every decision to Claude.

## Goals
- Genres that today only sound "approximated" become recognisable: rock (distorted guitar), EDM / house (supersaw, sidechain pump,
  filter sweeps), orchestral (strings, brass, choir), chip (square), trap (808 with glide and drive), organ / gospel, acoustic piano,
  mallets.
- One line stays enough for the common case; every new key is named in warnings with did-you-mean (AI-friendly rule).
- The docs make an AI choose a genre first instead of copying the lo-fi example.

## Non-goals / anti-goals
- No samples, no files, no new dependencies: everything is seeded DSP as today.
- Existing scores must not change by a single bit (the pinned checksums in tests/audio/music.test.ts stay). New options are off
  unless written; the default drum kit is the current one; the existing 8 voices are not edited except for a glide branch that is
  not taken without `glide`.
- No vocals / lyrics; no general-purpose effect graph (fixed per-track chain, fixed order).

## What gets built (Claude's calls)
1. **Twelve new instruments**: `piano`, `organ`, `strings`, `brass`, `choir`, `flute`, `guitar`, `saw`, `supersaw`, `square`,
   `808`, `marimba`. Aliases point real words at them (violin → strings, trumpet → brass, chip / 8bit → square, xylophone → marimba,
   …). `piano`, `organ`, `strings`, `flute`, `guitar`, `808` used to be aliases of other voices; they now sound like themselves.
2. **Per-track effects**, fixed order voice → `drive` → `crush` → `tone` (a number, or `[beat, value]` points: a filter sweep) with
   `resonance` → `chorus` → level / `sidechain` / pan → `delay` send → reverb send.
   - `drive` 0–1 saturation; `crush` 0–1 bit / rate reduction; `resonance` 0–1; `chorus` 0–1;
   - `delay`: a number (mix, a dotted-eighth echo) or `{ beats, mix, feedback }`;
   - `sidechain` 0–1: the track ducks under every kick of the drums (the house pump);
   - `glide` seconds: each note slides from the previous one (mono voices: lead, bass, sub, saw, square, 808, flute; others warn);
   - `arp`: `'up' | 'down' | 'updown' | 'random'` or `{ mode, rate, octaves }`: chords become arpeggios;
   - `width` 0.05–0.5: the pulse width of `square`.
3. **Drum kits**: `kit: 'classic' | '808' | 'acoustic' | 'lofi' | 'chip'` on the score, overridable per drum section.
4. **Docs**: a genre table (tempo, mode, chords, rhythm, instruments, kit, effects) and tested recipes per genre; SKILL.md,
   cheatsheet, direction.md say "choose the genre from the brief first"; types, api.md, dsl.md, api-surface, CHANGELOG.
5. **Ear check**: a listening page of the 9 genres rewritten with the new sounds plus new genres, for the owner to judge. Claude
   cannot hear; objective checks (pitch, finite, no clicks, loudness, render time) are what Claude can verify.

## Left to the builder
DSP details of each voice and kit, as long as they are deterministic, band-limited enough not to alias badly at 44.1/48 kHz, and
render a 3-minute score in reasonable time.
