// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { runFilms, withFilm } from './support/withFilm';

/** load the film and export its sound (wav): what every new instrument, effect and kit made, as bytes */
const sound = (): Promise<Buffer> => withFilm('music-range', async (film) => {
  expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
  return film.render({ format: 'wav' });
});
/** The largest sample between two seconds of a wav (its header read for the rate, channels and sample format). */
const loudest = (wav: Buffer, from: number, to: number): number => {
  let o = 12, fmt = { tag: 1, ch: 2, sr: 48000, bits: 16 }, data = wav.subarray(0, 0);
  while (o + 8 <= wav.length) {
    const id = wav.toString('ascii', o, o + 4), size = wav.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { tag: wav.readUInt16LE(o + 8), ch: wav.readUInt16LE(o + 10), sr: wav.readUInt32LE(o + 12), bits: wav.readUInt16LE(o + 22) };
    if (id === 'data') data = wav.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  const bytes = fmt.bits / 8, frame = bytes * fmt.ch;
  let peak = 0;
  for (let i = Math.floor(from * fmt.sr) * frame; i + bytes <= Math.min(data.length, Math.floor(to * fmt.sr) * frame); i += bytes) {
    const v = fmt.tag === 3 ? data.readFloatLE(i) : bytes === 2 ? data.readInt16LE(i) / 32768 : data.readInt32LE(i) / 2147483648;
    peak = Math.max(peak, Math.abs(v));
  }
  return peak;
};

runFilms('Music: the wider palette (instruments, effects, kits) in a browser', () => {
  it('becomes ready with no warnings, sounds in each of its sections, and gives the same sound on every load', async () => {
    const a = await sound(), b = await sound();
    expect(a.length).toBeGreaterThan(100_000);
    expect(createHash('sha1').update(b).digest('hex')).toBe(createHash('sha1').update(a).digest('hex'));
    for (const [from, to] of [[0, 4], [4, 8], [8, 12], [12, 16]] as const) expect(loudest(a, from, to), `${from}–${to} s`).toBeGreaterThan(0.05);
  }, 240_000);
});
