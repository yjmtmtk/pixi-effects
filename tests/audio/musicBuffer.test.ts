import { describe, it, expect, vi, afterEach } from 'vitest';
import { musicBuffer } from '../../src/audio/musicBuffer';

/** A stand-in for Web Audio's AudioBuffer (the test environment has none). */
class FakeBuffer {
  length: number; sampleRate: number; numberOfChannels: number; data: Float32Array[];
  constructor(o: { length: number; sampleRate: number; numberOfChannels: number }) { Object.assign(this, o); this.data = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length)); }
  copyToChannel(src: Float32Array, ch: number) { this.data[ch]!.set(src); }
  getChannelData(ch: number) { return this.data[ch]!; }
}
const music = { bpm: 120, tracks: [{ inst: 'keys', notes: 'c4:2 e4:2' }] };

afterEach(() => { vi.unstubAllGlobals(); });

describe('musicBuffer()', () => {
  it('is an AudioBuffer of the music (stereo, its length plus the tail, audible), at the rate asked', async () => {
    vi.stubGlobal('AudioBuffer', FakeBuffer);
    const b = (await musicBuffer(music, { sampleRate: 8000 })) as unknown as FakeBuffer;
    expect(b.numberOfChannels).toBe(2);
    expect(b.sampleRate).toBe(8000);
    expect(b.length).toBe(Math.round((2 + 2.5) * 8000));
    expect(Math.max(...b.getChannelData(0).map(Math.abs))).toBeGreaterThan(0.1);
    expect(Math.max(...b.getChannelData(1).map(Math.abs))).toBeGreaterThan(0.1);
  });

  it('duration cuts it, and loop repeats it up to the duration', async () => {
    vi.stubGlobal('AudioBuffer', FakeBuffer);
    const cut = (await musicBuffer(music, { sampleRate: 8000, duration: 1 })) as unknown as FakeBuffer;
    expect(cut.length).toBe(8000);
    const looped = (await musicBuffer({ bpm: 120, humanize: 0, reverb: 0, tracks: [{ inst: 'pluck', notes: 'c4:1 _:3' }] }, { sampleRate: 8000, duration: 6, loop: true })) as unknown as FakeBuffer;
    const rms = (t0: number, t1: number) => { let s = 0; const d = looped.getChannelData(0); for (let i = t0 * 8000; i < t1 * 8000; i++) s += d[i]! ** 2; return Math.sqrt(s / ((t1 - t0) * 8000)); };
    expect(rms(0, 0.4)).toBeGreaterThan(0.01);
    expect(rms(4, 4.4)).toBeGreaterThan(0.01);                          // the third time round (a loop is 2 s)
  });

  it('a score that cannot play is an error that says why; a bad duration too; warnings still print', async () => {
    vi.stubGlobal('AudioBuffer', FakeBuffer);
    await expect(musicBuffer({ tracks: [] } as never)).rejects.toThrow(/musicBuffer\(\).*bpm is required/);
    await expect(musicBuffer(music, { duration: -1 })).rejects.toThrow(/duration must be a positive/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await musicBuffer({ bpm: 100, tracks: [{ inst: 'piano', notes: 'c4:2' }, { inst: 'keys', notes: 'c4:2' }] }, { sampleRate: 8000 });
    expect(warn.mock.calls.join('\n')).toMatch(/"piano".*did you mean "keys"/);
    warn.mockRestore();
  });
});
