import { warnUnknownOptions } from './options';

/** What an author writes in `composition.stops`: a time in seconds, or an object. */
export interface StopSpec {
  /** Where playback stops, in seconds (negative counts back from the end). */
  at: number;
  /** This stop is the settled state of a new page. A name (shown in the page list), or `true` for an unnamed page. Without it the stop is a step of the page before. */
  page?: string | true;
  /** Speaker notes for this stop. */
  notes?: string;
  /** Move on by itself after this many seconds (a kiosk, a looping demo). */
  advance?: number;
  /**
   * Which picture stands for a page in a PDF (and in the page overview). `true`: this stop's picture IS the page's picture (use it when the
   * last stop is mid-exit or a step you do not want on paper). `false`: never use this stop's picture for the PDF. Default: the page's last stop.
   */
  pdf?: boolean;
}

/** A stop, normalised: its frame, and which page it belongs to. */
export interface Stop {
  index: number;
  at: number;
  frame: number;
  /** The name of the page this stop belongs to (null if it has none). */
  page: string | null;
  /** Which page (0-based) this stop belongs to. */
  pageIndex: number;
  /** True for the stop that begins its page. */
  pageStart: boolean;
  notes?: string;
  advance?: number;
  pdf?: boolean;
}

const KEYS = ['at', 'page', 'notes', 'advance', 'pdf'] as const;

/**
 * The stops of a composition, checked and in order. Numbers are stops; with no `page` anywhere every stop is a page of its
 * own, otherwise only the stops that say `page` start one (the first stop always does). Negative times count back from the end;
 * two stops on the same frame are one; anything outside the movie or not a number is dropped, with a warning that names it.
 */
export function normalizeStops(raw: ReadonlyArray<number | StopSpec> | undefined, duration: number, frameRate: number): Stop[] {
  if (!raw || raw.length === 0) return [];
  const total = Math.round(duration * frameRate);
  const specs: StopSpec[] = [];
  raw.forEach((r, i) => {
    const spec: StopSpec | null = typeof r === 'number' ? { at: r } : (r && typeof r === 'object' ? r : null);
    if (!spec || typeof spec.at !== 'number' || !Number.isFinite(spec.at)) {
      console.warn(`pixi-effects: stops[${i}] ${JSON.stringify(r)} is not a time in seconds (or { at, page?, notes?, advance?, pdf? }); ignored`);
      return;
    }
    if (typeof r === 'object') warnUnknownOptions(`stops[${i}]`, r, KEYS);
    const at = spec.at < 0 ? duration + spec.at : spec.at;
    if (at < -1e-9 || at > duration + 1e-9) {
      console.warn(`pixi-effects: stops[${i}] at ${spec.at} s is outside the movie (0 to ${duration} s); ignored`);
      return;
    }
    specs.push({ ...spec, at });
  });
  specs.sort((a, b) => a.at - b.at);

  const kept: StopSpec[] = [];
  for (const s of specs) {
    const frame = Math.min(total, Math.max(0, Math.round(s.at * frameRate)));
    const last = kept[kept.length - 1];
    if (last && Math.min(total, Math.max(0, Math.round(last.at * frameRate))) === frame) {
      console.warn(`pixi-effects: two stops are on the same frame (${frame}, about ${s.at.toFixed(2)} s); one is kept`);
      continue;
    }
    kept.push(s);
  }

  const anyPage = kept.some(s => s.page !== undefined);
  let pageIndex = -1, pageName: string | null = null;
  return kept.map((s, index) => {
    const pageStart = index === 0 || (anyPage ? s.page !== undefined : true);
    if (pageStart) { pageIndex++; pageName = typeof s.page === 'string' ? s.page : null; }
    const stop: Stop = { index, at: s.at, frame: Math.min(total, Math.max(0, Math.round(s.at * frameRate))), page: pageName, pageIndex, pageStart };
    if (typeof s.notes === 'string') stop.notes = s.notes;
    if (s.advance !== undefined) {
      if (typeof s.advance === 'number' && Number.isFinite(s.advance) && s.advance >= 0) stop.advance = s.advance;
      else console.warn(`pixi-effects: stops[${index}] advance must be a number of seconds >= 0, got ${JSON.stringify(s.advance)}; ignored`);
    }
    if (s.pdf !== undefined) {
      if (typeof s.pdf === 'boolean') stop.pdf = s.pdf;
      else console.warn(`pixi-effects: stops[${index}] pdf must be true or false, got ${JSON.stringify(s.pdf)}; ignored`);
    }
    return stop;
  });
}
