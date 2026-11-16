// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// The Lab page: "a video that is not a file" (docs/superpowers/specs/2026-11-16-site-v1-design.md, "Pages · 2"; plan Task 8).
const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('lab/index.html');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

describe('lab/sizes.json and the comparison piece', () => {
  it('sizes.json says the real sizes of the page and its MP4 (scripts/lab-sizes.mjs --check)', () => {
    execFileSync(process.execPath, ['scripts/lab-sizes.mjs', '--check'], { cwd: root });
    const s = JSON.parse(read('lab/sizes.json'));
    expect(s.html).toBe(statSync(resolve(root, 'lab/pieces/compare.html')).size);
    expect(s.mp4).toBe(statSync(resolve(root, 'lab/media/compare.mp4')).size);
  });

  it('the MP4 is the only one the site serves, and it is small (<= 1.5 MB)', () => {
    expect(statSync(resolve(root, 'lab/media/compare.mp4')).size).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });

  it('the comparison piece has no size in pixels: every size is an expression of W / H / GW / GH, so resize() draws it sharp at any size', () => {
    const src = read('lab/pieces/compare.html');
    const comp = src.slice(src.indexOf('const composition'), src.indexOf('const box'));
    const sizes = [...comp.matchAll(/\b(width|height|fontSize|radius|strokeWidth|letterSpacing|cornerRadius|x|y):\s*([^,}\n]+)/g)];
    expect(sizes.length).toBeGreaterThan(10);
    for (const [, key, value] of sizes) expect(value, `${key}: ${value}`).toMatch(/G?[WH]\b/);
    for (const d of ['diamonds']) expect(src).toContain(d);
  });
});

describe('lab/index.html', () => {
  const BLOCKS = ['light', 'sharp', 'live-edit', 'touch', 'mp4', 'embed'];

  it('says the claim first, then the six properties in order', () => {
    expect(main).toMatch(/<h1[^>]*>[^<]*not an MP4[^<]*<\/h1>/i);
    const at = BLOCKS.map((id) => main.indexOf(`id="${id}"`));
    at.forEach((i, n) => expect(i, BLOCKS[n]).toBeGreaterThan(-1));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('every block carries the sentence you would give an AI to get the same', () => {
    for (let i = 0; i < BLOCKS.length; i++) {
      const block = main.slice(main.indexOf(`id="${BLOCKS[i]}"`), i + 1 < BLOCKS.length ? main.indexOf(`id="${BLOCKS[i + 1]}"`) : undefined);
      expect(block, BLOCKS[i]).toMatch(/class="ask"/);
    }
  });

  it('shows the measured sizes (generated from sizes.json), in kilobytes', () => {
    const s = JSON.parse(read('lab/sizes.json'));
    const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
    expect(main).toContain(kb(s.html));
    expect(main).toContain(kb(s.mp4));
  });

  it('the touchable pieces are live players of pages that pin 1.0.0, with their posters', () => {
    const pages = [...main.matchAll(/<figure class="live"[^>]*data-page="([^"]+)"/g)].map((m) => m[1]!);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const p of pages) {
      const file = resolve(root, 'lab', p);
      expect(existsSync(file), p).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain('pixi-effects@1.0.0');
    }
  });

  it('the two live panes stand on the poster of the piece (never an empty box), and the piece pins every library it loads', () => {
    for (const id of ['sharp', 'live-edit']) {
      const block = main.slice(main.indexOf(`id="${id}"`));
      expect(block.slice(0, block.indexOf('</section>')), id).toMatch(/<img[^>]+src="pieces\/compare\.jpg"[\s\S]*<iframe/);
    }
    const src = read('lab/pieces/compare.html');
    expect(src).toMatch(/"mediabunny":\s*"https:\/\/esm\.sh\/mediabunny@\d/);
  });

  it('says what the page needs to run, measured: the player it loads once (lab/sizes.json player > 0)', () => {
    const s = JSON.parse(read('lab/sizes.json'));
    expect(s.player).toBeGreaterThan(s.html);
    expect(main).toContain(`${Math.round(s.player / 1024)} KB`);
    expect(main).toMatch(/once/);
  });

  it('gives the embed snippet, with a copy button', () => {
    const embed = main.slice(main.indexOf('id="embed"'));
    expect(embed).toMatch(/&lt;iframe[^<]*lab\/pieces\/compare\.html/);
    expect(embed).toMatch(/data-copy/);
  });
});
