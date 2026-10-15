// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

const FRAMES = [0, 1, 17, 29, 30, 59, 60, 89];       // the seams of a 30 fps, 3 s movie and some frames in between

runFilms('Determinism: a frame is a function of the script and the time, whichever way it is reached', () => {
  it('the film loads clean and really changes from frame to frame', async () => {
    await withFilm('determinism', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      const hashes: string[] = [];
      for (const f of FRAMES) hashes.push(await film.eval<string>(`hashOf(${f})`));       // one after the other: a snapshot moves the one stage
      expect(new Set(hashes).size, 'eight frames, eight pictures').toBe(FRAMES.length);
    });
  }, 300_000);
  it('forward, backward, by jumps and twice in a row: one picture per frame', async () => {
    await withFilm('determinism', async (film) => {
      const hashes = async (order: number[]) => { const out: Record<number, string> = {}; for (const f of order) out[f] = await film.eval(`hashOf(${f})`); return out; };
      const forward = await hashes(FRAMES);
      const backward = await hashes([...FRAMES].reverse());
      const jumps = await hashes([60, 0, 89, 17, 1, 59, 29, 30]);
      const twice = await hashes(FRAMES.flatMap((f) => [f, f]));
      expect(backward).toEqual(forward);
      expect(jumps).toEqual(forward);
      expect(twice).toEqual(forward);
    });
  }, 300_000);
  it('a second load of the film gives the same pictures (nothing comes from the clock)', async () => {
    const first = await withFilm('determinism', async (film) => { const out: string[] = []; for (const f of FRAMES) out.push(await film.eval<string>(`hashOf(${f})`)); return out; });
    const second = await withFilm('determinism', async (film) => { const out: string[] = []; for (const f of FRAMES) out.push(await film.eval<string>(`hashOf(${f})`)); return out; });
    expect(second).toEqual(first);
  }, 300_000);
  it('the export agrees with the snapshot of the same frame (PSNR in dB: the picture in a file is lossy)', async () => {
    await withFilm('determinism', async (film) => {
      const file = await film.render({ video: { bitrate: 'very-high' } });
      const b64 = file.toString('base64');
      const psnr: number[] = [];
      for (const f of [0, 17, 59, 89]) psnr.push(await film.eval<number>(`psnrAgainstFile(${JSON.stringify(b64)}, ${f})`));
      // measured 2026-10-15 (the film has grain 0.05): 38.2, 33.6, 32.5, 32.7 dB; the bound is 3 dB under the lowest
      for (const p of psnr) expect(p, `PSNR ${psnr.map((x) => x.toFixed(1)).join(', ')} dB`).toBeGreaterThan(29);
    });
  }, 300_000);
});
