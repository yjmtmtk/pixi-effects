// @vitest-environment node
// Group 14 (Warnings are instructions), the families "an sfx knob beside sfx" and "a removed key". What each sentence must hold comes from the documents,
// written here before the film was run:
//  - skills/pixi-effects/reference/pitfalls.md 67: "A key the layer does not have is warned about now (it used to be ignored in silence). … `{ type: 'audio',
//    sfx: 'click', pitch: 3 }` (the knob goes inside: `sfx: { preset: 'click', pitch: 3 }`) … The warning names the key, the kind of layer and what was probably
//    meant". So for a preset written as a string the fix is that exact shape, with the preset's name and the value the layer had.
//  - skills/pixi-effects/SKILL.md step 4: "A key a layer does not have (…; `pitch` outside `sfx`) is a warning that names the key and what you probably meant".
//  - skills/pixi-effects/reference/cheatsheet.md 61 and docs/dsl.md (Sound effects without files): the knobs are `pitch`, `brightness`, `seed`, all inside
//    `sfx: { preset, pitch, brightness, seed }`. So brightness and seed beside `sfx:` are the same mistake and get the same kind of sentence; a layer whose sfx is
//    already an object gets "the knob goes inside" too (the docs do not give that sentence's exact shape: pinned only as `sfx: { … <key>: <value> … }`).
//  - pitfalls.md 84: "the old `maskInverted: true` key is gone: it warns and says this", "this" being `mask: { layer: { type: 'shape', … }, invert: true }`;
//    CHANGELOG 0.29 (the API list): "`maskInverted: true` next to `mask: { …a layer… }` → `mask: { layer: { …the mask layer… }, invert: true }` … The old key
//    warns and says this".
//  - The key is "gone", so it does nothing: the mask beside it crops as a plain mask does (inside the circle shows, outside does not); docs/dsl.md "An inverted
//    mask": with `invert: true` "pixels INSIDE the mask shape become transparent, pixels OUTSIDE stay visible". The film's correct form makes the hole.
//  - src/core/lint.ts, comment of describeLayer: a warning refers to a layer as `layer "name"`; src/core/layerKeys.ts, comment of kindsWithKey: a rect is a
//    "rect shape" (the kind pitfalls 67 says is named).
// Expected, ?mistakes=1: exactly five warnings, one per mistaken layer (tick, thud, keys, pop, panel), none naming okChime, okSwoosh, okHole;
//                        panel's centre is red (the crop) and its corner is the background.
//           no query:    no warning at all; panel's centre is the background (the hole) and its corner red.
//           &pitch=-7:   tick's fix follows the value: `sfx: { preset: 'click', pitch: -7 }`.
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

interface Mistake { layer: string; key: string; must: Array<string | RegExp> }
const knobAt = (layer: string, key: string, preset: string, value: string): Mistake =>
  ({ layer, key, must: [`sfx: { preset: '${preset}', ${key}: ${value} }`] });                       // pitfalls 67: the fix shape, exactly
const mistakes = (pitch = '3'): Mistake[] => [
  knobAt('tick', 'pitch', 'click', pitch),
  knobAt('thud', 'brightness', 'hit', '-0.5'),
  knobAt('keys', 'seed', 'typewriter', '7'),
  { layer: 'pop', key: 'pitch', must: [/sfx: \{[^}]*\bpitch: 2\b[^}]*\}/] },                          // already an object: "the knob goes inside" it
  { layer: 'panel', key: 'maskInverted', must: ['not a rect shape key', 'mask: { layer', 'invert: true'] },   // pitfalls 84 / CHANGELOG: says what to write now
];
const CORRECT_NEIGHBOURS = ['okChime', 'okSwoosh', 'okHole'];

interface Seen { logs: string[]; px: Record<string, [number, number, number]> }
const open = (query?: string) => withFilm('warnings-sfx-knob-and-removed-key', async (film): Promise<Seen> => ({
  logs: await film.eval<string[]>('window.__logs'),
  px: await film.eval('window.__probes'),
}), query ? { query } : {});

function checkWarnings(logs: string[], want: Mistake[]): void {
  expect(logs.length, logs.join('\n')).toBe(want.length);                                               // one warning per mistake, nothing else
  for (const m of want) {
    const mine = logs.filter((l) => l.includes(`layer "${m.layer}"`));
    expect(mine.length, `warnings naming layer "${m.layer}": ${JSON.stringify(mine)}`).toBe(1);
    const s = mine[0]!;
    expect(s.startsWith(`warn: pixi-effects: layer "${m.layer}": "${m.key}"`), s).toBe(true);           // the layer's name, then the key, quoted
    for (const r of m.must) typeof r === 'string' ? expect(s).toContain(r) : expect(s).toMatch(r);
  }
  for (const ok of CORRECT_NEIGHBOURS) expect(logs.filter((l) => l.includes(`"${ok}"`)), `a correct layer is never named: ${ok}`).toEqual([]);
}

// red / blue rects on #101010: a channel above 220 is the rect, below 35 the background
const isRed = (p: number[]) => p[0]! > 220 && p[1]! < 35 && p[2]! < 35;
const isBlue = (p: number[]) => p[2]! > 220 && p[0]! < 35 && p[1]! < 35;
const isBackground = (p: number[]) => p.every((c) => c < 35);

runFilms('Warnings are instructions: an sfx knob beside sfx, a removed key', () => {
  it('says each knob beside sfx and the removed maskInverted once, naming the layer and the key and giving what to write; the removed key does nothing', async () => {
    const { logs, px } = await open('mistakes=1');
    checkWarnings(logs, mistakes());
    expect(isRed(px.panelCentre), `panel centre ${px.panelCentre}: maskInverted is gone, so the circle crops (red inside)`).toBe(true);
    expect(isBackground(px.panelCorner), `panel corner ${px.panelCorner}: outside the cropping circle`).toBe(true);
    expect(isBackground(px.holeCentre), `okHole centre ${px.holeCentre}: invert: true is a hole`).toBe(true);
    expect(isBlue(px.holeCorner), `okHole corner ${px.holeCorner}: outside the hole the rect stays`).toBe(true);
  }, 90_000);

  it('the same layers written the documented way give no warning, and panel then has its hole', async () => {
    const { logs, px } = await open();
    expect(logs).toEqual([]);
    expect(isBackground(px.panelCentre), `panel centre ${px.panelCentre}: the hole`).toBe(true);
    expect(isRed(px.panelCorner), `panel corner ${px.panelCorner}: around the hole`).toBe(true);
    expect(isBackground(px.holeCentre), `okHole centre ${px.holeCentre}`).toBe(true);
    expect(isBlue(px.holeCorner), `okHole corner ${px.holeCorner}`).toBe(true);
  }, 90_000);

  it('follows the value: tick with pitch -7 beside sfx is told to write sfx: { preset: \'click\', pitch: -7 }', async () => {
    checkWarnings((await open('mistakes=1&pitch=-7')).logs, mistakes('-7'));
  }, 90_000);
});
