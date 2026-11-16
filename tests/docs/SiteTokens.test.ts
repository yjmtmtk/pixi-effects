// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The 1.0 site look (docs/superpowers/specs/2026-11-16-site-v1-design.md, direction A "PixiJS sibling"): light only, PixiJS's palette as accents.
const css = readFileSync(resolve(__dirname, '../../site/shared/tokens.css'), 'utf8');

/** The declarations of the first rule whose selector line contains `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} in tokens.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
}
const lum = (hex: string) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe('tokens.css (the 1.0 look)', () => {
  const t = block(':root{');

  it('carries the palette of the design, exactly', () => {
    expect(t).toMatchObject({
      '--bg-top': '#fcfbfd', '--bg-bottom': '#efecf8', '--ink': '#1d1630', '--ink-2': '#5b5272',
      '--pink': '#e91e63', '--violet': '#8b5cf6', '--sky': '#38bdf8', '--orange': '#f2a65a', '--card': '#ffffff',
    });
    for (const name of ['--shadow', '--radius', '--pink-deep', '--pink-text']) expect(t[name], name).toBeTruthy();
  });

  it('text reads on the page (>= 4.5:1): ink, the second ink and small pink text on the darker end of the background', () => {
    for (const name of ['--ink', '--ink-2', '--pink-text']) expect(contrast(t[name]!, t['--bg-bottom']!), name).toBeGreaterThanOrEqual(4.5);
  });

  it('white text reads on the pink button (>= 4.5:1); PixiJS pink itself is for shapes and large type only', () => {
    expect(contrast('#ffffff', t['--pink-deep']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--pink']!, t['--bg-bottom']!), 'large type needs 3:1').toBeGreaterThanOrEqual(3);
  });

  it('is light only: no dark theme, no theme switch', () => {
    expect(css).not.toMatch(/data-theme|prefers-color-scheme:\s*dark/);
    expect(css).toMatch(/color-scheme:\s*light/);
  });
});
