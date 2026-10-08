// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const doc: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/doc.js')).href);
const template = readFileSync(join(root, 'ai/chat-template.html'), 'utf8');

describe('playground doc: the edit block of ai/chat-template.html', () => {
  it('the template has both marks, once (the Playground reads the template at run time)', () => {
    expect(template.split(doc.EDIT_FROM).length).toBe(2);
    expect(template.split(doc.EDIT_UNTIL).length).toBe(2);
  });
  it('editRegion gives the code of the block, without the page\'s 4-space indent; the default has the constants an AI writes', () => {
    const code = doc.editRegion(template);
    expect(code).toMatch(/^const W = 1280, H = 720, FPS = 30, DURATION = 6;/m);
    expect(code).toMatch(/const sequences = \[/);
    expect(code.startsWith('    ')).toBe(false);
  });
  it('withRegion and editRegion round-trip any code, and the rest of the page is untouched', () => {
    const code = 'const W = 640, H = 360, FPS = 24, DURATION = 2;\nconst BACKGROUND = "#000";\nconst sequences = [];\nconst POSTER = 1;';
    const html = doc.withRegion(template, code);
    expect(doc.editRegion(html)).toBe(code);
    expect(html).not.toContain('const W = 1280');
    const strip = (s: string) => s.slice(0, s.indexOf(doc.EDIT_FROM)) + s.slice(s.indexOf(doc.EDIT_UNTIL));
    expect(strip(html)).toBe(strip(template));
  });
  it('a block with code that contains $ patterns is inserted literally', () => {
    const code = "const x = '$&$1$`'; const sequences = [];";
    expect(doc.editRegion(doc.withRegion(template, code))).toBe(code);
  });
  it('standalone is just the replaced block, still pinned to the released library on the CDN', () => {
    const html = doc.standalone(template, 'const sequences = [];');
    expect(html).toContain('cdn.jsdelivr.net/npm/pixi-effects@');
    expect(html).not.toContain('__pixiEffectsBridge');
  });
  it('standalone can carry the extra imports a piece needs and the address its files load from', () => {
    const html = doc.standalone(template, 'const sequences = [];', { extraImports: { 'pixi-filters': 'https://cdn.example/pf.mjs' }, assetBase: 'https://site.example/pixi-effects/examples/' });
    expect(html).toContain('"pixi-filters": "https://cdn.example/pf.mjs"');
    expect(html).toContain('<base href="https://site.example/pixi-effects/examples/">');
    expect(html).toContain('cdn.jsdelivr.net/npm/pixi-effects@');             // still the released library
    expect(doc.standalone(template, 'x')).not.toContain('<base ');           // nothing added when not asked
  });
  it('compose points the library at this site, makes assets resolve from the examples folder, adds the bridge and any extra imports', () => {
    const html = doc.compose(template, 'const sequences = [];', { distBase: 'https://site.example/pixi-effects/dist/', assetBase: 'https://site.example/pixi-effects/examples/', extraImports: { 'pixi-filters': 'https://cdn.example/pf.mjs' } });
    expect(html).toContain('"pixi-effects":            "https://site.example/pixi-effects/dist/index.js"');
    expect(html).toContain('"pixi-effects/controller": "https://site.example/pixi-effects/dist/Controller.js"');
    expect(html).not.toContain('cdn.jsdelivr.net/npm/pixi-effects@');
    expect(html).toContain('<base href="https://site.example/pixi-effects/examples/">');
    expect(html).toContain('"pixi-filters": "https://cdn.example/pf.mjs"');
    expect(html).toContain('__pixiEffectsBridge');
  });
  it('a template without the marks is a clear error, not a silent no-op', () => {
    expect(() => doc.editRegion('<html></html>')).toThrow(/EDIT FROM HERE/);
    expect(() => doc.withRegion('<html></html>', 'x')).toThrow(/EDIT FROM HERE/);
  });
});
