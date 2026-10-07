import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM data file next to the page
import { TUNES } from '../../examples/music-lab/tunes.mjs';
import { resolveMusic } from '../../src/audio/music/resolve';
import { renderMusic, musicLength } from '../../src/audio/music/render';

const page = readFileSync(resolve(__dirname, '../../examples/music-lab.html'), 'utf8');
type Tune = { id: string; title: string; brief: string; summary: string; by: string; music: object };

describe('examples/music-lab tunes', () => {
  it('has eight tunes with a title, the brief and who wrote it, and the page says how many', () => {
    expect(TUNES.length).toBe(8);
    expect(new Set((TUNES as Tune[]).map(t => t.id)).size).toBe(8);
    for (const t of TUNES as Tune[]) for (const k of ['id', 'title', 'brief', 'summary', 'by'] as const) expect(t[k], `${t.id}.${k}`).toBeTruthy();
    expect(page).toContain('Eight tunes');
  });

  for (const t of TUNES as Tune[]) {
    it(`"${t.title}" is a score the library plays: no warnings, a length of 10–40 s, sound all the way`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const messages: string[] = [];
      const m = resolveMusic(t.music, `tune "${t.id}"`, msg => messages.push(msg));
      expect(messages).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
      expect(m).not.toBeNull();
      const seconds = musicLength(m!);
      expect(seconds).toBeGreaterThan(10);
      expect(seconds).toBeLessThan(40);
      const sr = 8000, l = renderMusic(m!, sr, seconds, false)[0];
      let loudSeconds = 0;
      for (let s = 0; s < Math.floor(m!.seconds); s++) { let e = 0; for (let i = s * sr; i < (s + 1) * sr; i++) e += l[i]! ** 2; if (Math.sqrt(e / sr) > 0.004) loudSeconds++; }
      expect(loudSeconds / Math.floor(m!.seconds)).toBeGreaterThan(0.85);       // nearly every second of the music is audible
    });
  }
});
