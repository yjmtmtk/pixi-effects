// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// `--var name=value` and `--size WxH` of check and render: read, then matched against what the page declares
const root = resolve(__dirname, '../..');
const v: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/varArgs.mjs')).href);
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const render: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/render.mjs')).href);

describe('parseVar: name=value', () => {
  it('reads a name and the rest of the text as the value (an = inside the value is kept)', () => {
    expect(v.parseVar('lang=en')).toEqual(['lang', 'en']);
    expect(v.parseVar('title=a=b')).toEqual(['title', 'a=b']);
    expect(v.parseVar('accent=#e5399a')).toEqual(['accent', '#e5399a']);
    expect(v.parseVar('empty=')).toEqual(['empty', '']);
  });
  it('a text that is not name=value says how it should look', () => {
    expect(() => v.parseVar('lang')).toThrow(/--var must look like name=value/);
    expect(() => v.parseVar('=en')).toThrow(/--var must look like name=value/);
    expect(() => v.parseVar('1a=3')).toThrow(/--var must look like name=value/);
  });
});

describe('parseSizes: WxH, several with a comma', () => {
  it('reads one size or a list, in order', () => {
    expect(v.parseSizes('1080x1920')).toEqual([{ width: 1080, height: 1920 }]);
    expect(v.parseSizes('1920x1080, 1080x1920,1080x1080')).toEqual([{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 1080, height: 1080 }]);
    expect(v.parseSizes('640X360')).toEqual([{ width: 640, height: 360 }]);
  });
  it('a size that is not whole pixels says how it should look', () => {
    for (const bad of ['1080', '1080x', 'x1920', '0x10', '10x-3', '1.5x2', 'ax b', '']) expect(() => v.parseSizes(bad), bad).toThrow(/--size must look like 1920x1080/);
  });
});

describe('coerceVars: the page decides what each variable is', () => {
  const declared = { shift: 40, title: 'NORD', accent: '#e5399a' };
  it('a number variable gets a number, a string variable gets the text', () => {
    expect(v.coerceVars([['shift', '12.5'], ['title', 'SÜD']], declared)).toEqual({ shift: 12.5, title: 'SÜD' });
  });
  it('the last of the same name wins', () => {
    expect(v.coerceVars([['shift', '1'], ['shift', '2']], declared)).toEqual({ shift: 2 });
  });
  it('a name the page did not declare says the nearest one and the declared ones', () => {
    expect(() => v.coerceVars([['shfit', '1']], declared)).toThrow(/--var shfit: the page declares no variable "shfit" — did you mean "shift"\? \(declared: shift, title, accent\)/);
    expect(() => v.coerceVars([['zzz', '1']], declared)).toThrow(/declares no variable "zzz" \(declared: shift, title, accent\)/);
  });
  it('a page that declares nothing says how to declare', () => {
    expect(() => v.coerceVars([['a', '1']], {})).toThrow(/declares no variables.*vars: \{/);
  });
  it('a number variable given text that is not a number is refused', () => {
    expect(() => v.coerceVars([['shift', 'abc']], declared)).toThrow(/--var shift=abc: "shift" is a number/);
    expect(() => v.coerceVars([['shift', '']], declared)).toThrow(/is a number/);
  });
});

describe('the options on the commands', () => {
  it('check: --var (repeatable) and --size are kept; nothing by default', () => {
    expect(check.parseArgs(['p.html']).vars).toEqual([]);
    expect(check.parseArgs(['p.html']).sizes).toEqual([]);
    const o = check.parseArgs(['p.html', '--var', 'lang=en', '--var', 'shift=3', '--size', '1920x1080,1080x1920']);
    expect(o.vars).toEqual([['lang', 'en'], ['shift', '3']]);
    expect(o.sizes).toEqual([{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }]);
    expect(() => check.parseArgs(['p.html', '--var', 'oops'])).toThrow(/--var must look like/);
    expect(() => check.parseArgs(['p.html', '--size', '10'])).toThrow(/--size must look like/);
  });
  it('render: --var (repeatable) and one --size', () => {
    expect(render.parseRenderArgs(['p.html']).vars).toEqual([]);
    const o = render.parseRenderArgs(['p.html', '--var', 'lang=en', '--var', 'accent=#fff', '--size', '1080x1920']);
    expect(o.vars).toEqual([['lang', 'en'], ['accent', '#fff']]);
    expect(o.size).toEqual({ width: 1080, height: 1920 });
    expect(() => render.parseRenderArgs(['p.html', '--size', '1920x1080,1080x1920'])).toThrow(/render writes one file: one --size/);
  });
});
