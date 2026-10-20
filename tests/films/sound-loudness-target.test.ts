// @vitest-environment node
// Group 10 (Sound): the loudness target, movie.init({ loudness: T }). The answers come from the documents, written here before the film was run:
//  - docs/dsl.md, "The loudness of the whole mix": "`loudness` is a target for the finished mix in LUFS (ITU-R BS.1770): one gain, up or down, and a look-ahead
//    limiter that takes a click or a hit on top of a quiet bed down so that no peak passes -1 dBTP (true peak), the same for playback and export. A mix whose
//    peaks are within 10 dB of what the limiter can take reaches the target (`check` says where the limiter worked hardest and which sounds play there when it
//    took 3 dB or more off); a click 30 dB over its bed is out of reach and stops short (`reached -19.4 LUFS`), and `check` / `inspectAudio()` name the moment
//    and the sounds that make it, with the fix (lower that sound, or ask for less). … `false` or no option leaves the mix as the layers make it; `check` then
//    says when it is quiet".
//  - docs/api.md, init options: "loudness?: number | false; // the whole mix at this many LUFS …: one gain, up or down, and a look-ahead limiter keeping the true
//    peak at -1 dBTP or under (a click over a quiet bed is pulled down; more than 10 dB of limiting is out of reach and `check` names it); false / left out: the
//    mix as the layers make it".
//  - docs/dsl.md, sfx: "`volume: 1` is the preset's standard level, peaking at −12 … −18 dBFS depending on the preset"; the music section: "`volume` … scale it"
//    (a volume twice as high is +6.02 dB on every level of a mix that is not limited).
// What follows from them, for a mix measured without the option (L0 = its integrated loudness, P0 = its loudest sample, `inspectAudio().peakDb`):
//    reaching T takes the gain T − L0; the loudest sample then lands at P0 + T − L0, so the limiting it needs is  need = P0 + T − L0 − (−1)  dB.
//    need ≤ 0   → the gain only: L = T, and the shape is kept (true peak − loudness is what it was);
//    0 < need ≤ 10 (well inside) → L = T and the true peak ≤ −1 dBTP; at need ≥ 3 a note names where the limiter worked (1.5 s, the 'hit');
//    need > 10  → out of reach: at most 10 dB of limiting allows a gain of at most −1 + 10 − P0, so L ≤ L0 + 9 − P0 < T: it stops short, raised toward T,
//                 the true peak still ≤ −1, and a note gives the moment (1.5 s), the sound ('spike'), how far it got, and the fix (lower it, or ask for less).
//    no option / false → L = L0 exactly, and twice the volume reads 6.02 dB more; with a target, the volume of the layers does not change where it ends.
// Tolerance on "reaches": the documents give no number (a doc gap, reported); the report rounds to 0.1, so 0.2 LU is "reaches".
import { it, expect } from 'vitest';
import { measureLoudness } from '../../src/audio/loudness';
import { runFilms, withFilm } from './support/withFilm';

type Report = { peakDb: number; loudness: { integratedLufs: number | null; truePeakDb: number }; notes: string[]; issues: string[] };
const REACH = 0.2;           // "reaches the target" (see above)
const CEILING = -1;          // dBTP, dsl.md / api.md
const MAX_LIMIT = 10;        // dB, api.md: "more than 10 dB of limiting is out of reach"
const CLICK_AT = 1.5;        // the film's click (hit / spike)

const audioOf = (query: string) => withFilm('sound-loudness-target', async (film) => ({
  audio: await film.eval<Report>('JSON.parse(JSON.stringify(movie.inspectAudio()))'),
  logs: await film.eval<string[]>('window.__logs'),
}), { query });
const lufs = (r: Report) => r.loudness.integratedLufs!;
/** dB of limiting that reaching `target` needs for a mix measured without the option. */
const need = (plain: Report, target: number) => plain.peakDb + (target - lufs(plain)) - CEILING;

runFilms('Sound: init({ loudness }) brings the whole mix to a target', () => {
  it('a quiet bed is raised and a loud one lowered to the target by one gain: the true peak minus the loudness is what it was', async () => {
    for (const [mix, T] of [['quiet', -16], ['loud', -16], ['quiet', -23]] as const) {
      const plain = (await audioOf(`mix=${mix}`)).audio;
      const { audio, logs } = await audioOf(`mix=${mix}&loudness=${T}`);
      const what = `${mix} → ${T}: plain ${lufs(plain)} LUFS / ${plain.loudness.truePeakDb} dBTP, now ${lufs(audio)} / ${audio.loudness.truePeakDb}`;
      expect(need(plain, T), `${what}: the film's bed must need no limiting`).toBeLessThan(-3);
      if (mix === 'quiet') expect(lufs(plain), `${what}: the quiet bed is under the target`).toBeLessThan(T - 5);
      else expect(lufs(plain), `${what}: the loud bed is over the target`).toBeGreaterThan(T + 3);
      expect(Math.abs(lufs(audio) - T), `${what}: reaches the target`).toBeLessThanOrEqual(REACH);
      expect(Math.abs((audio.loudness.truePeakDb - lufs(audio)) - (plain.loudness.truePeakDb - lufs(plain))), `${what}: one gain keeps the shape`).toBeLessThanOrEqual(0.25);
      expect(audio.loudness.truePeakDb, what).toBeLessThanOrEqual(CEILING);
      expect(audio.notes.join('\n'), `${what}: a mix at its target is not called quiet`).not.toMatch(/quiet/);
      expect(logs, what).toEqual([]);
    }
  }, 300_000);

  it('a hit on a quiet bed that needs a few dB of limiting: the target is reached, the true peak stays at -1 dBTP or under, and a note names where the limiter worked', async () => {
    const T = -16;
    const plain = (await audioOf('mix=hit')).audio;
    const { audio, logs } = await audioOf(`mix=hit&loudness=${T}`);
    const what = `hit → ${T}: plain ${lufs(plain)} LUFS, sample peak ${plain.peakDb} dBFS (need ${need(plain, T).toFixed(1)} dB), now ${lufs(audio)} / ${audio.loudness.truePeakDb} dBTP; notes ${JSON.stringify(audio.notes)}`;
    expect(need(plain, T), `${what}: the film's hit must need 4.5 to 8 dB of limiting`).toBeGreaterThanOrEqual(4.5);
    expect(need(plain, T), what).toBeLessThanOrEqual(8);
    expect(Math.abs(lufs(audio) - T), `${what}: reaches the target`).toBeLessThanOrEqual(REACH);
    expect(audio.loudness.truePeakDb, `${what}: no peak passes -1 dBTP`).toBeLessThanOrEqual(CEILING);
    const where = audio.notes.find((n) => /limit/.test(n) && n.includes('hit'));
    expect(where, `${what}: a note says where the limiter worked hardest and what plays there`).toBeDefined();
    const times = [...where!.matchAll(/(\d+(?:\.\d+)?) s\b/g)].map((m) => Number(m[1]));
    expect(times.some((t) => Math.abs(t - CLICK_AT) <= 0.05), `${what}: the moment is the click's`).toBe(true);
    expect(logs).toEqual([]);
  }, 200_000);

  it('the same mix exported as a file has the loudness and the true peak inspectAudio reports (the same for playback and export)', async () => {
    const T = -16;
    const { audio, wav } = await withFilm('sound-loudness-target', async (film) => ({
      audio: await film.eval<Report>('JSON.parse(JSON.stringify(movie.inspectAudio()))'),
      wav: await film.render({ format: 'wav' }),
    }), { query: `mix=hit&loudness=${T}` });
    const pcm = readWav(wav);
    const m = measureLoudness(pcm.channels, pcm.sampleRate);
    expect(Math.abs(m.integratedLufs! - lufs(audio)), `file ${m.integratedLufs} LUFS, inspectAudio ${lufs(audio)}`).toBeLessThanOrEqual(0.1);
    expect(Math.abs(m.integratedLufs! - T)).toBeLessThanOrEqual(REACH);
    expect(m.truePeakDb!, 'the file passes -1 dBTP nowhere').toBeLessThanOrEqual(CEILING);
  }, 200_000);

  it('a click far over a very quiet bed is out of reach: it stops short, no further than 10 dB of limiting allows, and a note gives the moment, the sound and the fix', async () => {
    const T = -16;
    const plain = (await audioOf('mix=spike')).audio;
    const { audio, logs } = await audioOf(`mix=spike&loudness=${T}`);
    const what = `spike → ${T}: plain ${lufs(plain)} LUFS, sample peak ${plain.peakDb} dBFS (need ${need(plain, T).toFixed(1)} dB), now ${lufs(audio)} / ${audio.loudness.truePeakDb} dBTP; notes ${JSON.stringify(audio.notes)}`;
    expect(need(plain, T), `${what}: by the 10 dB rule the film's spike must be out of reach`).toBeGreaterThan(MAX_LIMIT);
    const most = lufs(plain) + (CEILING + MAX_LIMIT - plain.peakDb);        // the loudness at the largest gain 10 dB of limiting allows
    expect(lufs(audio), `${what}: no further than ${most.toFixed(1)} LUFS`).toBeLessThanOrEqual(most + 0.2);
    expect(lufs(audio), `${what}: stops short of the target`).toBeLessThan(T - 2);
    expect(lufs(audio), `${what}: raised toward it`).toBeGreaterThan(lufs(plain) + 1);
    expect(audio.loudness.truePeakDb, `${what}: the true peak still stays at -1 dBTP or under`).toBeLessThanOrEqual(CEILING);
    const why = audio.notes.find((n) => n.includes(`${T} LUFS`) && /lower/.test(n) && /ask for less/.test(n));
    expect(why, `${what}: a note with the fix (lower that sound, or ask for less)`).toBeDefined();
    expect(why, `${what}: it names the sound`).toContain('spike');
    const times = [...why!.matchAll(/(\d+(?:\.\d+)?) s\b/g)].map((m) => Number(m[1]));
    expect(times.some((t) => Math.abs(t - CLICK_AT) <= 0.05), `${what}: it names the moment`).toBe(true);
    const levels = [...why!.matchAll(/(-\d+(?:\.\d)?) LUFS/g)].map((m) => Number(m[1]));
    expect(levels.some((l) => Math.abs(l - lufs(audio)) <= 0.15), `${what}: it says how far the mix got`).toBe(true);
    expect(logs).toEqual([]);
  }, 200_000);

  // Found by this film: the click alone over almost nothing. The plain mix's loudness is the click's own (the relative gate of BS.1770 leaves the bed out);
  // the target raises the bed, takes the click down, and the gate then lets the bed back in: the mix ends QUIETER than without the option, while a note says it
  // was "raised … toward" the target. dsl.md: a target out of reach "stops short"; api.md: "one gain, up or down": it should never end further from the target
  // than it started. The library is wrong here (reported); the test asserts the documented answer.
  it('a click over almost nothing: a target out of reach still moves the mix toward it, never away from it', async () => {
    const T = -16;
    const plain = (await audioOf('mix=bare')).audio;
    const { audio } = await audioOf(`mix=bare&loudness=${T}`);
    const what = `bare → ${T}: plain ${lufs(plain)} LUFS, now ${lufs(audio)}; notes ${JSON.stringify(audio.notes)}`;
    expect(lufs(plain), `${what}: the plain mix is under the target`).toBeLessThan(T - 5);
    expect(audio.loudness.truePeakDb, what).toBeLessThanOrEqual(CEILING);
    expect(lufs(audio), `${what}: asked for ${T}, the mix must not end further from it`).toBeGreaterThanOrEqual(lufs(plain));
  }, 200_000);

  it('left out or false, the mix is what the layers make: the same numbers, twice the volume is 6.02 dB louder, and a quiet mix is called quiet; a target does not follow the volume', async () => {
    const none = (await audioOf('mix=quiet')).audio;
    const off = (await audioOf('mix=quiet&loudness=off')).audio;
    const twice = (await audioOf('mix=quiet&vol=2')).audio;
    expect(off.loudness, 'false is the same as no option').toEqual(none.loudness);
    expect(off.peakDb).toBe(none.peakDb);
    // the bed at volume 0.1: the documented peak of a sound at volume 1 (−12 … −18 dBFS) less 20 dB
    expect(none.peakDb, 'the layer\'s own level').toBeLessThanOrEqual(-32 + 0.1);
    expect(none.peakDb).toBeGreaterThanOrEqual(-38 - 0.1);
    const six = 20 * Math.log10(2);
    expect(Math.abs(lufs(twice) - lufs(none) - six), `${lufs(none)} → ${lufs(twice)} LUFS`).toBeLessThanOrEqual(0.15);
    expect(Math.abs(twice.peakDb - none.peakDb - six), `${none.peakDb} → ${twice.peakDb} dBFS`).toBeLessThanOrEqual(0.15);
    expect(none.notes.join('\n'), 'check says when it is quiet, and names the option').toMatch(/quiet[\s\S]*loudness: -16/);
    const T = -16;
    const a = (await audioOf(`mix=quiet&loudness=${T}`)).audio;
    const b = (await audioOf(`mix=quiet&vol=2&loudness=${T}`)).audio;
    expect(Math.abs(lufs(a) - T)).toBeLessThanOrEqual(REACH);
    expect(Math.abs(lufs(b) - T), 'twice the volume, the same target').toBeLessThanOrEqual(REACH);
  }, 300_000);
});

/** A WAV file's samples as floats (PCM 16 / 24 / 32-bit integers or 32-bit float). */
function readWav(buf: Buffer): { sampleRate: number; channels: Float32Array[] } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let off = 12, fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4), body = off + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      if (format === 0xfffe) format = buf.readUInt16LE(body + 24);           // WAVE_FORMAT_EXTENSIBLE: the sub-format's first two bytes
      fmt = { format, channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data' && fmt) {
      const bytes = fmt.bits / 8, frames = Math.floor(Math.min(size, buf.length - body) / (bytes * fmt.channels));
      const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) {
        const p = body + (i * fmt.channels + c) * bytes;
        channels[c]![i] = fmt.format === 3 ? buf.readFloatLE(p) : bytes === 2 ? buf.readInt16LE(p) / 32768 : bytes === 3 ? buf.readIntLE(p, 3) / 8388608 : buf.readInt32LE(p) / 2147483648;
      }
      return { sampleRate: fmt.sampleRate, channels };
    }
    off = body + size + (size & 1);
  }
  throw new Error('no data chunk in the WAV file');
}
