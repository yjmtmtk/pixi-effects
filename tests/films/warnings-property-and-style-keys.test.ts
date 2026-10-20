// @vitest-environment node
// Group 14 (Warnings are instructions), two families: "a mistyped keyframe / initial property" and "a mistyped text style key".
// What each sentence must hold comes from the documents, written here before the film was run:
//  - skills/pixi-effects/SKILL.md step 4: "A key a layer does not have (a typo in a layer key, a keyframe property or a text style key; …)
//    is a warning that names the key and what you probably meant": so each sentence names the wrong key and the right one.
//  - skills/pixi-effects/reference/cheatsheet.md 48: the animatable properties are `x y alpha rotation scale scaleX scaleY pivotX pivotY anchorX anchorY
//    skewX skewY tint width height visible autoAlpha`, plus a shape's style, a text's `fill`; and "every warning of this kind names the layer, or says
//    'unnamed <type> layer'", in the shape `layer "dot": "x" is …` (the layer, a colon, the key in double quotes).
//    So: alhpa -> alpha, rotaton -> rotation, scal -> scale.
//  - cheatsheet.md 78 / docs/dsl.md 383 "Style": a shape's style keys in initial / keyframes are `fillColor fillAlpha strokeColor strokeAlpha strokeWidth`:
//    so fillcolor -> fillColor.
//  - docs/dsl.md 1161 "PIXI shorthands": `position, positionX, positionY` … are understood in initial / set / to / from: okShape moves by them and is
//    never named. (A first draft of this film used positionX as a mistake, from the cheatsheet 48 list that leaves it out: dsl.md says it is valid,
//    and the library agreed; reported as a doc gap in the cheatsheet.)
//  - cheatsheet.md 13: "text colour is `style.fill`": so style.colour -> what is meant is fill.
//  - cheatsheet.md 54 / docs/dsl.md 74: the text style keys include `fontSize fontFamily fontWeight fill letterSpacing lineHeight align wordWrap
//    wordWrapWidth stroke dropShadow padding`: so style.fontsize -> fontSize, and okText (which uses all twelve) is never named.
//  - skills/pixi-effects/reference/pitfalls.md 30b: unknown names warn "did you mean …" (the library quotes the name in double quotes, as the
//    layer-key family pinned in warnings-unknown-keys does).
//  - src/core/lint.ts, comment of lintKeys: "Said once each, with what was probably meant. A warning, never an error": fader's alhpa, written in
//    initial, in from and in to, is ONE warning.
//  NOT in any document (only in src/core/lint.ts's sentences; pinned here because the shape of the sentence is this film's subject, reported as a
//  doc gap): the words "is not an animatable property" (docs/dsl.md 1037 uses them only for blendMode), "style.<key> is not a text style key",
//  "(it is ignored)" and the list of keys after "Keys:".
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

/** One mistake of the film: the layer as the sentence names it, how the sentence must start, and what was meant. */
interface Mistake { layer: string; who: string; start: string; meant: string; family: 'property' | 'style'; /** the library does not say what was meant (pinned apart, see the it.fails) */ noGuess?: true }

const prop = (layer: string, key: string, meant: string, who = `layer "${layer}"`): Mistake =>
  ({ layer, who, start: `warn: pixi-effects: ${who}: "${key}" is not an animatable property`, meant, family: 'property' });
const style = (layer: string, key: string, meant: string): Mistake =>
  ({ layer, who: `layer "${layer}"`, start: `warn: pixi-effects: layer "${layer}": style.${key} is not a text style key`, meant, family: 'style' });

const MISTAKES: Mistake[] = [
  prop('fader', 'alhpa', 'alpha'),                                   // a typo (cheatsheet 48), written three times: said once
  prop('mover', 'fillcolor', 'fillColor'),                           // a shape's style key in the wrong case (cheatsheet 78), next to a correct x
  prop('spinner', 'rotaton', 'rotation'),                            // a typo, on a text layer, in a keyframe's `to`
  prop('unnamed', 'scal', 'scale', 'unnamed shape layer'),           // cheatsheet 48: an unnamed layer is "unnamed <type> layer"
  style('heading', 'fontsize', 'fontSize'),                          // cheatsheet 54
  style('caption', 'colour', 'fill'),          // cheatsheet 13: the text colour is style.fill (the guess comes from the aliases of src/core/options.ts)
];
const CORRECT_NEIGHBOURS = ['okShape', 'okText'];
/** cheatsheet.md 54: the style keys a reader is told about; the list a style warning gives must hold each of them. */
const DOCUMENTED_STYLE_KEYS = ['fontSize', 'fontFamily', 'fontWeight', 'fill', 'letterSpacing', 'lineHeight', 'align', 'wordWrap', 'wordWrapWidth', 'stroke', 'dropShadow', 'padding'];

const logsOf = (query?: string) => withFilm('warnings-property-and-style-keys', (film) => film.eval<string[]>('window.__logs'), query ? { query } : {});

function checkMistakes(logs: string[], mistakes: Mistake[]): void {
  // one warning per mistake and nothing else (no error, no second sentence for a key written again)
  expect(logs.length, logs.join('\n')).toBe(mistakes.length);
  for (const l of logs) expect(l.startsWith('warn: pixi-effects: '), l).toBe(true);
  for (const m of mistakes) {
    const mine = logs.filter((l) => l.includes(`${m.who}:`));
    expect(mine.length, `warnings naming ${m.who}: ${JSON.stringify(mine)}`).toBe(1);
    const s = mine[0]!;
    expect(s.startsWith(m.start), `${s}\n  should start with\n${m.start}`).toBe(true);     // the layer, then the wrong key, then the family's words
    if (!m.noGuess) expect(s, `what was probably meant (SKILL.md step 4)`).toContain(`did you mean "${m.meant}"?`);
    if (m.family === 'property') expect(s, 'where a property is written').toMatch(/\(in initial, set, to or from\)/);
    else {
      expect(s, 'a style key that is not one does nothing').toContain('(it is ignored)');
      const list = s.slice(s.indexOf('Keys: ') + 'Keys: '.length).split(', ');
      expect(s).toContain('Keys: ');
      for (const k of DOCUMENTED_STYLE_KEYS) expect(list, `the list of keys holds the documented ${k}`).toContain(k);
    }
  }
  for (const ok of CORRECT_NEIGHBOURS) expect(logs.filter((l) => l.includes(`"${ok}"`)), `a correct layer is never named: ${ok}`).toEqual([]);
}

runFilms('Warnings are instructions: a mistyped property or text style key', () => {
  it('says each wrong property and style key once, in a sentence naming the layer, the key and what was meant; the correct layers are not named', async () => {
    checkMistakes(await logsOf('mistakes=1'), MISTAKES);
  }, 90_000);

  it('the same layers written correctly give no warning at all', async () => {
    expect(await logsOf()).toEqual([]);
  }, 90_000);

  // SKILL.md step 4 promises "what you probably meant" for a text style key, and cheatsheet.md 13 says the text colour is style.fill; the library
  // says only that style.colour is not a key (its did-you-mean knows typos and a table of aliases from other programs, no colour / color -> fill).
  it('style.colour says what was meant: fill (the documented text colour)', async () => {
    const caption = (await logsOf('mistakes=1')).filter((l) => l.includes('layer "caption":'));
    expect(caption.length).toBe(1);
    expect(caption[0]).toContain('did you mean "fill"?');
  }, 90_000);

  it('follows the film: with fader and caption written correctly only the other four mistakes are said', async () => {
    checkMistakes(await logsOf('mistakes=1&fixed=fader,caption'), MISTAKES.filter((m) => m.layer !== 'fader' && m.layer !== 'caption'));
  }, 90_000);
});
