import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveLoader, dismissLoader, failLoader } from '../../src/core/loader';

const css = readFileSync(resolve(__dirname, '../../src/loader.css'), 'utf8');

function page(html: string): HTMLCanvasElement {
  document.body.innerHTML = html;
  return document.getElementById('stage') as HTMLCanvasElement;
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('resolveLoader: which element is the loader', () => {
  it('a .pe-loader next to the canvas is found by itself', () => {
    const canvas = page('<div class="stage"><canvas id="stage"></canvas><div class="pe-loader" id="l"></div></div>');
    expect(resolveLoader(undefined, canvas)).toBe(document.getElementById('l'));
  });

  it('it is also found when the canvas has been wrapped by something (the player wraps it): the search goes up a few levels', () => {
    const canvas = page('<div class="stage"><div class="wrap"><canvas id="stage"></canvas></div><div class="pe-loader" id="l"></div></div>');
    expect(resolveLoader(undefined, canvas)).toBe(document.getElementById('l'));
  });

  it('another movie\'s loader elsewhere on the page is not taken', () => {
    const canvas = page('<div id="a"><canvas id="stage"></canvas></div><div id="b"><div class="pe-loader"></div></div>');
    expect(resolveLoader(undefined, canvas)).toBeNull();
  });

  it('an element or a selector can be named; false turns the loader off', () => {
    const canvas = page('<div><canvas id="stage"></canvas><div class="pe-loader" id="l"></div></div><div id="other"></div>');
    const other = document.getElementById('other')!;
    expect(resolveLoader(other, canvas)).toBe(other);
    expect(resolveLoader('#other', canvas)).toBe(other);
    expect(resolveLoader('#missing', canvas)).toBeNull();
    expect(resolveLoader(false, canvas)).toBeNull();
  });

  it('no loader on the page is simply null', () => {
    expect(resolveLoader(undefined, page('<canvas id="stage"></canvas>'))).toBeNull();
    expect(resolveLoader(undefined, null)).toBeNull();
  });
});

describe('dismissLoader / failLoader', () => {
  it('dismiss fades it (a class, so the CSS transition runs) and takes it away afterwards', () => {
    page('<canvas id="stage"></canvas><div class="pe-loader" id="l"></div>');
    const l = document.getElementById('l')!;
    dismissLoader(l);
    expect(l.classList.contains('pe-loader--done')).toBe(true);
    expect(l.getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById('l')).not.toBeNull();                       // still there while it fades
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('l')).toBeNull();
  });

  it('dismiss is safe to call twice, and on null', () => {
    page('<div class="pe-loader" id="l"></div>');
    const l = document.getElementById('l')!;
    dismissLoader(l); dismissLoader(l); dismissLoader(null);
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('l')).toBeNull();
  });

  it('fail stops the animation (a state the CSS reacts to), says why, and leaves the loader up', () => {
    page('<div class="pe-loader" id="l" data-label="LOADING"></div>');
    const l = document.getElementById('l')!;
    failLoader(l, 'COULD NOT LOAD');
    expect(l.getAttribute('data-state')).toBe('error');
    expect(l.getAttribute('data-label')).toBe('COULD NOT LOAD');
    vi.advanceTimersByTime(5000);
    expect(document.getElementById('l')).not.toBeNull();
    failLoader(null, 'x');
  });

  it('fail keeps a custom loader\'s own text (it has no data-label to replace)', () => {
    page('<div class="pe-loader pe-loader--custom" id="l"><span>my own</span></div>');
    const l = document.getElementById('l')!;
    failLoader(l, 'COULD NOT LOAD');
    expect(l.getAttribute('data-state')).toBe('error');
    expect(l.textContent).toBe('my own');
  });
});

describe('loader.css', () => {
  it('only ever animates transform and opacity: those run on the compositor thread, so the loader keeps moving while the page is busy', () => {
    const blocks: Array<[string, string]> = [];                                  // every @keyframes block, found by matching braces
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      let depth = 1, i = m.index! + m[0].length;
      const start = i;
      while (depth > 0 && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
      blocks.push([m[1]!, css.slice(start, i - 1)]);
    }
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const [name, body] of blocks) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]!);
      for (const p of props) expect(['transform', 'opacity'], `@keyframes ${name} animates "${p}"`).toContain(p);
    }
  });

  it('has the three looks, a custom mode, a fade and an error state, and respects reduced motion', () => {
    for (const s of ['.pe-loader--pulse', '.pe-loader--bar', '.pe-loader--custom', '.pe-loader--done', '[data-state="error"]', 'prefers-reduced-motion']) expect(css).toContain(s);
  });

  it('declares the variables nowhere as a default on .pe-loader itself (that would shadow a value set on an ancestor): defaults live in var() fallbacks', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/^\s*--pe-loader-[a-z]+\s*:/m);
    expect(body).toMatch(/var\(--pe-loader-bg,\s*#/);
  });

  it('can be restyled from the page with variables', () => {
    for (const v of ['--pe-loader-color', '--pe-loader-bg', '--pe-loader-size', '--pe-loader-track']) expect(css).toContain(v);
  });

  it('does not animate a property through the shorthand either (no `transition: all`, no `animation` of width / height)', () => {
    expect(css).not.toMatch(/transition:\s*all/);
  });
});
