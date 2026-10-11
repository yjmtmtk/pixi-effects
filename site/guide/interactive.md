---
title: Interactive movies
section: Guides
order: 10.2
summary: Change a movie while it plays: declare variables, read them from the film, rebuild at the same frame, and still render the same file to MP4.
---

An **interactive movie** is a film you can change while it plays: a name, a colour, the scroll of the page, the pointer, a roll of the dice. It is still a movie. The same file renders to MP4 with the values you choose, so what you tried on screen is what you ship.

[![Rock paper scissors](../examples/interactive/posters/janken.jpg)](../examples/interactive/janken.html)
[![Scroll through a city](../examples/interactive/posters/scroll-city.jpg)](../examples/interactive/scroll-city.html)
[![A card for anyone](../examples/interactive/posters/card.jpg)](../examples/interactive/card.html)

*Nine live samples are in [Interactive movies](../examples/interactive/): each one is a single HTML file you can read and copy.*

## Declare variables, read them by name

```js
await movie.init({
  canvas, width: 1280, height: 720, duration: 6,
  vars: { name: 'Aiko', accent: '#ff5d73', shift: 0 },        // a number or a string
  composition: { sequences: [
    { type: 'text', text: 'Happy birthday, {name}!', style: { fill: '{accent}' },
      initial: { x: 'W/2 + shift', y: 'H/2' } },
  ] },
});
```

| Where | How a variable is read |
|---|---|
| a numeric value (`x`, `scale`, `alpha`, `width`, `fontSize` …) | by **name**, like `W` or `GW`: `'W/2 + shift'`. Only number variables. |
| any string in the film (`text`, a colour, an `asset`, a layer name, `sfx`, a music `notes` string) | as **`{name}`**: `'{name}'`, `'{accent}'`, `'{lang}-logo'` |

Some names are taken: `w h W H GW GH t d T contain cover value`, the expression functions and `PI`. A variable that nothing reads, or a `{name}` nobody declared, is said when the movie starts (with "did you mean"). `$` is not used for variables because it is a price in a text.

## Change them, and the film is built again

```js
await movie.setVars({ name: 'Ben' });          // only declared names; the same values do nothing
await movie.resize(1080, 1920);                // W / H / GW / GH follow
await movie.rebuild({ composition, vars, width, height });   // the general form
movie.on('rebuilt', r => console.log(r.ms, r.audio));        // { reason, ms, audio, frame, playing }
```

The new film is built **beside the old one** and swapped in whole, at the **same frame**. A playing movie keeps playing; if you paused, sought or played meanwhile, that is kept. The sound is mixed again **only if it changed** (`audio: 'reused'`): a rebuild takes 11 to 42 ms on four gallery pieces measured, and 0.6 to 0.8 s when the sound has to be mixed again. Calls that arrive during a rebuild are joined, so a slider or a pointer can call `setVars` on every move. A rebuild that fails leaves the old film in place and rejects.

A variable moves **values**, not timing: `at` and `duration` are plain numbers. To change the structure, make the composition with your own function and hand it to `rebuild({ composition })`; presets that expand to layers (`animateText`, `particles`, `deck`) are called before the film exists, so they are rebuilt this way too.

## Patterns

- **A form** ([sliders](../examples/interactive/sliders.html), [a card](../examples/interactive/card.html)): inputs call `setVars`. The card also makes one MP4 per name in the browser: `setVars`, then `movie.render()`, once per name.
- **Scroll or pointer** ([a city](../examples/interactive/scroll-city.html), [the pointer](../examples/interactive/pointer.html)): one number from the page is a variable; the camera, the sky and the glow of every window are expressions on it.
- **The window** ([liquid](../examples/interactive/liquid.html)): a `ResizeObserver` on a box around the canvas calls `rebuild({ composition, width, height })` with a layout written for that shape.
- **Choices** ([choose your ending](../examples/interactive/ending.html)): every ending is a group of layers that is on only when a number says so (`alpha: 'step(0.5, 1 - abs(path - 1))'`). The page stops the film at the fork, sets the number and plays on; going back before the fork clears it.
- **Luck** ([rock paper scissors](../examples/interactive/janken.html)): a new roll when the playhead goes from after the reveal to before it, the same ending anywhere after. Listen to `seeking` / `seeked` (a person's seeks) and the loop, not to every `frame`: the tools read frames too.
- **Music as text** ([four chords](../examples/interactive/chords.html)): a chord is a variable in the score, so the tune is made again.

## Loop, and the player

`movie.loop = true` (or `init({ loop: true })`) sends playback back to the start at the end instead of stopping: no `ended`, no `pause` / `play` events at the wrap. `playUntil()` and `render()` ignore it. The player bar has a loop button next to the volume and the `L` key; `loopButton: false` hides it. If your film has things to click, `clickToPlay: false` leaves the canvas alone. See [The player](player.html).

## Check and render with values

```bash
npx pixi-effects check film.html --var name=Ben --size 1920x1080,1080x1920   # a contact sheet and a layout review per size
npx pixi-effects render film.html --var name=Ben --var accent='#2b7fff' --size 1080x1920 -o ben.mp4
```

The page needs nothing for this: the tool builds it again once it is ready. A number variable is given a number; a name the page did not declare stops the run with the nearest one. A film is a function of the script **and** the variables, so `render` with the same values is always the same video.

## Things to know

- **Sound waits for a click.** Browsers keep sound off until the page has been clicked; the picture plays at once and the sound starts from where it is. Say so on the page (the samples do).
- **Load web fonts before the first rebuild that changes a text**: text is measured again each time.
- **Do not make something move by `setVars` every frame**: that is what keyframes are for. Variables are for what a person or the page decides.
- **The film does not know about the page.** Keep the rule that turns input into a number in the page; the film only reads the number.
