# hanabi-night — stumble notes
Model: sonnet   Cycles: 4 (1 write, 3 look-and-adjust, one of them a full redesign)   Result: works
Note: written by the library's author to put particles, motion blur and `animateText` by lines through a real piece; not a fresh-session trial.

## Went smoothly
- A peony is one `particles()` call: a shell of sparks launched at a narrow speed range (`speed: [250, 430]`), a strong `drag` so it opens and hangs, a little `gravity` so it falls as gold rain, `blendMode: 'add'` so overlaps glow. A second call with a lower speed range is the glitter inside. Every burst has its own `seed`.
- `motionBlur: { samples: 8, shutter: 0.55 }` in `movie.init` is all it takes: the rockets (a 44 px rect rising in 0.9 s) become streaks in the contact sheet and in the export, with no extra layers. Live playback in the page is not blurred, which is fine for a page you press play on.
- `animateText('花\n火\n大\n会', …, { by: 'lines' })` stacks the four characters into a vertical title and staggers them: no layout arithmetic.
- The seal is a `null` layer with a square and a character as children, so the stamp (a fast scale and rotation) is one keyframe.

## Stumbles
### 1. The first version was a feature demo, not a piece   [DESIGN, the big one]
- It had fireworks, a spinning pinwheel, confetti and a title, all at once, with no hero and no palette. The owner called it plain bad. The redesign starts from a poster: three colours (indigo, gold, vermilion) and paper white, one vertical Japanese title as the anchor, one small line of English, the date, a skyline that is low under the title and tall on the right, and one thing happening in the sky at a time.

### 2. A burst of small dots reads as a ring   [TASTE]
- Even 300 tiny sparks looked thin on a 1280-wide canvas. What helped: a soft additive halo behind each burst (one radial-gradient circle that fades over the whole burst), larger sparks that shrink over their life, and keeping the burst away from the text.

### 3. The poster time was too late   [MY-MISTAKE]
- At 10.2 s the finale was a faint ring. The poster is where the burst is still bright, the title is in and the seal has just stamped: 9.4 s.

### 4. Too many layers made the page slow to get ready   [PERFORMANCE]
- 1400 particle layers took 12 s to build. 700 or so, a lower `sampleRate` (10 a second is enough, the blur smooths it) and fewer windows on the skyline brought it to about 4 s.

### 5. The very last frame of an export was empty   [LIBRARY BUG, FIXED]
- A layer that lasts to the end of the movie was hidden in the final frame, because the final frame is at the exact end time, where every lifespan has just closed. The library now draws that frame a hair earlier, so the title and the seal are on screen in it.
