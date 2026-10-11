import type { Movie, MotionBlurSpec, Stop, SnapshotOptions } from '../index';
import { warnUnknownOptions } from '../index';
import { pictureStops, changedFraction } from './stops';
import { buildPdf } from './pdf';

/** One picture of a stop (see `stopImages()`). */
export interface StopImage { stop: Stop; /** The page it belongs to (0-based). */ page: number; image: Blob | string }

export interface StopImagesOptions {
  /** One picture per page (default) or one per stop. */
  which?: 'pages' | 'stops';
  /** With `which: 'pages'`: the page's last stop (default: the page fully built) or its first. */
  pick?: 'last' | 'first';
  /** Output size relative to the canvas. Default 1. */
  scale?: number;
  /** `'image/png'` (default) or `'image/jpeg'`. */
  type?: 'image/png' | 'image/jpeg';
  /** JPEG quality, 0–1. */
  quality?: number;
  /** Return `data:` URLs instead of Blobs. */
  as?: 'blob' | 'dataURL';
  /** Motion blur for the pictures (off unless you ask: they are usually for looking at). */
  motionBlur?: MotionBlurSpec;
  /** Pictures for a PDF: stops flagged `pdf: false` are left out (a page whose stops are all flagged has no picture). `exportPDF` sets it. */
  pdf?: boolean;
  /** Called as each picture is ready, in order. */
  onImage?: (image: StopImage) => void;
}

export interface InspectStopsReport {
  stops: Array<{ index: number; page: string | null; at: number; frame: number; moving: number; settled: boolean }>;
  issues: string[];
}

function requireReady(movie: Movie, what: string): void {
  if (!movie.isReady) throw new Error(`pixi-effects: ${what}() needs a ready movie — await movie.init(...) first`);
}

/**
 * A picture of the settled state of each page (default: the page's last stop, fully built) or of every stop, for a page list, an
 * overview, an export. Pauses the movie, and leaves the playhead where it was. `onImage` is called as each picture is ready.
 */
export async function stopImages(movie: Movie, opts: StopImagesOptions & { as: 'dataURL' }): Promise<Array<StopImage & { image: string }>>;
export async function stopImages(movie: Movie, opts?: StopImagesOptions): Promise<StopImage[]>;
export async function stopImages(movie: Movie, opts: StopImagesOptions = {}): Promise<StopImage[]> {
  warnUnknownOptions('stopImages()', opts, ['which', 'pick', 'scale', 'type', 'quality', 'as', 'motionBlur', 'pdf', 'onImage']);
  requireReady(movie, 'stopImages');
  if (movie.stops.length === 0) return [];
  const picks = pictureStops(movie.stops, { which: opts.which, pick: opts.pick, pdf: opts.pdf });
  const shot = { scale: opts.scale ?? 1, type: opts.type ?? 'image/png', quality: opts.quality, as: opts.as ?? 'blob', motionBlur: opts.motionBlur === undefined ? false : opts.motionBlur };
  return movie.peek(async () => {
    const out: StopImage[] = [];
    for (const stop of picks) {
      const image = await movie.snapshot(stop.frame, shot as SnapshotOptions & { as: 'dataURL' });
      const item: StopImage = { stop, page: stop.pageIndex, image };
      out.push(item);
      opts.onImage?.(item);
    }
    return out;
  });
}

/**
 * Look at every stop: is the picture there still changing? A stop is compared with the picture `lookback` frames before it (default 3):
 * when more than `tolerance` (default 0.4 %) of the picture differs, the audience, a page overview and a PDF all see a half-finished
 * animation. `issues` says which stop, which page and what to do; leaves the playhead where it was.
 */
export async function inspectStops(movie: Movie, opts: { lookback?: number; tolerance?: number } = {}): Promise<InspectStopsReport> {
  warnUnknownOptions('inspectStops()', opts, ['lookback', 'tolerance']);
  requireReady(movie, 'inspectStops');
  const out: InspectStopsReport = { stops: [], issues: [] };
  if (movie.stops.length === 0) return out;
  const lookback = Math.max(1, Math.round(opts.lookback ?? 3));
  const tolerance = opts.tolerance ?? 0.004;
  const small = Math.min(1, 320 / Math.max(1, movie.width));                            // pictures about 320 px wide, no blur: they are only compared
  const pixels = async (frame: number): Promise<Uint8ClampedArray> => (await movie.snapshot(frame, { scale: small, motionBlur: false, as: 'imageData' })).data;
  return movie.peek(async () => {
    for (const stop of movie.stops) {
      const before = Math.max(0, stop.frame - lookback);
      let moving = 0;
      if (before < stop.frame) {
        const now = await pixels(stop.frame);
        moving = changedFraction(now, await pixels(before));
      }
      const settled = moving <= tolerance;
      out.stops.push({ index: stop.index, page: stop.page, at: stop.at, frame: stop.frame, moving, settled });
      if (!settled) {
        out.issues.push(`stop ${stop.index + 1}${stop.page ? ` (page "${stop.page}")` : ''} at ${stop.at.toFixed(1)} s: the picture is still changing there (${moving < 0.1 ? (moving * 100).toFixed(1) : Math.round(moving * 100)}% of it changed in the last ${stop.frame - before} frames), so the audience, the page overview and a PDF see it mid-animation. Move the stop to after the animation has finished, or flag a settled stop of the page with \`pdf: true\`.`);
      }
    }
    return out;
  });
}

/**
 * The deck as a PDF: one page per page of the talk (the page's last stop, fully built, unless a stop says `pdf: true` or `pdf: false`;
 * `which: 'stops'` makes a page of every stop that is not `pdf: false`), each a
 * JPEG at the canvas size. Needs `composition.stops`. A transparent background comes out black: give the movie a `background`.
 */
export async function exportPDF(movie: Movie, opts: { which?: 'pages' | 'stops'; pick?: 'last' | 'first'; scale?: number; quality?: number; title?: string; motionBlur?: MotionBlurSpec; onImage?: (image: StopImage) => void } = {}): Promise<Blob> {
  warnUnknownOptions('exportPDF()', opts, ['which', 'pick', 'scale', 'quality', 'title', 'motionBlur', 'onImage']);
  requireReady(movie, 'exportPDF');
  if (movie.stops.length === 0) throw new Error('pixi-effects: exportPDF(): this movie has no stops, so there are no pages; add `stops` to the composition (or build it with deck())');
  const scale = opts.scale ?? 1;
  const images = await stopImages(movie, {
    which: opts.which, pick: opts.pick, scale, type: 'image/jpeg', quality: opts.quality ?? 0.92, as: 'blob', motionBlur: opts.motionBlur, pdf: true, onImage: opts.onImage,
  });
  const pages = await Promise.all(images.map(async i => ({
    jpeg: new Uint8Array(await (i.image as Blob).arrayBuffer()), width: Math.max(1, Math.round(movie.width * scale)), height: Math.max(1, Math.round(movie.height * scale)),
  })));
  return new Blob([buildPdf(pages, { title: opts.title }) as unknown as BlobPart], { type: 'application/pdf' });
}
