// @vitest-environment node
// Group 3 (Export): the loudness of the sound IN THE FILE. The answers come from the documents, written here before the film was run:
//  - docs/dsl.md "The loudness of the whole mix: `movie.init({ loudness: -16 })`": "`loudness` is a target for the finished mix in LUFS (ITU-R BS.1770): one gain,
//    up or down, and a look-ahead limiter … so that no peak passes -1 dBTP (true peak), the same for playback and export." and "`false` or no option leaves the
//    mix as the layers make it". cheatsheet.md: "`movie.init({ loudness: -16 })` brings the whole mix to -16 LUFS" and "The export (mp4 / webm / mov) encodes
//    this same mix (lossy AAC / Opus)". docs/api.md, before `movie.render`: "`render()` encodes this same mix: AAC in mp4 / mov …, Opus in webm / mkv."
//  - docs/media.md (sound): `pixi-effects sound` gives "Integrated loudness (ITU-R BS.1770), true peak" and "These are the numbers `check` gives for a movie's
//    mix, from the same code (`inspectSound`) … Measured on one of our own exports, `sound` read the −14.8 LUFS that `check` had said (true peak −3.6 against
//    −3.7: the file is AAC …); on a second, very quiet one it read −30 where `check` had said −29.7." So the file's loudness is the page's within a few tenths.
//  - docs/dsl.md (music): "a 4-bar tune … at `volume: 0.8` reads −22 LUFS"; "a few `sfx` at volume 0.15 mix to about -40 LUFS". The film's bed is at 0.3
//    (8.5 dB under 0.8) with three sfx at 0.6: as the layers make it, the mix is far under -16 (under -20), so a file that was normalised cannot pass for one that was not.
//  - docs/dsl.md: "`check` says where the limiter worked hardest … when it took 3 dB or more off" (the note `a limiter took up to N dB off the loudest peak`).
//    The film's click at volume 2 is there so that at -16 the limiter works (the note is asserted as the film's own precondition): the ceiling is then really
//    reached in the mix, and the test sees whether the lossy encoders push the file's true peak over it.
// Expected:
//    default (loudness -16):  the file (mp4, AAC; and webm, Opus) reads -16 ± 1 LUFS, true peak ≤ -1 dBTP; the page's inspectAudio() says -16 ± 0.5 LUFS,
//                             true peak ≤ -1 dBTP; the file's loudness is the page's ± 0.5 LU.
//    ?loudness=-23:           the same with -23.
//    ?loudness=off:           the page's mix is under -20 LUFS (not normalised); the file's loudness is that mix's ± 0.5 LU (not -16).
import { it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runFilms, withFilm } from './support/withFilm';

const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);

type Loud = { integratedLufs: number | null; truePeakDb: number };
const CEILING = -1;            // dsl.md: "no peak passes -1 dBTP (true peak), the same for playback and export"
const FILE_TO_TARGET = 1;      // the task's tolerance for a lossy file against the target
const FILE_TO_PAGE = 0.5;      // media.md: −14.8 against −14.8, −30 against −29.7
const PAGE_TO_TARGET = 0.5;    // the page's mix is the target itself (audio-loudness pins it to 0.5)

/** `pixi-effects sound <file> --json`, run in-process: the library's own reading of the file's sound. */
async function soundOf(file: Buffer, ext: string): Promise<{ loudness: Loud; duration: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'film-loud-'));
  try {
    const path = join(dir, `movie.${ext}`);
    writeFileSync(path, file);
    const out: string[] = [], err: string[] = [];
    const code = await media.runMedia(['sound', path, '--json', '-o', join(dir, 'report')], { log: (s: string) => out.push(s), err: (s: string) => err.push(s) });
    expect(code, err.join('\n')).toBe(0);
    const r = JSON.parse(out.join('\n'));
    return { loudness: r.loudness, duration: r.duration };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The film with a query: what the page measures for its mix, and the files rendered from it. */
const filmOf = (query: string, formats: string[]) => withFilm('export-file-loudness', async (film) => {
  const page = await film.eval<{ loudness: Loud; notes: string[] }>('JSON.parse(JSON.stringify(movie.inspectAudio()))');
  const files: Record<string, Buffer> = {};
  for (const f of formats) files[f] = await film.render({ format: f });
  return { page, files, logs: await film.eval<string[]>('window.__logs') };
}, query ? { query } : {});

async function expectAtTarget(query: string, target: number, formats: string[], o: { limited?: boolean } = {}): Promise<void> {
  const { page, files, logs } = await filmOf(query, formats);
  expect(logs, 'the film is a correct movie').toEqual([]);
  const pageLufs = page.loudness.integratedLufs!;
  expect(Math.abs(pageLufs - target), `the page's mix reads ${pageLufs} LUFS, asked ${target}`).toBeLessThanOrEqual(PAGE_TO_TARGET);
  expect(page.loudness.truePeakDb, 'the page\'s mix: true peak at or under the ceiling').toBeLessThanOrEqual(CEILING);
  if (o.limited) expect(page.notes.join('\n'), 'the film\'s precondition: the limiter took 3 dB or more off the click').toMatch(/a limiter took up to [\d.]+ dB off the loudest peak/);
  for (const f of formats) {
    const s = await soundOf(files[f]!, f);
    const lufs = s.loudness.integratedLufs!;
    expect(Math.abs(lufs - target), `${f}: the file reads ${lufs} LUFS, asked ${target}`).toBeLessThanOrEqual(FILE_TO_TARGET);
    expect(Math.abs(lufs - pageLufs), `${f}: the file reads ${lufs} LUFS, the page said ${pageLufs}`).toBeLessThanOrEqual(FILE_TO_PAGE);
    expect(s.loudness.truePeakDb, `${f}: the file's true peak ${s.loudness.truePeakDb} dBTP, the ceiling is ${CEILING}`).toBeLessThanOrEqual(CEILING);
    expect(Math.abs(s.duration - 3), `${f}: the sound in the file lasts the movie (3 s), read ${s.duration}`).toBeLessThanOrEqual(0.1);
  }
}

runFilms('Export: the loudness of the sound in the file', () => {
  it('loudness: -16 — the mp4 (AAC) and the webm (Opus) read -16 ± 1 LUFS with a true peak at or under -1 dBTP, the page\'s own number ± 0.5 LU', async () => {
    await expectAtTarget('', -16, ['mp4', 'webm'], { limited: true });
  }, 300_000);

  it('another target is followed into the file: loudness -23 reads -23 ± 1 LUFS', async () => {
    await expectAtTarget('loudness=-23', -23, ['mp4']);
  }, 240_000);

  it('loudness left out: the file is not normalised; it reads the mix as the layers make it (under -20 LUFS), the page\'s number ± 0.5 LU', async () => {
    const { page, files, logs } = await filmOf('loudness=off', ['mp4']);
    expect(logs).toEqual([]);
    const pageLufs = page.loudness.integratedLufs!;
    expect(pageLufs, 'as the layers make it the mix is quiet (dsl.md: music at 0.8 reads −22 LUFS; this bed is at 0.3)').toBeLessThan(-20);
    const s = await soundOf(files.mp4!, 'mp4');
    const lufs = s.loudness.integratedLufs!;
    expect(Math.abs(lufs - pageLufs), `the file reads ${lufs} LUFS, the page said ${pageLufs}`).toBeLessThanOrEqual(FILE_TO_PAGE);
    expect(lufs, 'not brought to -16').toBeLessThan(-16 - 3);
  }, 240_000);
});
