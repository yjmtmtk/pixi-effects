// @vitest-environment node
// Group 14 (Warnings are instructions), the family "a misspelt layer key". What each sentence must hold comes from the documents, written here before the film was run:
//  - skills/pixi-effects/reference/pitfalls.md 67: "A key the layer does not have is warned about now … `{ type: 'text', anchorX: 0.5 }` (anchors go in `initial`) …
//    `{ type: 'shape', shape: 'rect', radius: 5 }` (that is a circle's key; a rect has `cornerRadius`) … The warning names the key, the kind of layer and what was probably meant".
//  - skills/pixi-effects/SKILL.md step 4: "A key a layer does not have (a typo in a layer key …; `anchorX` outside `initial` …) is a warning that names the key and what you probably meant".
//  - skills/pixi-effects/reference/pitfalls.md 30b: unknown names warn "did you mean `…`"; cheatsheet.md 48: `x`, `rotation` … "go in `initial` / keyframes, never at the top level of a shape or text layer (top-level `x` … warn)".
//  - docs/dsl.md 66: "Shape geometry (`width height radius anchorX …`) may be written at the top level or in `initial`": so okRect's top-level cornerRadius / anchorX are NOT mistakes.
//  - src/core/lint.ts, comment of describeLayer: warnings refer to a layer as `layer "name"`; comment of lintKeys: "Said once each, with what was probably meant";
//    comment at the property branch: "Say that [it goes in initial], not a guess at another key"; comment at the owner branch: "`radius` on a rect, keeps its 'it belongs to' sentence";
//    src/core/layerKeys.ts, comment of kindsWithKey: a kind is written "a circle shape" (so a rect is a "rect shape", a text is a "text layer").
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

/** One mistake of the film: the layer, the key, and the parts its sentence must contain (or must not). */
interface Mistake { layer: string; key: string; kind: string; must: RegExp[]; mustNot?: RegExp[] }

const didYouMean = (k: string) => new RegExp(`did you mean "${k}"`);
const MISTAKES: Mistake[] = [
  { layer: 'bar', key: 'duraton', kind: 'rect shape', must: [didYouMean('duration')] },                                // a typo: pitfalls 30b / 67
  { layer: 'panel', key: 'anchorx', kind: 'rect shape', must: [didYouMean('anchorX')] },                              // a rect's own top-level key, mistyped (dsl.md 66)
  { layer: 'card', key: 'cornerradius', kind: 'rect shape', must: [didYouMean('cornerRadius')] },
  { layer: 'dot', key: 'x', kind: 'rect shape', must: [/\binitial\b/, /40/], mustNot: [/did you mean/] },          // cheatsheet 48: x goes in initial; the comment: "not a guess at another key"
  { layer: 'pill', key: 'radius', kind: 'rect shape', must: [didYouMean('cornerRadius'), /belongs to [^)]*circle shape/] },   // pitfalls 67: a circle's key; a rect has cornerRadius
  { layer: 'title', key: 'anchorX', kind: 'text layer', must: [/\binitial\b/, /0\.5/], mustNot: [/did you mean/] },  // pitfalls 67: anchors go in initial
];
const CORRECT_NEIGHBOURS = ['okRect', 'okCircle', 'okText'];

const logsOf = (query?: string) => withFilm('warnings-unknown-keys', (film) => film.eval<string[]>('window.__logs'), query ? { query } : {});

function checkMistakes(logs: string[], mistakes: Mistake[]): void {
  // one warning per mistake and nothing else (no error, no second sentence for the same key)
  expect(logs.length, logs.join('\n')).toBe(mistakes.length);
  for (const l of logs) expect(l.startsWith('warn: pixi-effects: layer "'), l).toBe(true);
  for (const m of mistakes) {
    const mine = logs.filter((l) => l.includes(`layer "${m.layer}"`));
    expect(mine.length, `warnings naming layer "${m.layer}": ${JSON.stringify(mine)}`).toBe(1);
    const s = mine[0]!;
    expect(s.startsWith(`warn: pixi-effects: layer "${m.layer}": "${m.key}"`), s).toBe(true);     // the layer's name, then the wrong key, quoted
    expect(s, 'the kind of layer').toContain(`not a ${m.kind} key`);
    for (const r of m.must) expect(s).toMatch(r);
    for (const r of m.mustNot ?? []) expect(s).not.toMatch(r);
  }
  for (const ok of CORRECT_NEIGHBOURS) expect(logs.filter((l) => l.includes(`"${ok}"`)), `a correct layer is never named: ${ok}`).toEqual([]);
}

runFilms('Warnings are instructions: a misspelt layer key', () => {
  it('says each wrong key once, in a sentence naming the layer, the key, the kind of layer and what to write; the correct layers next to them are not named', async () => {
    checkMistakes(await logsOf('mistakes=1'), MISTAKES);
  }, 90_000);

  it('the same layers written correctly give no warning at all', async () => {
    expect(await logsOf()).toEqual([]);
  }, 90_000);

  it('follows the layer: when "pill" is a circle, radius is its own key and only the other five mistakes are said', async () => {
    checkMistakes(await logsOf('mistakes=1&pill=circle'), MISTAKES.filter((m) => m.layer !== 'pill'));
  }, 90_000);
});
