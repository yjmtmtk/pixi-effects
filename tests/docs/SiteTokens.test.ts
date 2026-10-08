// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

describe('tokens.css', () => {
  const dark = block(':root{');
  const light = block(':root[data-theme="light"]');
  it.each([['dark', dark], ['light', light]] as const)('%s theme: ink, accent and the four model colours read on the background (>= 4.5:1)', (_n, t) => {
    const bg = (t['--bg'] ?? dark['--bg'])!;
    for (const name of ['--ink', '--ink-2', '--accent', '--model-fable', '--model-opus', '--model-sonnet', '--model-haiku']) {
      const value = t[name] ?? dark[name];
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(value!, bg), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('the prefers-color-scheme: light block and the data-theme="light" block carry the same values', () => {
    const auto = block(':root:not([data-theme="dark"])');
    for (const [k, v] of Object.entries(light)) expect(auto[k], k).toBe(v);
  });
});
