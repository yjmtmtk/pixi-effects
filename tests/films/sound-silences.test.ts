// @vitest-environment node
// Group 10 (Sound): silence detection. The answers come from the documents, written here before the film was run:
//  - docs/media.md (sound): "silences  none (nothing quieter than −60 dBFS for a second or more)", and "These are the numbers `check` gives for a movie's mix,
//    from the same code (`inspectSound` …)"; docs/api.md inspectSound: "The numbers are the ones `movie.inspectAudio()` gives for the same samples";
//    src/audio/loudness.ts, comment of findSilences: "Runs of at least `minLength` seconds where every channel stays below `thresholdDb` (default -60 dBFS)".
//    So a silence is a run of 1 s or more below −60 dBFS; a run of 0.9 s is not one.
//  - docs/api.md (inspectAudio / SoundReport): loudness.silences is `Array<{ from: number; to: number }>` (seconds), and `notes` tell "silent stretches".
//  - docs/dsl.md, the sfx preset table: `riser` 1 s, loudest at its end; `beep` 0.16 s, flat. cheatsheet.md: "The layer's `duration` IS the sound's length".
//    So a riser at 0 is sound up to 1 s, and a beep at S is sound from S (loud from its first sample) to S + 0.16.
//  - docs/dsl.md: "`volume: 1` is the preset's standard level, peaking at −12 … −18 dBFS depending on the preset". A beep at volume 0.0005 (−66 dB) peaks at
//    −78 … −84 dBFS: below −60, still silence. At volume 0.05 (−26 dB) it peaks at −38 … −44 dBFS: sound, which splits the quiet stretch in two.
// Expected (the film is SECOND + 0.5 s long, so the 0.34 s after the beep is too short to count):
//    default (beep at 4)       → [{ from 1, to 4 }]
//    ?second=2.1 (gap 1.1 s)   → [{ from 1, to 2.1 }]           ?second=1.9 (gap 0.9 s) → []
//    ?fill=1 (a tone under it all) → []
//    ?faint=0.0005             → [{ from 1, to 4 }]             ?faint=0.05 (beep at 2.5) → [{ from 1, to 2.5 }, { from 2.66, to 4 }]
// Every from / to within 50 ms.
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

type Silence = { from: number; to: number };
type Report = { loudness: { silences: Silence[] }; notes: string[] };
const TOL = 0.05;

const audioOf = (query?: string) => withFilm('sound-silences', async (film) => ({
  audio: await film.eval<Report>('JSON.parse(JSON.stringify(movie.inspectAudio()))'),
  logs: await film.eval<string[]>('window.__logs'),
}), query ? { query } : {});

function expectSilences(got: Silence[], want: Silence[], what: string): void {
  expect(got.length, `${what}: ${JSON.stringify(got)}`).toBe(want.length);
  want.forEach((w, i) => {
    expect(Math.abs(got[i]!.from - w.from), `${what}: silence ${i} starts at ${got[i]!.from}, documented ${w.from}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(got[i]!.to - w.to), `${what}: silence ${i} ends at ${got[i]!.to}, documented ${w.to}`).toBeLessThanOrEqual(TOL);
  });
}

/** The notes name each silent stretch with its times (api.md: notes tell "silent stretches"), and say nothing of silence when there is none. */
function expectNotes(notes: string[], silences: Silence[]): void {
  const silentNotes = notes.filter((n) => /silent/.test(n));
  expect(silentNotes.length, JSON.stringify(notes)).toBe(silences.length);
  silences.forEach((s, i) => {
    expect(silentNotes[i], 'the note gives the start and the end of the stretch').toContain(`${s.from} s`);
    expect(silentNotes[i]).toContain(`${s.to} s`);
  });
}

runFilms('Sound: the silent stretches of the mix', () => {
  it('a riser at 0 s (to 1 s) and a beep at 4 s: the mix is silent from 1 s to 4 s, once, and a note says so', async () => {
    const { audio, logs } = await audioOf();
    expectSilences(audio.loudness.silences, [{ from: 1, to: 4 }], 'default');
    expectNotes(audio.notes, audio.loudness.silences);
    expect(logs).toEqual([]);
  }, 120_000);

  it('the minimum is a second: a 1.1 s gap is reported, a 0.9 s gap is not', async () => {
    const long = await audioOf('second=2.1');
    expectSilences(long.audio.loudness.silences, [{ from: 1, to: 2.1 }], 'second=2.1');
    expectNotes(long.audio.notes, long.audio.loudness.silences);
    const short = await audioOf('second=1.9');
    expectSilences(short.audio.loudness.silences, [], 'second=1.9');
    expectNotes(short.audio.notes, []);
  }, 180_000);

  it('a steady tone under the whole movie: sound everywhere, no silence and no note about one', async () => {
    const { audio, logs } = await audioOf('fill=1');
    expectSilences(audio.loudness.silences, [], 'fill=1');
    expectNotes(audio.notes, []);
    expect(logs).toEqual([]);
  }, 120_000);

  it('the threshold is −60 dBFS: a beep peaking near −80 dBFS leaves the stretch whole, one near −40 dBFS splits it at 2.5 s and 2.66 s', async () => {
    const under = await audioOf('faint=0.0005');
    expectSilences(under.audio.loudness.silences, [{ from: 1, to: 4 }], 'faint=0.0005');
    const over = await audioOf('faint=0.05');
    expectSilences(over.audio.loudness.silences, [{ from: 1, to: 2.5 }, { from: 2.66, to: 4 }], 'faint=0.05');
    expectNotes(over.audio.notes, over.audio.loudness.silences);
  }, 180_000);
});
