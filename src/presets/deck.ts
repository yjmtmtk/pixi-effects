import type { CompositionSpec, SequenceSpec, TransitionSpec, Keyframe, Props } from '../types';
import type { StopSpec } from '../core/stops';
import { warnUnknownOptions } from '../core/options';

const PAGE_KEYS = ['name', 'duration', 'sequences', 'stops', 'notes', 'advance', 'initial', 'keyframes', 'filters', 'filterArea', 'blendMode', 'mask', 'maskInverted'] as const;
const DECK_KEYS = ['pages', 'transition', 'width', 'height', 'frameRate', 'background', 'canvas', 'assets', 'poster', 'motionBlur', 'loader'] as const;

export interface DeckPage {
  /** The page's name: shown by the Presenter, and in the stops list. */
  name?: string;
  /** How long the page lasts, seconds (including any transition into the next page, see `DeckOptions.transition`). Required. */
  duration: number;
  /** The page's layers, written in the page's own time (`at: 0` is the start of the page). */
  sequences: SequenceSpec[];
  /** Where the page stops, in the page's own time: the first is the page settled, the rest are steps (a bullet appears, a chart grows). Default: where the transition into the next page begins (the end for the last page). */
  stops?: number[];
  /** Speaker notes (kept on the page's first stop). */
  notes?: string;
  /** Move on by itself this many seconds after the page's last stop (kiosk mode). */
  advance?: number;
  /** The page is itself a layer: it may carry `initial`, `keyframes`, `filters`, … (fade or slide the whole page, for instance). */
  initial?: Props;
  keyframes?: Keyframe[];
}

/** A transition spec without the parts `deck()` fills in (which two pages, and when). */
export type DeckTransition = TransitionSpec extends infer T ? (T extends TransitionSpec ? Omit<T, 'from' | 'to' | 'at'> : never) : never;

export interface DeckOptions {
  pages: DeckPage[];
  /**
   * A transition between every two pages: `{ kind: 'crossfade' | 'slide' | 'wipe' | 'iris' | 'dip' | 'zoom' | 'dissolve', duration, …its own options }` (see Transitions). The next page starts
   * `duration` seconds before the current one ends, and the transition plays across the overlap.
   */
  transition?: DeckTransition;
}

/** What `deck()` returns: spread it into `movie.init` (`{ duration, composition: { sequences, transitions?, stops } }` plus any movie option you passed). */
export interface DeckResult {
  duration: number;
  composition: CompositionSpec;
  [movieOption: string]: unknown;
}

/**
 * A deck of pages as one movie. Each page is a nested composition laid out after the one before (so its layers use the page's own
 * time), the stops (where a `Presenter` pauses) come from the pages, and an optional `transition` joins the pages with the existing
 * crossfade / slide / wipe / … transitions.
 *
 * ```js
 * await movie.init({ canvas, width: 1280, height: 720, frameRate: 30, ...deck({
 *   transition: { kind: 'slide', duration: 0.6, direction: 'left' },
 *   pages: [
 *     { name: 'Hello', duration: 5, stops: [1.2], sequences: [ …title, subtitle… ] },
 *     { name: 'Why',   duration: 8, stops: [1.2, 3, 5], sequences: [ …three bullets, at 1.2, 3, 5… ] },
 *   ],
 * }) });
 * movie.on('ready', …); new Presenter(movie, { canvas });
 * ```
 */
export function deck(options: DeckOptions): DeckResult {
  if (!options || !Array.isArray(options.pages) || options.pages.length === 0) throw new Error('deck(): pages must be a list with at least one page: { pages: [{ name, duration, stops, sequences }] }');
  warnUnknownOptions('deck()', options, DECK_KEYS);
  const { pages, transition, ...movieOptions } = options as DeckOptions & Record<string, unknown>;
  pages.forEach((p, i) => {
    if (!p || typeof p !== 'object') throw new Error(`deck(): pages[${i}] must be an object`);
    warnUnknownOptions(`deck() pages[${i}]`, p, PAGE_KEYS);
    if (!(typeof p.duration === 'number' && Number.isFinite(p.duration) && p.duration > 0)) throw new Error(`deck(): pages[${i}].duration must be a positive number of seconds, got ${String(p.duration)}`);
    if (!Array.isArray(p.sequences)) throw new Error(`deck(): pages[${i}].sequences must be a list of layers (it may be empty), got ${typeof p.sequences}`);
  });
  let overlap = 0;
  if (transition) {
    if (!(typeof transition.duration === 'number' && transition.duration > 0)) throw new Error('deck(): transition needs a duration in seconds: { kind: \'crossfade\', duration: 0.6 }');
    const shortest = Math.min(...pages.map(p => p.duration));
    if (pages.length > 1 && transition.duration >= shortest) throw new Error(`deck(): the transition (${transition.duration} s) must be shorter than every page (the shortest is ${shortest} s)`);
    overlap = pages.length > 1 ? transition.duration : 0;
  }

  const sequences: SequenceSpec[] = [];
  const transitions: TransitionSpec[] = [];
  const stops: StopSpec[] = [];
  let start = 0;
  pages.forEach((page, i) => {
    const id = `page-${i + 1}`;
    const label = page.name ? `"${page.name}"` : `pages[${i}]`;
    const isLast = i === pages.length - 1;
    const local = page.stops ?? [isLast ? page.duration : page.duration - overlap];
    local.forEach((s, k) => {
      if (!(typeof s === 'number' && Number.isFinite(s) && s > 0 && s <= page.duration + 1e-9)) throw new Error(`deck(): page ${label} has stop ${String(s)}, outside the page (0 to ${page.duration} s)`);
      if (k > 0 && s <= local[k - 1]!) throw new Error(`deck(): page ${label} stops must be in order, earliest first (got ${local.join(', ')})`);
    });
    const { name: _n, duration: _d, sequences: inner, stops: _s, notes: _no, advance: _a, ...layerProps } = page;
    sequences.push({ type: 'composition', name: id, at: round(start), duration: page.duration, ...layerProps, sequences: inner } as unknown as SequenceSpec);
    local.forEach((s, k) => {
      const stop: StopSpec = { at: round(start + s) };
      if (k === 0) { stop.page = page.name ?? true; if (page.notes !== undefined) stop.notes = page.notes; }
      if (k === local.length - 1 && page.advance !== undefined) stop.advance = page.advance;
      stops.push(stop);
    });
    if (transition && !isLast) {
      const next = start + page.duration - overlap;
      transitions.push({ ...transition, from: id, to: `page-${i + 2}`, at: round(next), duration: transition.duration } as unknown as TransitionSpec);
    }
    start = start + page.duration - (isLast ? 0 : overlap);
  });

  const composition: CompositionSpec = { sequences, stops };
  if (transitions.length > 0) composition.transitions = transitions;
  return { ...movieOptions, duration: round(start), composition };
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;
