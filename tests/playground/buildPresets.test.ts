// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { recipeBody, presetCode, buildPresets, TEMPLATE_IMPORTS } from '../../scripts/build-presets.mjs';

const root = resolve(__dirname, '../..');
const MD = '# x\n\n```js\n// @recipe one\nreturn [ { type: \'text\', text: \'a\' } ];\n```\n\n```js\n// @recipe two\nreturn { duration: 6, transitions: [{ kind: \'dip\' }], sequences: [ { type: \'text\' } ] };\n```\n\n```js\n// @docs-only three\nreturn [];\n```\n';
const META = { id: 'x-one', recipe: 'one', label: 'One', duration: 5, background: '#101820', poster: 3 };

describe('build-presets: a recipe becomes the edit block of the chat template', () => {
  it('finds a recipe body by id, and only @recipe blocks (a docs-only block cannot run)', () => {
    expect(recipeBody(MD, 'one')).toContain("return [ { type: 'text', text: 'a' } ];");
    expect(() => recipeBody(MD, 'three')).toThrow(/no @recipe "three"/);
    expect(() => recipeBody(MD, 'nope')).toThrow(/no @recipe "nope"/);
  });
  it('wraps a body that returns sequences: the template constants, the recipe untouched inside a function', () => {
    const code = presetCode(MD, META);
    expect(code).toMatch(/const W = 1280, H = 720, FPS = 30, DURATION = 5;/);
    expect(code).toContain("const BACKGROUND = '#101820';");
    expect(code).toContain('const sequences = (() => {');
    expect(code).toContain("return [ { type: 'text', text: 'a' } ];");
    expect(code).toContain('const POSTER = 3;');
    expect(code).not.toContain('@recipe');
  });
  it('a body that returns { sequences, transitions } sets INIT, so the page passes the transitions on', () => {
    const code = presetCode(MD, { ...META, id: 'x-two', recipe: 'two' });
    expect(code).toContain('const RECIPE = (() => {');
    expect(code).toContain('const sequences = RECIPE.sequences;');
    expect(code).toContain('const INIT = { composition: { transitions: RECIPE.transitions } };');
  });
  it('imports the helpers a recipe uses that the template does not import already (and none twice, which would be an error)', () => {
    const md = '```js\n// @recipe helpers\nconst pts = samplePath(\'M0 0 L9 9\', 4);\nconst a = orbit({ radius: 1 });\nconst w = wiggle({});\nconst rand2 = 1;\nreturn [ ...pts, a, w, deck({}) ];\n```\n';
    const code = presetCode(md, { ...META, recipe: 'helpers' });
    expect(code).toContain("import { orbit, samplePath } from 'pixi-effects';");        // sorted; wiggle is the template's own
    expect(code).toContain("import { deck } from 'pixi-effects/present';");
    expect(code).not.toMatch(/import \{[^}]*\bwiggle\b/);
    expect(presetCode(MD, META)).not.toMatch(/^import /m);                               // nothing to import, nothing written
  });
  it('a name the recipe defines itself is not imported', () => {
    const md = '```js\n// @recipe own\nconst rand = (n) => n;\nreturn [ rand(1) ];\n```\n';
    expect(presetCode(md, { ...META, recipe: 'own' })).not.toMatch(/^import /m);
  });
  it('knows what the template imports (ai/chat-template.html), so the two cannot drift apart', () => {
    const tpl = readFileSync(join(root, 'ai/chat-template.html'), 'utf8');
    const line = /import \{([^}]*)\} from 'pixi-effects';/.exec(tpl)![1]!.split(',').map((x) => x.trim());
    expect([...TEMPLATE_IMPORTS].sort()).toEqual(line.filter((x) => x !== 'Movie').sort());
  });
  it('the real list builds: every recipe it names exists and the output is what the Playground loads', () => {
    const { presets } = buildPresets(root);
    expect(presets.length).toBeGreaterThanOrEqual(8);
    for (const p of presets) { expect(p.code, p.id).toMatch(/const sequences\b/); expect(p.label, p.id).toBeTruthy(); }
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
  });
  it('a recipe that returns its own duration agrees with the list (DURATION is what the movie uses)', () => {
    const md = readFileSync(join(root, 'skills/pixi-effects/reference/recipes.md'), 'utf8');
    const list = JSON.parse(readFileSync(join(root, 'examples/playground/presets/list.json'), 'utf8'));
    for (const m of list) {
      const own = /return \{\s*duration:\s*([\d.]+)/.exec(recipeBody(md, m.recipe));
      if (own) expect(m.duration, `${m.id}: the recipe says duration ${own[1]}`).toBe(Number(own[1]));
      expect(m.poster, m.id).toBeLessThanOrEqual(m.duration);
    }
  });
  it('the committed examples/playground/presets/recipes.js is up to date (run `npm run build:ai`)', () => {
    const { js } = buildPresets(root);
    expect(readFileSync(join(root, 'examples/playground/presets/recipes.js'), 'utf8')).toBe(js);
  });
});
