import type { Movie } from './Movie';
import type { AudioReport } from './inspectAudio';
import type { FontReport } from './inspectFonts';
import { namedScenes } from './scenes';

/** One kind of issue, with how many frames it was seen in. Issues that differ only by numbers are one kind. */
export interface IssueGroup { message: string; count: number; firstFrame: number; lastFrame: number }

export interface ReviewOptions {
  /** Moments to resolve and report: `3.5`, `50%`, `f120`, `title@end` (comma-separated). */
  at?: string;
  /** Every layout issue is a problem (by default text overlaps are only listed for review). */
  strict?: boolean;
}

export interface ReviewReport {
  /** How many frames were inspected. */
  frames: number;
  /** Text cut off by an edge, outside the canvas, or with no size (with `strict`: every issue). */
  problems: IssueGroup[];
  /** Text overlaps and fonts that are not available: often intentional, look at them on the contact sheet. */
  review: IssueGroup[];
  fonts: FontReport;
  /** The sound as numbers (`movie.inspectAudio()`), or null for a movie with no audio. */
  audio: AudioReport | null;
  /** The moments of `at`, as frames with a label that is safe as a file name. */
  at: Array<{ label: string; frame: number }>;
}

interface Row { name: string; start: number; end: number; depth?: number; parts?: Array<{ start: number; end: number }>; partNames?: string[] }

/**
 * The frames movie.inspect looks at: the first and last frame, every scene's first and last frame (where a title is cut off or a
 * wipe leaves an overlap), and one every `step` seconds. At most `cap`: past that the even grid is widened, the scene edges stay.
 */
export function sampleFrames({ totalFrames, frameRate, scenes = [], step = 0.25, cap = 240 }: {
  totalFrames: number; frameRate: number; scenes?: Array<{ start: number; end: number }>; step?: number; cap?: number;
}): number[] {
  const last = totalFrames;
  const clamp = (f: number): number => Math.max(0, Math.min(last, Math.round(f)));
  const edges = new Set<number>([0, last]);
  for (const s of scenes) { edges.add(clamp(s.start * frameRate)); edges.add(clamp(s.end * frameRate - 1)); }
  const room = Math.max(0, cap - edges.size);
  const seconds = totalFrames / frameRate;
  const wanted = Math.floor(seconds / step) + 1;
  const stride = wanted <= room ? step : seconds / Math.max(1, room);
  const frames = new Set(edges);
  for (let t = stride; frames.size < cap && t < seconds; t += stride) frames.add(clamp(t * frameRate));
  return [...frames].sort((a, b) => a - b);
}

const AT_HELP = "use seconds (3.5), a percentage (50%), a frame (f120) or a layer's start / mid / end (name@end)";

/** A list such as `3.5, 50%, f120, title@end` → frames, each with a label for a file name. A mistake says what could not be read. */
export function resolveAtList(list: string, ctx: { frameRate: number; totalFrames: number; duration: number; rows: Row[] }): Array<{ label: string; frame: number }> {
  const { frameRate: fps, totalFrames, duration, rows } = ctx;
  const out: Array<{ label: string; frame: number }> = [], used = new Set<string>();
  // layers by their own names: a family the timeline folds into one row (`pop-# ×4`) gives its members back
  const named = rows.flatMap((r) => (r.parts && r.partNames ? r.partNames.map((name, i) => ({ name, start: r.parts![i]!.start, end: r.parts![i]!.end })) : [r]));
  for (const raw of String(list).split(',').map((s) => s.trim()).filter(Boolean)) {
    let frame: number, label: string, m: RegExpMatchArray | null;
    if ((m = raw.match(/^(.+)@(start|mid|end)$/))) {
      const row = named.find((r) => r.name === m![1]);
      if (!row) throw new Error(`--at "${raw}": no layer named "${m[1]}" (names: ${named.slice(0, 40).map((r) => r.name).join(', ')}${named.length > 40 ? ', …' : ''})`);
      const t = m[2] === 'start' ? row.start : m[2] === 'mid' ? (row.start + row.end) / 2 : row.end - 1 / fps;
      frame = Math.round(t * fps); label = `${m[1]}-${m[2]}`;
    } else if ((m = raw.match(/^(\d+(?:\.\d+)?)%$/))) { frame = Math.round(Number(m[1]) / 100 * totalFrames); label = `${m[1]}pct`; }
    else if ((m = raw.match(/^f(\d+)$/i))) { frame = Number(m[1]); label = `f${m[1]}`; }
    else if (/^\d+(\.\d+)?$/.test(raw)) { frame = Math.round(Number(raw) * fps); label = `${Number(raw).toFixed(2)}s`; }
    else throw new Error(`--at: cannot read "${raw}": ${AT_HELP}`);
    if (frame > totalFrames || frame < 0) throw new Error(`--at "${raw}" is past the end: the movie is ${duration} s (${totalFrames} frames)`);
    label = label.replace(/[\\/:*?"<>|]+/g, '-');                               // a layer called a/b must not make a folder
    let unique = label, n = 2;
    while (used.has(unique)) unique = `${label}-${n++}`;
    used.add(unique);
    out.push({ label: unique, frame });
  }
  return out;
}

/** [{ frame, issues[] }] → one group per kind of issue (numbers do not make a new kind), with count and first / last frame. */
export function groupIssues(perFrame: Array<{ frame: number; issues: string[] }>): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const { frame, issues } of perFrame) {
    for (const message of issues) {
      const key = message.replace(/-?\d+(\.\d+)?/g, '#');
      const g = groups.get(key);
      if (g) { g.count++; g.lastFrame = frame; }
      else groups.set(key, { message, count: 1, firstFrame: frame, lastFrame: frame });
    }
  }
  return [...groups.values()];
}

/**
 * Layout issues → { problems, review }. Cut off by an edge, outside the canvas and "no size" are exact: problems. Text that
 * overlaps text is judged on layout boxes, not ink, so intentional designs trip it (ghost layers, a glow copy under a title,
 * per-letter boxes, a wipe between two scenes: 7 of 30 gallery pieces): those are `review` items to look at on the contact
 * sheet. `strict` makes every issue a problem.
 */
export function splitIssues(groups: IssueGroup[], strict = false): { problems: IssueGroup[]; review: IssueGroup[] } {
  if (strict) return { problems: groups, review: [] };
  const overlap = (g: IssueGroup): boolean => /\boverlap\b/.test(g.message);
  return { problems: groups.filter((g) => !overlap(g)), review: groups.filter(overlap) };
}

/** What `pixi-effects-check` and the Playground tell about a movie that is ready. Warnings come from the page (`window.__logs`), the rest from here. */
export async function reviewMovie(movie: Movie, opts: ReviewOptions = {}): Promise<ReviewReport> {
  const rows = movie.timelineData().rows;
  const at = opts.at ? resolveAtList(opts.at, { frameRate: movie.frameRate, totalFrames: movie.totalFrames, duration: movie.duration, rows }) : [];
  const frames = sampleFrames({ totalFrames: movie.totalFrames, frameRate: movie.frameRate, scenes: namedScenes(rows) });
  const perFrame: Array<{ frame: number; issues: string[] }> = [];
  for (const frame of frames) {
    const r = await movie.inspect(frame, { layers: 'none' });
    if (r.issues.length) perFrame.push({ frame, issues: r.issues });
  }
  const grouped = splitIssues(groupIssues(perFrame), !!opts.strict);
  const fonts = movie.inspectFonts();
  for (const f of fonts.failedUnused) grouped.review.push({ message: `web font "${f}" failed to load, but no text layer uses it (a broken or unused @font-face)`, count: 1, firstFrame: 0, lastFrame: 0 });
  for (const m of fonts.missing) {
    (opts.strict ? grouped.problems : grouped.review).push({ message: `layer "${m.layer}": none of the fonts "${m.family}" is available here (it is drawn in a fallback font)`, count: 1, firstFrame: 0, lastFrame: 0 });
  }
  return { frames: frames.length, problems: grouped.problems, review: grouped.review, fonts, audio: movie.audioBuffer ? movie.inspectAudio() : null, at };
}
