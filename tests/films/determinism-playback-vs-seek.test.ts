// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Determinism: playback against seek. Is the frame a PLAYING movie shows the frame a snapshot (a seek) gives for the same frame?
// The film (tests/films/determinism-playback-vs-seek.html): 320 x 180, 3 s at 30 fps (?fps=24), a moving rect, a counter text, a keyframed alpha,
// a wiggle (seeded random over time) and a canvas layer with info.random(): every layer changes on every frame.
//
// Where the answers come from (written before the film was run):
// - docs/philosophy.md §4 "Time is deterministic and seekable": "One frame path (`gotoFrame`) serves both playback and export. Preview must equal export."
//   and "Anything time-varying is a pure function of time". docs/api.md play(): "Starts the requestAnimationFrame loop that drives `gotoFrame()` per tick".
//   docs/api.md snapshot(): "A picture of one frame: the canvas only … Seeks to `frame` … and stays there."
//   So a frame drawn while playing and the snapshot of the same frame are the same picture: 0 pixels differ (exact, one renderer: philosophy.md
//   "Determinism holds within one renderer").
// - docs/api.md gotoFrame(): "Updates `timeline.time()`, awaits any video frame readiness, renders, and emits `'frame'`"; the events table: 'frame' is sent
//   on "every `gotoFrame` (so once per playback frame too)". So the canvas read inside a 'frame' event while `isPlaying` is the ticker's frame.
// - docs/api.md playUntil(seconds): "Play, and pause exactly at `seconds` (the frame `round(seconds × frameRate)`). It resolves `true` when the playhead
//   has landed there". So after `await movie.playUntil(s)`: true, `currentFrame` = round(s × fps), `isPlaying` false, and no frame past it was drawn.
//   At 30 fps: 0.5 → 15, 1.2 → 36, 2.0 → 60, 2.9 → 87. At 24 fps: 0.5 → 12, 1.2 → 29 (28.8), 2.0 → 48, 2.9 → 70 (69.6).
// - docs/api.md play(): play from the current frame; gotoFrame(0) puts the playhead back at the start (the snapshot-first order needs it: a snapshot
//   "stays there").
// - docs/dsl.md "Randomness is seeded": "never use `Math.random()` for anything that ends up in the picture"; the canvas-layer contract: "no `Math.random` …
//   (a warning at build says so …)". ?unseeded=1 breaks it on purpose: then a played frame is NOT its snapshot, and a warning is logged.
//
// What the documents do not say, and is therefore not pinned: which frames a playing movie draws (it may skip frames on a slow tick; api.md says only
// that the rAF loop drives gotoFrame per tick), and whether the frame playUntil() lands on is drawn while still playing or after the pause.

const TIMES = [0.5, 1.2, 2.0, 2.9];
const landingFrames = (fps: number) => TIMES.map((s) => Math.round(s * fps));

type Event = { frame: number; playing: boolean; hash: string };
type Landing = { landed: boolean; currentFrame: number; isPlaying: boolean; hash: string };
type Diff = { differing: number; maxDiff: number; recorded: string; snapshot: string } | null;

/** Play to each time in turn from the current frame, recording every 'frame' event of each segment. */
async function playSegments(film: Film): Promise<{ landings: Landing[]; segments: Event[][] }> {
  const landings: Landing[] = [], segments: Event[][] = [];
  for (const s of TIMES) {
    await film.eval('startRecording()');
    landings.push(await film.eval<Landing>(`playTo(${s})`));
    segments.push(await film.eval<Event[]>('stopRecording()'));
  }
  return { landings, segments };
}

/** What api.md says about each playUntil(): true, landed on round(s × fps), paused, and no frame drawn outside [start, target] (play() starts at the
 *  current frame, so its first tick may draw that frame again). */
function expectLandings(landings: Landing[], segments: Event[][], fps: number, startFrame: number): void {
  const want = landingFrames(fps);
  let from = startFrame;
  landings.forEach((l, i) => {
    const what = `playUntil(${TIMES[i]}) at ${fps} fps`;
    expect(l.landed, `${what} resolves true`).toBe(true);
    expect(l.currentFrame, `${what}: currentFrame round(${TIMES[i]} × ${fps})`).toBe(want[i]);
    expect(l.isPlaying, `${what}: paused there`).toBe(false);
    const frames = segments[i]!.map((e) => e.frame);
    expect(frames.length, `${what}: 'frame' events ${JSON.stringify(frames)}`).toBeGreaterThan(0);
    expect(frames[frames.length - 1], `${what}: the last frame drawn is the target`).toBe(want[i]);
    for (let k = 0; k < frames.length; k++) {
      expect(frames[k]!, `${what}: frame ${frames[k]} inside [${from}, ${want[i]}]`).toBeGreaterThanOrEqual(from);
      expect(frames[k]!).toBeLessThanOrEqual(want[i]!);
      if (k > 0) expect(frames[k]!, `${what}: frames go forward ${JSON.stringify(frames)}`).toBeGreaterThanOrEqual(frames[k - 1]!);
    }
    from = want[i]!;
  });
}

async function expectSame(film: Film, kind: 'played' | 'rest', frames: number[]): Promise<void> {
  for (const f of frames) {
    const d = await film.eval<Diff>(`compareWithSnapshot(${JSON.stringify(kind)}, ${f})`);
    expect(d, `${kind} frame ${f} was recorded`).not.toBeNull();
    expect(d, `${kind === 'played' ? 'the frame drawn while playing' : 'the picture at rest after playUntil, read in the ticker'} = snapshot(${f})`).toMatchObject({ differing: 0, maxDiff: 0 });
  }
}

const NO_GPU = 'delete Navigator.prototype.gpu;';                 // as in backends-agree: with no navigator.gpu PixiJS draws on WebGL
const CASES = [
  { fps: 30, gl: false }, { fps: 30, gl: true }, { fps: 24, gl: false },
];
const open = (fps: number, gl: boolean) => ({ ...(fps === 30 ? {} : { query: `fps=${fps}` }), ...(gl ? { beforeLoad: NO_GPU } : {}) });
const expectBackend = async (film: Film, gl: boolean) => {
  const name = await film.eval<string>('window.backend');
  if (gl) expect(name, 'with no navigator.gpu the film draws on WebGL').toBe('webgl');
  return name;
};

runFilms('Determinism: the frame a playing movie shows is the snapshot of that frame', () => {
  for (const { fps, gl } of CASES) {
    const label = `${fps} fps${gl ? ', WebGL' : ''}`;
    it(`${label}, play first: playUntil lands on round(s × ${fps}); every frame drawn while playing, and the picture at rest, equal snapshot() taken afterwards`, async () => {
      await withFilm('determinism-playback-vs-seek', async (film) => {
        const backend = await expectBackend(film, gl);
        const { landings, segments } = await playSegments(film);
        expectLandings(landings, segments, fps, 0);
        const played = await film.eval<number[]>('playedFrames()');
        console.log(`[determinism-playback-vs-seek ${label} on ${backend}] frames drawn while playing: ${played.length} of ${landingFrames(fps).at(-1)! + 1}: ${JSON.stringify(played)}`);
        // the ticker's frames: every frame drawn while isPlaying (the segments span tens of frames: more than a handful are drawn)
        expect(played.length, `frames drawn while playing: ${JSON.stringify(played)}`).toBeGreaterThanOrEqual(3);
        await expectSame(film, 'played', played);
        await expectSame(film, 'rest', landingFrames(fps));
        // the film really changes from frame to frame: four landings, four pictures
        expect(new Set(landings.map((l) => l.hash)).size, 'four different pictures').toBe(4);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, open(fps, gl));
    }, 120_000);

    it(`${label}, snapshot first: snapshot() of each frame, then play from 0: the ticker's picture at each landing is that snapshot`, async () => {
      await withFilm('determinism-playback-vs-seek', async (film) => {
        await expectBackend(film, gl);
        const want = landingFrames(fps);
        const before: string[] = [];
        for (const f of want) before.push(await film.eval<string>(`hashOfSnapshot(${f})`));
        await film.eval('movie.gotoFrame(0)');
        expect(await film.eval<number>('movie.currentFrame')).toBe(0);
        const { landings, segments } = await playSegments(film);
        expectLandings(landings, segments, fps, 0);
        landings.forEach((l, i) => expect(l.hash, `frame ${want[i]}: the playing movie at rest = the snapshot taken before`).toBe(before[i]));
        // and every frame drawn while playing is its snapshot too (taken now, after: a snapshot does not depend on what was drawn before)
        await expectSame(film, 'played', await film.eval<number[]>('playedFrames()'));
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, open(fps, gl));
    }, 120_000);
  }

  it('the comparison catches a film that breaks the contract (?unseeded=1: Math.random in a canvas layer): played frames differ from their snapshots, and it warns', async () => {
    await withFilm('determinism-playback-vs-seek', async (film) => {
      const { landings } = await playSegments(film);
      const rest = landingFrames(30);
      expect(landings.map((l) => l.currentFrame)).toEqual(rest);
      for (const f of rest) {
        const d = await film.eval<Diff>(`compareWithSnapshot('rest', ${f})`);
        expect(d!.differing, `frame ${f}: Math.random dots moved between the play and the snapshot`).toBeGreaterThan(0);
      }
      const logs = await film.eval<string[]>('window.__logs');
      expect(logs.some((l) => /Math\.random/.test(l)), `a warning names Math.random: ${JSON.stringify(logs)}`).toBe(true);
    }, { query: 'unseeded=1' });
  }, 120_000);
});
