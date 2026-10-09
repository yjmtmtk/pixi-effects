// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const mod: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/presets/index.js')).href);
const presets: Array<{ id: string; label: string; code: string }> = mod.default;
const AsyncFunction = (async function () {}).constructor as new (...a: string[]) => unknown;

describe('Playground presets: the edit block of the chat template', () => {
  it('are the twelve of the old Playground plus time remap, depth of field and blend modes, with unique ids', () => {
    expect(presets.map((p) => p.id)).toEqual([
      '01-hello', '02-keyframes', '03-shapes', '04-media', '05-composition', '06-filters',
      '07-transitions', '08-presets', '09-audio', '11-depth', '13-sfx', '14-draw-on', '15-time-remap', '16-depth-of-field', '17-blend-modes',
    ]);
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
  });

  for (const p of presets) {
    describe(p.id, () => {
      it('has a label and the three constants the template reads', () => {
        expect(p.label).toBeTruthy();
        expect(p.code).toMatch(/const W =/);
        expect(p.code).toMatch(/const sequences\b/);
        expect(p.code).toMatch(/const POSTER\b/);
        expect(p.code).toMatch(/const BACKGROUND\b/);
      });
      it('is plain page code: no movie.init, no Controller, no injected canvas', () => {
        expect(p.code).not.toMatch(/movie\.init\(/);
        expect(p.code).not.toMatch(/new Controller\(/);
        const codeOnly = p.code.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
        expect(codeOnly).not.toMatch(/\bmovie\b\./);                     // the page makes the movie after this block
      });
      it('parses as a module body (imports aside)', () => {
        const body = p.code.replace(/^import .*$/gm, '');
        expect(() => new AsyncFunction(body)).not.toThrow();
      });
      it('defines what it uses before it uses it (the block runs top to bottom, then the page reads the constants)', async () => {
        // run the block with stubs for the page's names: a ReferenceError (a const used before its line) is the usual slip
        const body = p.code.replace(/^import (\{[^}]*\}) from .*$/gm, 'const $1 = __lib;').replace(/await import\([^)]*\)/g, '({})');
        const lib = new Proxy({}, { get: () => class { constructor() { return new Proxy(this, { get: (t: any, k) => (k in t ? t[k] : () => {}) }); } } });
        const names = ['__lib', 'document', 'kenBurns', 'withFade', 'wiggle', 'stagger', 'animateText', 'followPath', 'particles', 'deck'];
        const stubDoc = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }), toDataURL: () => 'data:' }) };
        const fn = new AsyncFunction(...names, `${body}\nreturn { W, H, FPS, DURATION, BACKGROUND, sequences, POSTER };`) as (...a: unknown[]) => Promise<any>;
        const pass = () => ({ type: 'image' });
        const out = await fn(lib, stubDoc, pass, pass, pass, pass, pass, pass, pass, pass);
        expect(out.W).toBeGreaterThan(0);
        expect(out.DURATION).toBeGreaterThan(0);
        expect(Array.isArray(out.sequences)).toBe(true);
        expect(out.sequences.length).toBeGreaterThan(0);
        expect(out.POSTER).toBeLessThanOrEqual(out.DURATION);
      });
    });
  }

  it('extraImportsFor adds pixi-filters only to code that imports it', () => {
    expect(mod.extraImportsFor("import { GlowFilter } from 'pixi-filters';")['pixi-filters']).toMatch(/pixi-filters/);
    expect(mod.extraImportsFor('const sequences = [];')).toEqual({});
    expect(Object.keys(mod.extraImportsFor(presets.find((p) => p.id === '06-filters')!.code))).toContain('pixi-filters');
  });
});
