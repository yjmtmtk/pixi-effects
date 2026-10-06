# still-water — stumble notes
Model: sonnet   Cycles: 2 (1 write, 1 look-and-adjust)   Result: works
Note: written by the library's author to give the gallery a piece built on real photographs; not a fresh-session trial.

## Went smoothly
- `kenBurns` on a 1600×900 crop of each photo covered the 1280×720 canvas with room to zoom; three different motions (scale from an origin, a position pan) looked distinct.
- A `dip` into the dusk photo and a `crossfade` out of it; the text swaps are timed to the middle of each transition (`startOf(i) + T / 2`) so the old line is gone when the picture is.
- One text layer per line of type, re-typed with `set: { text }` + `set: { visibleChars: 0 }` + `to: { visibleChars: n }` at the same time; no per-letter layers.
- The viewfinder corners and the timeline are `path` / `line` layers with `trimEnd` 0 → 1.

## Stumbles
### 1. `dissolve` is wrong for a calm piece   [TASTE]
- tried: `dissolve` between the dusk and the autumn photo.
- happened: a blobby, camouflage-like noise mask in the middle of the transition. Fine for a reel, not for still water.
- fix: `crossfade`. `dip` is the dark one that suits dusk.

### 2. Photos need a licence trail   [PROCESS]
- The three photos come from Wikimedia Commons (CC0). `examples/_assets/LICENSES.md` records author, source page and the licence shown, checked on the file pages. One is from Unsplash before its June 2017 licence change (CC0 on Commons); one is a third-party upload from isorepublic.com. Drop either if you want only "own work" photos.
