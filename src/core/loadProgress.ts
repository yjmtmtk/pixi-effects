/**
 * How far `movie.init()` is: one number from 0 to 1 for a movie that takes seconds to build, the stage it is in and how many of that stage are done.
 * The stages run in a fixed order and carry a share of the whole (the shares come from timings of the reel and the gallery); a stage that is never
 * begun (no assets, no sound) counts as done when a later one starts, and the number never goes down.
 */
export type LoadStage = 'assets' | 'build' | 'sound' | 'frames';

export interface LoadProgressState {
  stage: LoadStage;
  /** Items of this stage that are done, and how many there are (layers, assets, sounds). */
  loaded: number;
  total: number;
  /** The whole init, 0 to 1. */
  progress: number;
}

export const STAGE_LABEL: Record<LoadStage, string> = {
  assets: 'LOADING ASSETS',
  build: 'BUILDING LAYERS',
  sound: 'MIXING SOUND',
  frames: 'PREPARING',
};

const ORDER: LoadStage[] = ['assets', 'build', 'sound', 'frames'];
const WEIGHT: Record<LoadStage, number> = { assets: 0.15, build: 0.6, sound: 0.2, frames: 0.05 };
const YIELD_EVERY_MS = 50;

export interface LoadProgressOptions {
  now?: () => number;
  /** What to await so the page can paint (default: one macrotask). */
  yielder?: () => Promise<void>;
  yieldEveryMs?: number;
  /** True while the page is in a hidden tab (a timer there waits about a second per yield, so none is made). */
  hidden?: () => boolean;
}

/** One macrotask, through a MessageChannel when there is one: it is not slowed like setTimeout in a tab the viewer is not looking at. */
function defaultYielder(): Promise<void> {
  if (typeof MessageChannel === 'undefined') return new Promise<void>(resolve => setTimeout(resolve, 0));
  return new Promise<void>(resolve => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(0);
  });
}

export class LoadProgress {
  private _stage: LoadStage | null = null;
  private _loaded = 0;
  private _total = 0;
  private _high = 0;
  private _started = 0;
  private readonly _ms: Record<LoadStage, number> = { assets: 0, build: 0, sound: 0, frames: 0 };
  private _lastYield: number;
  private readonly _now: () => number;
  private readonly _yielder: () => Promise<void>;
  private readonly _every: number;
  private readonly _hidden: () => boolean;

  constructor(private readonly _onChange: (state: LoadProgressState) => void, opts: LoadProgressOptions = {}) {
    this._now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this._yielder = opts.yielder ?? defaultYielder;
    this._hidden = opts.hidden ?? (() => typeof document !== 'undefined' && document.hidden === true);
    this._every = opts.yieldEveryMs ?? YIELD_EVERY_MS;
    this._lastYield = this._now();
  }

  get progress(): number { return this._high; }

  /** Start a stage with `total` items (0 = nothing to wait for). Every earlier stage is done. */
  begin(stage: LoadStage, total: number): void {
    this._closeTiming();
    this._stage = stage;
    this._loaded = 0;
    this._total = Math.max(0, total);
    this._started = this._now();
    this._emit();
  }

  tick(n = 1): void {
    if (!this._stage) return;
    this._loaded = Math.min(this._total, this._loaded + n);
    this._emit();
  }

  /** Everything is done: 1, whatever stage it was in. */
  finish(): void {
    this._closeTiming();
    this._stage = this._stage ?? 'frames';
    this._loaded = this._total;
    this._high = 1;
    this._onChange({ stage: this._stage, loaded: this._loaded, total: this._total, progress: 1 });
  }

  /** Milliseconds each stage took (a stage never begun is 0). */
  timings(): Record<LoadStage, number> { return { ...this._ms }; }

  /** Await one macrotask when 50 ms of work have gone by since the last time, so the page can paint the bar. Cheap when it is not due. */
  async yieldIfDue(): Promise<void> {
    const t = this._now();
    if (t - this._lastYield < this._every || this._hidden()) return;
    await this._yielder();
    this._lastYield = this._now();
  }

  private _closeTiming(): void {
    if (this._stage) this._ms[this._stage] += Math.max(0, this._now() - this._started);
  }

  private _emit(): void {
    const stage = this._stage!;
    let done = 0;
    for (const s of ORDER) { if (s === stage) break; done += WEIGHT[s]; }
    const within = this._total > 0 ? this._loaded / this._total : 1;
    this._high = Math.min(1, Math.max(this._high, done + WEIGHT[stage] * within));
    this._onChange({ stage, loaded: this._loaded, total: this._total, progress: this._high });
  }
}
