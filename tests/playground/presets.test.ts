// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const mod: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/presets/index.js')).href);
const presets: Array<{ id: string; label: string; code: string }> = mod.default;
const AsyncFunction = (async function () {}).constructor as new (...a: string[]) => unknown;

describe('Playground presets: the edit block of the chat template', () => {
  it('are hello (hand-written) and then the tested recipes of presets/list.json, in that order, with unique ids', () => {
    const list = JSON.parse(readFileSync(join(root, 'examples/playground/presets/list.json'), 'utf8')) as Array<{ id: string }>;
    expect(presets.map((p) => p.id)).toEqual(['hello', ...list.map((m) => m.id)]);
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
        const pass = () => [];
        const body = p.code.replace(/^import (\{[^}]*\}) from .*$/gm, 'const $1 = __lib;').replace(/await import\([^)]*\)/g, '({})');
        const lib = new Proxy({}, { get: () => pass });           // every imported helper is a function that returns a list (callable, spreadable)
        const names = ['__lib', 'document', 'kenBurns', 'withFade', 'wiggle', 'stagger', 'animateText', 'followPath', 'particles', 'deck'];
        const stubDoc = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }), toDataURL: () => 'data:' }) };
        const fn = new AsyncFunction(...names, `${body}\nreturn { W, H, FPS, DURATION, BACKGROUND, sequences, POSTER };`) as (...a: unknown[]) => Promise<any>;
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
    expect(Object.keys(mod.extraImportsFor("import { GlowFilter } from 'pixi-filters'; const sequences = [];"))).toContain('pixi-filters');
  });
});
