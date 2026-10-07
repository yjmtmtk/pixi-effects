---
title: Presenting: slides that move
section: Guides
order: 10.5
summary: A talk as one movie. Stops pause it where you say, the arrow keys, a click or a swipe move on, and a deck helper lays out pages and steps.
---

A presentation is a movie that **waits for you**. You say where it pauses (the *stops*), and a `Presenter` plays it like slides with animation: press next and it plays to the next stop and stops exactly there; press back and it jumps to the one before.

{{demo examples/gallery/quiet-hours.html}}

The piece above is a five-page talk made this way. Press the **Present** button on its player bar (it appears because the movie has stops), then use the arrow keys, Space, a click or a swipe. Or just press play and watch it as a video.

## Stops

Put them in the composition: seconds, or an object.

```js
composition: {
  sequences: [ /* … */ ],
  stops: [
    { at: 2.4, page: 'Title', notes: 'Welcome.' },   // the title, settled: page 1
    { at: 5.0, page: 'The problem' },                // page 2
    7.5,                                             // a step of page 2: a bullet appeared
    { at: 10, page: 'The plan', advance: 4 },        // page 3; with `advance` it moves on by itself after 4 s (a kiosk)
  ],
}
```

A stop with `page` begins a page; the others are **steps** of it (a bullet appears, a chart grows). With no `page` anywhere, every stop is a page. A negative time counts back from the end.

**A step is just a layer that starts at the previous stop and ends at this one.** Press next, the movie plays that animation and pauses on its last frame. A plain player (a `Controller`, a `<video>`-style page) ignores the stops and plays straight through, with a mark on the seek bar at every stop.

## The Presenter

```js
import { Presenter } from 'pixi-effects/presenter';
const presenter = new Presenter(movie, { canvas });      // use it instead of Controller
await presenter.start();                                 // from a button: fullscreen, then play to the first stop
```

| To | Press |
|---|---|
| next (plays to the next stop; pressed while it plays, it skips to that stop) | → ↓ Space Enter PageDown, a click or tap, a swipe left |
| back one stop | ← ↑ Backspace PageUp, a swipe right |
| first page / last stop | Home / End |
| a page | type its number, then Enter |
| black screen / white screen | B or `.` / W or `,` |
| the overview: every page as a picture | G (arrows choose, Enter or a click goes there) |
| the presenter view: a second window with the notes | P |
| fullscreen | F |
| the list of keys | `?` or H |
| close / leave | Esc |

It draws only a small page counter (`3 / 8`), the page name and a thin progress line, which fade out when nothing happens, and the pointer hides with them. A movie shown through a `Controller` gets a **Present** button for free; `Esc` brings the bar back. Options: `clickToAdvance`, `swipe`, `keyboard`, `indicator`, `autoAdvance`, `loop`, `accent`.

From code, the same moves are `movie.next()`, `movie.prev()`, `movie.goToStop(i)`, `movie.goToPage(n)`, and `movie.on('stop', …)` tells you where it landed.

## `deck()`: pages and steps without the arithmetic

Writing absolute times for a whole talk is tedious. `deck()` lets you write each page in **its own time** and does the rest: it lays the pages out one after the other, turns their stops into absolute ones, and joins them with a transition.

```js
// @recipe present-deck
const paper = { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#f4efe6' } };
const style = { fontFamily: 'Georgia, serif', fontSize: 96, fill: '#1c1a17' };
const line = (text, y, at, dur) => animateText(text, style, { by: 'words', x: 96, y, align: 'left', name: 'l' + y, at, duration: dur - at,
  in: { from: { y: 40, alpha: 0 }, duration: 0.8, ease: 'power3.out' }, stagger: { each: 0.1 } });
const T = 0.6;                                           // the slide between pages
const d = deck({
  transition: { kind: 'slide', direction: 'left', duration: T, ease: 'power3.inOut' },
  pages: [
    { name: 'Hello', duration: 2 + T, stops: [2], sequences: [paper, ...line('The Quiet Hours', 260, 0.4, 2 + T)] },
    { name: 'Two steps', duration: 3.4 + T, stops: [1.6, 3.4], notes: 'pause after the first line',
      sequences: [paper, ...line('We measure speed.', 200, 0.4, 3.4 + T), ...line('We rarely measure attention.', 340, 1.6, 3.4 + T)] },
    { name: 'Thanks', duration: 3, stops: [2], sequences: [paper, ...line('Go slowly.', 260, 0.4, 3)] },
  ],
});
return { duration: d.duration, sequences: d.composition.sequences, transitions: d.composition.transitions };
```

In the page, spread the result into `init`:

```js
await movie.init({ canvas, width: 1280, height: 720, frameRate: 30, ...deck({ /* as above */ }) });
new Presenter(movie, { canvas });
```

- Each page is a nested composition, so `at: 0` inside a page is the start of that page, and its layers stop at the page's end.
- `stops` are page-local; the first of each page begins the page, the rest are steps. Without `stops` a page stops where the transition into the next one begins.
- **Make each page last its last stop plus the transition**: after the last stop, the next press plays the rest of the page and the slide into the next one, so extra time is just waiting.
- `transition` takes any [transition](transitions.html) (`crossfade`, `slide`, `wipe`, `iris`, `dip`, `zoom`, `dissolve`) without `from` / `to` / `at`; the next page starts that many seconds early. It must be shorter than every page.
- A page may carry `initial` and `keyframes` like any layer, to fade or move the whole page.

## The overview and the presenter view

Press **G** for a grid of every page, each as a picture (its last stop, fully built); choose with the arrows and Enter, or click, to jump. Press **P** for the **presenter view**, a second window for you alone: the picture that is on screen (live), the picture of what comes next, **your notes for the page**, a timer, and Back / Next buttons; the keys work there too. Put the audience's window on the projector and this one on your screen. (A browser needs a click or key press to open a popup; `P` is one. If it is blocked, allow popups for the page.)

Both use a picture of every stop that `presenter.start()` makes **before** the audience sees anything, behind a short "Preparing…" cover, because taking them moves the playhead through the deck and back. Notes are the `notes` on a page's first stop (`deck()` takes `notes` on a page).

## A deck as a PDF

```bash
npx pixi-effects-render my-talk.html -o my-talk.pdf
```

One PDF page per page of the deck, each the page fully built, as a picture at the canvas size (`--all-stops` makes a page of every stop). From code, `await movie.exportPDF({ title })` returns the Blob, and `movie.stopImages()` gives you the pictures themselves (for a handout, a thumbnail strip, a page list of your own). Give the movie a `background`: a transparent one comes out black in a JPEG.

## Reviewing a deck

`await movie.contactSheet({ frames: movie.stops.map(s => s.frame), as: 'dataURL' })` is one picture of every stop: the whole talk at a glance. Check it as you would any piece.

## Also useful

- **Export:** `movie.render()` still renders the whole talk as one video, and `pixi-effects-render` does it from a script.
- **Speaker notes** live on the stops (`notes`) and are available as `movie.stops[i].notes` for a view of your own.
- **Kiosks and demos:** give stops `advance` and the Presenter `loop: true`.
