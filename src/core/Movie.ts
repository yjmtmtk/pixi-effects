import { usesAdvancedBlend, enableAdvancedBlend } from './blend';
import { Application, Container, Culler, Rectangle, extensions, CullerPlugin } from 'pixi.js';
import { createTimeline, lengthen, type Timeline } from './timelineEngine';
import { loadAssetBundle } from './AssetLoader';
import { CompositionSequence } from '../sequences/Composition';
import { mixdown, limitMix, type MixStats } from './AudioMixer';
import { analyzeAudio, type AudioReport, type AudioInspectOptions } from './inspectAudio';
import { inspectFonts, type FontReport } from './inspectFonts';
import { namedScenes } from './scenes';
import { collectTimeFilters, type TimeFilter } from './timeFilters';
import { resolveAtList, reviewMovie, type ReviewOptions, type ReviewReport } from './review';
import { onionAlphas, onionTimes } from './onion';
import { exportFrames } from './Renderer';
import { expandTransitions, carryTransitionWindows } from './Transitions';
import { inspectScene, type InspectReport, type InspectOptions } from './inspect';
import { collectTimeline, timelineHtml, timelineSvg, type TimelineData, type TimelineHtmlOptions, type TimelineSvgOptions } from './timelineChart';
import { pickFrames, sheetLayout } from './frames';
import { warnUnknownOptions, suggestName } from './options';
import { normalizeVars, applyVars, numericVars, lintVars, type Vars } from './vars';
import { mixKey, MixCache } from './mixCache';
import { startWhenRunning, audioIsBlocked } from './startWhenRunning';
import { normalizePoster } from './poster';
import { normalizeStops, type Stop } from './stops';
import { maskSourceOf } from './matte';
import { resolveLoader, dismissLoader, failLoader, setLoaderProgress, type LoaderOption } from './loader';
import { LoadProgress, type LoadProgressState, type LoadStage } from './loadProgress';
import { resolveMotionBlur, blurTimes, type MotionBlurSpec, type MotionBlurOptions, type ResolvedMotionBlur } from './motionBlur';
import { ensureFilterLibrary } from '../filters/named';
import type { Sequence } from '../sequences/Base';
import type {
  AssetSpec, CompositionSpec, CompositionShape, AudioDescriptor,
} from '../types';

extensions.add(CullerPlugin);

export interface MovieOptions {
  width?: number;
  height?: number;
  duration?: number;
  frameRate?: number;
  background?: string;
  canvas?: HTMLCanvasElement;
  assets?: AssetSpec[];
  composition?: CompositionSpec;
  /**
   * Named variables: numbers an expression reads as identifiers (`x: 'W/2 + shift'`) and strings that `{name}` stands for anywhere in the
   * composition (`text: '{title}'`, `fillColor: '{accent}'`). Change them later with `movie.setVars()`, which rebuilds the movie at the same time.
   * A name an expression already means (`W`, `t`, `sin`, `PI`, `value` …) is refused.
   */
  vars?: Vars;
  /**
   * The poster time in seconds: the moment that stands for the movie before it plays. The canvas shows that frame once the movie is
   * ready, the playhead stays at 0 and play starts from 0 (like `<video poster>`); `movie.posterImage()` is that picture. A negative
   * value counts back from the end. Default: none (the first frame).
   */
  poster?: number;
  /**
   * Motion blur for everything that is *made* (not for live playback): `render()`, `snapshot()` and `contactSheet()` expose each frame
   * over a shutter interval and average `samples` renders of it, so fast motion smears like on film. `true` is 8 samples at a 180° shutter,
   * a number is the sample count, `{ samples, shutter }` sets both. Default: off. Each of those calls can override it (`false` turns it off).
   */
  motionBlur?: MotionBlurSpec;
  /**
   * The page's loader (see `pixi-effects/loader.css`): an element, a selector, or `false` for none. By default a `.pe-loader` next to
   * the canvas is used. It is faded out once the movie is ready (the poster is on the canvas) and, if `init()` fails, it stops and says so.
   */
  loader?: LoaderOption;
  /** Start with `movie.loop` on: playing goes back to the start at the end instead of stopping. Default false (like a `<video>`). */
  loop?: boolean;
}

export type { MotionBlurSpec, MotionBlurOptions };

export interface RenderOptions {
  /** Motion blur for this export (see `MovieOptions.motionBlur`); overrides the movie's own setting, `false` turns it off. */
  motionBlur?: MotionBlurSpec;
  /** `mp4`, `mov`, `webm`, `mkv`: the picture with its sound. `wav`, `ogg`: only the sound of the movie (an error when it has none). */
  format?: 'mp4' | 'mov' | 'webm' | 'mkv' | 'wav' | 'ogg';
  video?: {
    /** `'avc'` (H.264), `'hevc'`, `'vp9'`, `'av1'`, `'vp8'`: default the usual one for the format, the next that works if this browser cannot encode it; a name you give is never swapped. */
    codec?: string;
    /** A quality name, or bits a second: `8_000_000` or `'8M'`, `'800k'`. */
    bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | number | string;
    /** Where to encode: `'prefer-hardware'`, `'prefer-software'` or `'no-preference'` (default). */
    hardware?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
    /** Seconds between keyframes (default 2): shorter seeks faster and makes a bigger file. */
    keyFrameInterval?: number;
  };
  audio?: { codec?: string; bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | number | string };
  /**
   * Only part of the movie: `[from, to]` in seconds, or the name of a top-level layer (its start to its end). The file starts at 0
   * and its sound is cut the same way (with a 10 ms fade on a cut edge). Past the end, backwards or an unknown name is an error.
   */
  range?: [number, number] | string;
  /** Output size relative to the canvas, above 0 and at most 1. Each frame is drawn at full size and copied smaller before it is encoded: the file and the encoding get smaller, the drawing is not faster. */
  scale?: number;
  /** For looking, not for delivering: `scale: 0.5`, `video.bitrate: 'low'` and no motion blur. Anything you set yourself wins. */
  draft?: boolean;
}

export interface SnapshotOptions {
  /** Motion blur for this picture (see `MovieOptions.motionBlur`); overrides the movie's own setting, `false` turns it off. */
  motionBlur?: MotionBlurSpec;
  /** Output size relative to the canvas (default 1). */
  scale?: number;
  /** `'image/png'` (default) or `'image/jpeg'`. */
  type?: 'image/png' | 'image/jpeg';
  /** JPEG quality, 0 to 1 (the encoder's default when left out). */
  quality?: number;
  /** Return a `data:` URL string instead of a Blob (handy for scripts that can only return text), or `'imageData'`: the pixels as an `ImageData` (to measure, compare). */
  as?: 'blob' | 'dataURL' | 'imageData';
}

/** What `movie.rebuild()` may change: the composition itself, variables (a partial set), the size of the movie. */
export interface RebuildOptions {
  composition?: CompositionSpec;
  vars?: Vars;
  width?: number;
  height?: number;
}
export type RebuildReason = 'vars' | 'resize' | 'rebuild';
/** What a rebuild did: how long it took, whether the sound was mixed again (`'mixed'`), reused from the last mix (`'reused'`) or there is none, and where the playhead was put back. */
export interface RebuildReport {
  reason: RebuildReason;
  ms: number;
  audio: 'reused' | 'mixed' | 'none';
  frame: number;
  playing: boolean;
  /** True when nothing changed (`setVars` with the values it already has): nothing was rebuilt. */
  unchanged?: boolean;
}

export interface ContactSheetOptions {
  /** Motion blur for these pictures (see `MovieOptions.motionBlur`); overrides the movie's own setting, `false` turns it off. */
  motionBlur?: MotionBlurSpec;
  /** Frames to show. Default: `count` frames spread evenly over the movie. */
  frames?: number[];
  /** Times in seconds to show (used when `frames` is not given). */
  times?: number[];
  /** How many frames when neither `frames` nor `times` is given. Default 6. */
  count?: number;
  /** Columns in the grid. Default 3. */
  columns?: number;
  /** Width of each picture in pixels. Default 480. */
  cellWidth?: number;
  as?: 'blob' | 'dataURL';
}

export interface OnionSkinOptions {
  /** Where the movement starts, in seconds. Default 0. */
  from?: number;
  /** Where it ends, in seconds. Default: the end of the movie. */
  to?: number;
  /** How many frames are overlaid, 1–64, spread evenly from `from` to `to`. Default 8. */
  count?: number;
  /** Output size relative to the canvas, above 0 and at most 4. Default 1. */
  scale?: number;
  /** Motion blur for these pictures (see `MovieOptions.motionBlur`); overrides the movie's own setting, `false` turns it off. */
  motionBlur?: MotionBlurSpec;
  as?: 'blob' | 'dataURL';
}

export interface FrameEvent { frame: number; totalFrames: number }
export interface ProgressEvent { progress: number; frame: number; totalFrames: number }
/** `volumechange`: the values after the change. */
export interface VolumeEvent { volume: number; muted: boolean }
/** `loopchange`: the value of `movie.loop` after the change. */
export interface LoopEvent { loop: boolean }
/** `error`: something failed in `init()`, `render()` or during playback. The call that failed still rejects / warns as before. */
export interface MovieErrorEvent { where: 'init' | 'render' | 'playback' | 'rebuild'; message: string; error: unknown }

type Listener = (...args: any[]) => void;

export class Movie {
  private _events: Record<string, Listener[]> = {};
  private _initState: 'idle' | 'pending' | 'ready' | 'destroyed' = 'idle';
  app: Application | null = null;
  timeline: Timeline | null = null;
  audioBuffer: AudioBuffer | null = null;
  /** @internal */
  audioSource: AudioBufferSourceNode | null = null;
  /** @internal */
  gainNode: GainNode | null = null;
  private _cancelAudioStart: (() => void) | null = null;
  /** The poster time in seconds (`movie.init({ poster })`), or null. */
  poster: number | null = null;
  /** The stops of the composition (`composition.stops`), checked and in order: named times for a presentation to pause on (`pixi-effects/present`). Empty for an ordinary movie. */
  stops: Stop[] = [];
  /** The frame `playUntil()` is playing toward, or null (also null while it plays to the end). */
  private _until: number | null = null;
  private _untilWaiters: Array<(landed: boolean) => void> = [];
  /** The motion blur `render()`, `snapshot()` and `contactSheet()` apply unless told otherwise (`movie.init({ motionBlur })`), or null. */
  motionBlur: ResolvedMotionBlur | null = null;
  private _posterFrame: number | null = null;
  /** The canvas shows the poster picture while the playhead is still at frame 0 (like `<video poster>`): the first seek or play replaces it. */
  private _atPoster = false;
  /** > 0 while the movie moves its own playhead (playback, render, snapshot, contactSheet): those are not the seeks `seeking` / `seeked` report. */
  private _quiet = 0;
  private _volume = 1;
  private _muted = false;
  private _loop = false;
  isPlaying = false;
  currentFrame = 0;
  totalFrames = 0;
  width = 0;
  height = 0;
  duration = 0;
  frameRate = 30;
  background = '#000000';
  private _audioContext: AudioContext | null = null;
  private _rootSequence: Sequence | null = null;
  /** The filters that take the time of the frame they draw (`grain`), collected once after the build. */
  private _timeFilters: TimeFilter[] = [];
  /** While a motion-blurred frame is exposed: the frame's own time, so all its sub-frames share one grain frame (and not the playhead's). */
  private _nominalTime: number | null = null;
  private _feedTimeFilters(): void {
    if (!this._timeFilters.length) return;
    const t = this._nominalTime ?? this._timeOf(this.currentFrame);
    for (const f of this._timeFilters) f.setTime(t);
  }
  private _rootContainer: Container | null = null;
  private _raf: number | null = null;
  /** The variables now, and the names that were declared (a `setVars` of any other name is refused). */
  private _vars: Vars = {};
  private _declared = new Set<string>();
  /** The composition as the author wrote it (before `{name}` is replaced): a rebuild starts from it. */
  private _composition: CompositionSpec | undefined;
  /** True once `resize()` was called: the size of the movie then replaces an explicit `width` / `height` of the composition. */
  private _resized = false;
  private _mixCache = new MixCache<MixStats | null>();
  private _rebuildRun: Promise<RebuildReport> | null = null;
  private _rebuildNext: { change: RebuildOptions; reason: RebuildReason; promise: Promise<RebuildReport>; resolve: (r: RebuildReport) => void; reject: (e: unknown) => void } | null = null;
  /** > 0 while a rebuild stops and restarts playback: `play` / `pause` are not announced then (a player's button must not flicker). */
  private _silent = 0;
  /** render() / peek() in flight: a rebuild does not swap the composition under them. */
  private _busy = 0;
  private _idleWaiters: Array<() => void> = [];
  /** What went into the mix, and its peak before limiting — kept for inspectAudio(). */
  private _audioSources: AudioDescriptor[] = [];
  private _mixStats: MixStats | null = null;

  on(event: 'ready', fn: () => void): this;
  on(event: 'frame', fn: (e: FrameEvent) => void): this;
  /** A jump to another frame (`gotoFrame`, a seek bar) starts / finishes. Not emitted for playback ticks, `render()`, `snapshot()` or `contactSheet()`. */
  on(event: 'seeking' | 'seeked', fn: (e: FrameEvent) => void): this;
  /** Playback ran off the end (after `pause`). Pausing by hand does not emit it. */
  on(event: 'ended', fn: () => void): this;
  on(event: 'volumechange', fn: (e: VolumeEvent) => void): this;
  /** `movie.loop` changed (set by the page, the bar's loop button or `init({ loop })` is not a change). */
  on(event: 'loopchange', fn: (e: LoopEvent) => void): this;
  on(event: 'error', fn: (e: MovieErrorEvent) => void): this;
  on(event: 'progress', fn: (e: ProgressEvent) => void): this;
  /** How far `init()` is while it builds the movie: `{ stage: 'assets' | 'build' | 'sound' | 'frames', loaded, total, progress }`, `progress` 0 to 1. The page's `.pe-loader` shows it by itself. */
  on(event: 'loadprogress', fn: (e: LoadProgressState) => void): this;
  /** A `rebuild()` (a `setVars()` or a `resize()` too) finished: what it was and what it cost. */
  on(event: 'rebuilt', fn: (e: RebuildReport) => void): this;
  on(event: 'play', fn: () => void): this;
  on(event: 'pause', fn: () => void): this;
  on(event: string, fn: Listener): this {
    (this._events[event] ??= []).push(fn);
    if (event === 'ready' && this._initState === 'ready') {
      try { fn(); } catch (e) { console.warn('pixi-effects: ready listener threw:', e); }
    }
    return this;
  }
  off(event: string, fn: Listener): this {
    const list = this._events[event];
    if (!list) return this;
    const i = list.indexOf(fn);
    if (i > -1) list.splice(i, 1);
    return this;
  }
  /** @internal */
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this._events[event] ?? []) fn(...args);
  }

  get isReady(): boolean { return this._initState === 'ready'; }

  /** Milliseconds `init()` spent in each stage (assets, build, sound, frames), or null before it has finished: `check` says which stage is the slow one. */
  get loadStages(): Record<LoadStage, number> | null { return this._loadStages; }
  private _loadStages: Record<LoadStage, number> | null = null;

  /** True while the movie has sound but the browser keeps it silent until the viewer taps (iOS Safari, a page nobody has touched): a player can show "tap for sound"; the sound starts at a tap or key press that arrives while play() is pending, or at the next play() made from a tap. */
  get audioBlocked(): boolean { return audioIsBlocked(this._audioContext, !!this.audioBuffer); }

  /** The poster time as a frame number, or null. */
  get posterFrame(): number | null { return this._posterFrame; }

  /** Draw the poster frame on the canvas and leave the playhead where it is (frame 0): the picture before the movie plays. */
  private async _showPoster(): Promise<void> {
    if (this._posterFrame === null || !this.timeline) return;
    const back = this.currentFrame;
    this.currentFrame = this._posterFrame;                 // the drawing steps read the playhead
    try {
      this.timeline.time(this._timeOf(this._posterFrame));
      await this._awaitVideoFrames();
      this._updateSpace();
      this._renderNow();
    } finally {
      this.currentFrame = back;
    }
    this._atPoster = true;
  }

  /**
   * The picture at the poster time (frame 0 if the movie has none), as `snapshot()` returns it, and the movie is left as it was:
   * still showing the poster, or back at the frame it was at.
   */
  async posterImage(opts?: SnapshotOptions & { as?: 'blob' }): Promise<Blob>;
  async posterImage(opts: SnapshotOptions & { as: 'dataURL' }): Promise<string>;
  async posterImage(opts: SnapshotOptions = {}): Promise<Blob | string> {
    this._requireReady('posterImage');
    const back = this.currentFrame, wasAtPoster = this._atPoster;
    try {
      return await (this.snapshot as (f: number, o: SnapshotOptions) => Promise<Blob | string>)(this._posterFrame ?? 0, opts);
    } finally {
      this.currentFrame = back;                      // snapshot() moved the playhead to the poster: put it back before restoring the display
      if (wasAtPoster) await this._showPoster();
      else await this._quietly(() => this.gotoFrame(back, true));
    }
  }

  private _ensureAudioContext(): AudioContext {
    if (!this._audioContext) {
      const Ctx = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this._audioContext = new Ctx();
    }
    return this._audioContext;
  }

  async init(options: MovieOptions = {}): Promise<void> {
    warnUnknownOptions('movie.init()', options, ['width', 'height', 'duration', 'frameRate', 'background', 'canvas', 'assets', 'composition', 'vars', 'poster', 'motionBlur', 'loader', 'loop']);
    this._initState = 'pending';
    try {
      this.width = options.width ?? 1920;
      this.height = options.height ?? 1080;
      this.duration = options.duration ?? 10;
      this.frameRate = options.frameRate ?? 30;
      this.totalFrames = Math.round(this.duration * this.frameRate);
      const poster = normalizePoster(options.poster, this.duration, this.frameRate);
      this.poster = poster.seconds;
      this.motionBlur = resolveMotionBlur(options.motionBlur, 'movie.init()');
      this._loop = options.loop === true;
      this._vars = normalizeVars(options.vars, 'movie.init()');
      this._declared = new Set(Object.keys(this._vars));
      this._composition = options.composition;
      this._resized = false;
      for (const w of lintVars(options.composition, this._vars)) console.warn(w);
      this._mixCache.set(null, null);
      this.stops = normalizeStops(applyVars(options.composition, this._vars)?.stops, this.duration, this.frameRate);
      this._posterFrame = poster.frame;
      this.background = options.background ?? '#000000';

      this.timeline = createTimeline({ paused: true, defaults: { ease: 'none' } });
      lengthen(this.timeline, this.duration);

      // Try WebGPU first, fall back to WebGL on any init failure. PIXI's
      // autoDetectRenderer only checks `navigator.gpu` existence — it doesn't
      // catch device-init failures (old drivers, GPU lost, hostile origin
      // policies). We wrap and retry so those cases don't break playback.
      const baseAppOptions = {
        width: this.width,
        height: this.height,
        background: this.background,
        antialias: true,
        resolution: 1,
        autoDensity: false,
        preserveDrawingBuffer: true,
        canvas: options.canvas,
      };
      this.app = new Application();
      try {
        await this.app.init({ ...baseAppOptions, preference: 'webgpu' });
      } catch (err) {
        console.warn('pixi-effects: WebGPU init failed, falling back to WebGL —', err);
        // PIXI's Application.init can't be called twice on the same instance,
        // so create a fresh one for the fallback path.
        this.app = new Application();
        await this.app.init({ ...baseAppOptions, preference: 'webgl' });
      }

      const root = new Container();
      root.cullable = true;
      root.cullableChildren = true;
      root.cullArea = new Rectangle(0, 0, this.width, this.height);
      this.app.stage.addChild(root);
      this._rootContainer = root;

      const audioContext = this._ensureAudioContext();
      let loaderEl: HTMLElement | null | undefined;
      const lp = new LoadProgress(state => {
        if (loaderEl === undefined) loaderEl = resolveLoader(options.loader, options.canvas ?? (this.app?.canvas as HTMLCanvasElement | undefined) ?? null);
        setLoaderProgress(loaderEl, state);       // the loader first, so a listener sees what the viewer sees
        this.emit('loadprogress', state);
      }, { yieldEveryMs: (globalThis as { __peLoadYieldMs?: number }).__peLoadYieldMs });   // __peLoadYieldMs: a hook for the test that yielding changes nothing
      const assetCount = (options.assets ?? []).length;
      lp.begin('assets', assetCount);
      let assetsSeen = 0;
      await loadAssetBundle(options.assets ?? [], audioContext, p => { const n = Math.round(p * assetCount); if (n > assetsSeen) { lp.tick(n - assetsSeen); assetsSeen = n; } });

      const composition = await this._construct(this._composition, this._vars, this.width, this.height, lp);
      this._rootSequence = composition;
      if (composition.target) root.addChild(composition.target);
      composition.bindTimeline(this.timeline);
      this._timeFilters = collectTimeFilters(composition);

      lp.begin('sound', 1);                                    // one whole: `mixdown` says how far it is
      await this._mixSound(composition, audioContext, lp);

      lp.begin('frames', 0);
      this.timeline.time(this._timeOf(0));                     // the first picture is the movie at its start: a `set` at 0 is already applied
      await this._awaitVideoFrames();
      this._updateSpace();
      this._renderNow();

      lp.finish();
      this._loadStages = lp.timings();
      this._initState = 'ready';
      if (this._posterFrame !== null) await this._showPoster();     // the canvas shows the poster until the first seek or play
      this.emit('ready');
      dismissLoader(resolveLoader(options.loader, options.canvas ?? (this.app?.canvas as HTMLCanvasElement | undefined) ?? null));
    } catch (err) {
      failLoader(resolveLoader(options.loader, options.canvas ?? null), 'COULD NOT LOAD');
      try { await this.destroy(); } catch (cleanupErr) {
        console.warn('pixi-effects: cleanup after init failure also threw:', cleanupErr);
      }
      this._emitError('init', err);
      throw err;
    }
  }

  /**
   * Build the composition tree for these variables and this size, off stage: `{name}` replaced, the root shape (with the numeric variables for the
   * expressions), transitions expanded, every layer built. Used by `init` and by `rebuild`.
   */
  private async _construct(composition: CompositionSpec | undefined, vars: Vars, width: number, height: number, lp?: LoadProgress, sizeWins = this._resized): Promise<CompositionSequence> {
    const spec = applyVars(composition, vars);
    const rootShape: CompositionShape = {
      width, height, duration: this.duration, frameRate: this.frameRate, vars: numericVars(vars),
      ...(lp ? { onLayerBuilt: async () => { lp.tick(); await lp.yieldIfDue(); } } : {}),
    };
    // Inject root dimensions before expanding transitions: the macro
    // expander reads `width` / `height` to compute filter areas, so the
    // values must be present on the spec it sees rather than being merged
    // in below as overrides. (After `resize()` the movie's size wins over a size the composition names.)
    const seededComposition = spec
      ? {
          ...spec,
          width: sizeWins ? width : (spec.width ?? width),
          height: sizeWins ? height : (spec.height ?? height),
          duration: spec.duration ?? this.duration,
        }
      : undefined;
    await ensureFilterLibrary(seededComposition);            // pixi-filters, only when a layer names one of its filters
    if (usesAdvancedBlend(seededComposition)) await enableAdvancedBlend(this.app!.renderer);   // (on the spec after {name} is replaced: a variable may name the mode)
    const userComposition = seededComposition ? expandTransitions(seededComposition) : undefined;
    const rootSeqSpec = {
      type: 'composition' as const,
      width,
      height,
      duration: this.duration,
      ...userComposition,
    };
    if (userComposition) carryTransitionWindows(userComposition, rootSeqSpec);
    const sequence = new CompositionSequence(rootSeqSpec, null, rootShape);
    lp?.begin('build', countLayers(rootSeqSpec));
    try { await sequence.build(); }
    catch (err) { safeRun(() => sequence.destroy()); throw err; }
    return sequence;
  }

  /** Make the sound of a built composition: the same mix as last time when the sounds are the same (`'reused'`), else mix it. */
  private async _mixSound(sequence: CompositionSequence, audioContext: AudioContext, lp?: LoadProgress): Promise<'reused' | 'mixed' | 'none'> {
    const audios: AudioDescriptor[] = [];
    sequence.collectAudio(audios, 0);
    let status: 'reused' | 'mixed' | 'none' = 'none';
    if (audios.length === 0) {
      this.audioBuffer = null; this._mixStats = null; this._mixCache.set(null, null);
    } else {
      const key = mixKey(audios, this.duration, audioContext.sampleRate);
      const hit = this._mixCache.get(key);
      if (hit) { this.audioBuffer = hit.buffer; this._mixStats = hit.extra; status = 'reused'; }
      else {
        this.audioBuffer = await mixdown(audios, this.duration, audioContext.sampleRate, lp ? async (done) => { lp.part(done); await lp.yieldIfDue(); } : undefined);
        this._mixStats = this.audioBuffer ? limitMix(this.audioBuffer, audios) : null;
        this._mixCache.set(key, this.audioBuffer, this._mixStats);
        status = 'mixed';
      }
      lp?.tick();
    }
    this._audioSources = audios;
    return status;
  }

  /** The variables now (a copy; change them with `setVars()`). */
  get vars(): Readonly<Vars> { return { ...this._vars }; }

  /**
   * Change variables and rebuild at the same time. Only the declared names (`movie.init({ vars })`) are accepted; another name says which one it
   * looks like and is ignored. Values it already has change nothing: no rebuild (`unchanged: true`).
   */
  async setVars(changes: Vars): Promise<RebuildReport> {
    this._requireReady('setVars');
    return this.rebuild({ vars: changes }, 'vars');
  }

  /** Make the movie `width` x `height` pixels (the canvas, and `W` / `H` / `GW` / `GH` in every expression) and rebuild at the same time. */
  async resize(width: number, height: number): Promise<RebuildReport> {
    this._requireReady('resize');
    return this.rebuild({ width, height }, 'resize');
  }

  /**
   * Build the composition again, with what `change` replaces (variables, the composition, the size), and put the movie back where it was: the
   * same frame, playing or not, the poster if that was shown. The new composition is built first: when that fails the old one stays, `error` is
   * emitted and the promise rejects. The sound is mixed again only when it changed (`audio: 'reused'` otherwise). Calls that arrive while a
   * rebuild runs are joined into one more rebuild (the latest values win), so a slider can call it on every move.
   */
  async rebuild(change: RebuildOptions = {}, reason: RebuildReason = 'rebuild'): Promise<RebuildReport> {
    this._requireReady('rebuild');
    warnUnknownOptions('movie.rebuild()', change, ['composition', 'vars', 'width', 'height']);
    if (this._rebuildRun) {
      if (!this._rebuildNext) {
        let resolve!: (r: RebuildReport) => void, reject!: (e: unknown) => void;
        const promise = new Promise<RebuildReport>((res, rej) => { resolve = res; reject = rej; });
        this._rebuildNext = { change: {}, reason, promise, resolve, reject };
      }
      const next = this._rebuildNext;
      next.change = { ...next.change, ...change, vars: { ...(next.change.vars ?? {}), ...(change.vars ?? {}) } };
      if (reason !== 'vars') next.reason = reason;
      return next.promise;
    }
    return this._runRebuild(change, reason);
  }

  private _runRebuild(change: RebuildOptions, reason: RebuildReason): Promise<RebuildReport> {
    const run = this._doRebuild(change, reason);
    this._rebuildRun = run;
    const settled = () => {
      if (this._rebuildRun === run) this._rebuildRun = null;
      const next = this._rebuildNext;
      if (next && this._initState === 'ready') { this._rebuildNext = null; this._runRebuild(next.change, next.reason).then(next.resolve, next.reject); }
      else if (next) { this._rebuildNext = null; next.reject(new Error('pixi-effects: the movie was destroyed before the rebuild could run')); }
    };
    run.then(settled, settled);
    return run;
  }

  private async _doRebuild(change: RebuildOptions, reason: RebuildReason): Promise<RebuildReport> {
    const started = performance.now();
    const root = this._rootContainer, app = this.app;
    if (!root || !app) throw new Error('pixi-effects: movie.rebuild() needs a ready movie — await movie.init(...) first');
    const who = `movie.${reason === 'vars' ? 'setVars' : 'rebuild'}()`;
    let sequence: CompositionSequence | null = null;
    const alive = () => { if (this._initState !== 'ready') throw new Error('pixi-effects: the movie was destroyed while it was being rebuilt'); };
    try {
      // what changes
      const vars: Vars = { ...this._vars };
      let changed = false;
      if (change.vars !== undefined) {
        const given = normalizeVars(change.vars, who);
        for (const [name, value] of Object.entries(given)) {
          if (!this._declared.has(name)) {
            const guess = suggestName(name, [...this._declared]);
            console.warn(`pixi-effects: ${who}: "${name}" is not a declared variable${guess ? ` — did you mean "${guess}"?` : ''} (declared in movie.init({ vars }): ${[...this._declared].join(', ') || 'none'}); ignored`);
            continue;
          }
          if (vars[name] !== value) { vars[name] = value; changed = true; }
        }
      }
      for (const [k, v] of [['width', change.width], ['height', change.height]] as const) {
        if (v !== undefined && !(Number.isFinite(v) && v >= 1)) throw new Error(`pixi-effects: movie.rebuild(): ${k} must be a number of pixels (1 or more), got ${JSON.stringify(v)}`);
      }
      const width = change.width ?? this.width, height = change.height ?? this.height;
      const sizeChanged = width !== this.width || height !== this.height;
      const composition = change.composition ?? this._composition;
      if (change.composition !== undefined) for (const w of lintVars(change.composition, vars)) console.warn(w);
      changed = changed || sizeChanged || change.composition !== undefined || reason === 'rebuild';
      if (!changed) return { reason, ms: 0, audio: 'none', frame: this.currentFrame, playing: this.isPlaying, unchanged: true };

      // build the new composition and its sound off the stage, while the old one goes on (playing, seekable): the size and the swap come last
      sequence = await this._construct(composition, vars, width, height, undefined, this._resized || sizeChanged);
      alive();
      const timeline = createTimeline({ paused: true, defaults: { ease: 'none' } });
      lengthen(timeline, this.duration);
      sequence.bindTimeline(timeline);
      const hadSound = this.audioBuffer !== null;
      const audio = await this._mixSound(sequence, this._ensureAudioContext());
      const soundChanged = audio === 'mixed' || (audio === 'none' && hadSound);
      while (this._busy > 0) { await new Promise<void>(r => this._idleWaiters.push(r)); }       // not under a render() / peek()
      alive();

      // the swap, in one go: what the movie is doing NOW (the user may have paused, sought or played meanwhile) is what it keeps doing
      const wasPlaying = this.isPlaying, frame = this.currentFrame, wasAtPoster = this._atPoster;
      const oldSize = { w: this.width, h: this.height }, oldResized = this._resized;
      // a playing movie whose sound stays the same is not stopped at all: the frame clock and the sound go on, only the picture's tree is swapped
      const goOn = wasPlaying && !soundChanged;
      this._silent++;
      try {
        if (goOn) this._cancelUntil(); else this.pause();                     // (a `playUntil()` in flight ends here too)
        if (sizeChanged) {
          try {
            this.width = width; this.height = height; this._resized = true;
            app.renderer.resize(width, height);
            root.cullArea = new Rectangle(0, 0, width, height);
          } catch (e) {
            this.width = oldSize.w; this.height = oldSize.h; this._resized = oldResized;
            safeRun(() => app.renderer.resize(oldSize.w, oldSize.h));
            root.cullArea = new Rectangle(0, 0, oldSize.w, oldSize.h);
            if (wasPlaying && !goOn) this.play();
            throw e;
          }
        }
        const old = this._rootSequence, oldTimeline = this.timeline;
        if (old?.target) root.removeChild(old.target);
        if (sequence.target) root.addChild(sequence.target);
        this._rootSequence = sequence;
        this.timeline = timeline;
        this._timeFilters = collectTimeFilters(sequence);
        const unmute = muteBoundTextureWarning();
        try { safeRun(() => old?.destroy()); } finally { unmute(); }
        safeRun(() => oldTimeline?.kill());
        this._vars = vars;
        this._composition = composition;
        this.stops = normalizeStops(applyVars(composition, vars)?.stops, this.duration, this.frameRate);
        sequence = null;
      } finally { this._silent--; }

      // put the movie back where it was; the swap has happened, so a picture that cannot be drawn is a playback error, not a failed rebuild
      try {
        if (wasAtPoster) await this._showPoster();
        else await this._quietly(() => this.gotoFrame(frame, true));
      } catch (e) { console.warn('pixi-effects: could not draw the frame after a rebuild:', e); this._emitError('playback', e); }
      if (wasPlaying && !goOn && this._initState === 'ready' && !this.isPlaying) { this._silent++; try { this.play(); } finally { this._silent--; } }
      const report: RebuildReport = { reason, ms: Math.round((performance.now() - started) * 10) / 10, audio, frame, playing: wasPlaying };
      this.emit('rebuilt', report);
      return report;
    } catch (err) {
      if (sequence) safeRun(() => sequence!.destroy());
      this._emitError('rebuild', err);
      throw err;
    }
  }

  async gotoFrame(frame: number, force = false): Promise<void> {
    if (this._initState !== 'ready') return;
    this._cancelUntil();                                                          // a seek by someone else ends a `playUntil()` in flight
    if (!force && !this._atPoster && this.currentFrame === frame) return;      // (at the poster the canvas shows another frame)
    if (this._quiet > 0) return this._goto(frame);
    const target = Math.max(0, Math.min(frame, this.totalFrames));
    this.emit('seeking', { frame: target, totalFrames: this.totalFrames } satisfies FrameEvent);
    await this._goto(frame);
    this.emit('seeked', { frame: this.currentFrame, totalFrames: this.totalFrames } satisfies FrameEvent);
  }

  /** Run `fn` with `seeking` / `seeked` silenced: the movie is moving its own playhead, not answering a seek. */
  private async _quietly<T>(fn: () => Promise<T>): Promise<T> {
    this._quiet++;
    try { return await fn(); } finally { this._quiet--; }
  }

  private _emitError(where: MovieErrorEvent['where'], error: unknown): void {
    this.emit('error', { where, message: error instanceof Error ? error.message : String(error), error } satisfies MovieErrorEvent);
  }

  private async _goto(frame: number): Promise<void> {
    this._atPoster = false;
    this.currentFrame = Math.max(0, Math.min(frame, this.totalFrames));
    this.timeline!.time(this._timeOf(this.currentFrame));
    await this._awaitVideoFrames();
    this._updateSpace();
    this._renderNow();
    this.emit('frame', { frame: this.currentFrame, totalFrames: this.totalFrames } satisfies FrameEvent);
  }

  /**
   * The moment frame `frame` shows. The very last frame (`totalFrames`) is at the end of the movie, where every layer's lifespan
   * has just closed: it is drawn a hair before, so a layer that lasts to the end is still on screen in the final frame
   * (it used to be an empty one, the last frame of every export).
   */
  private _timeOf(frame: number): number {
    return Math.min(frame / this.frameRate, Math.max(0, this.duration - END_MARGIN));
  }

  private async _awaitVideoFrames(t: number = this._timeOf(this.currentFrame)): Promise<void> {
    if (!this._rootSequence) return;
    const collected: VideoLike[] = [];
    const clocks = new Map<VideoLike, () => number>();
    collectVideoSequences(this._rootSequence, collected, clocks);
    await Promise.all(collected.map(v => {
      if (v.selfTimed) return v.awaitFrameAt(t);                          // a video knows the playhead its own timeline wrote (remapped, local inside a remapped composition)
      // a layer inside a composition with its own time lives in THAT composition's seconds: its `absoluteStart` is local
      const local = (clocks.get(v)?.() ?? t) - (v.absoluteStart ?? v.at);
      if (local < 0 || local > (v.duration ?? 0)) return Promise.resolve();
      return v.awaitFrameAt(local);
    }));
  }

  /**
   * A picture of one frame (the canvas only: the player bar is not included). Seeks there first and
   * stays there. Use it to LOOK at your composition.
   */
  async snapshot(frame?: number, opts?: SnapshotOptions & { as?: 'blob' }): Promise<Blob>;
  async snapshot(frame: number | undefined, opts: SnapshotOptions & { as: 'dataURL' }): Promise<string>;
  async snapshot(frame: number | undefined, opts: SnapshotOptions & { as: 'imageData' }): Promise<ImageData>;
  async snapshot(frame: number = this.currentFrame, opts: SnapshotOptions = {}): Promise<Blob | string | ImageData> {
    warnUnknownOptions('movie.snapshot()', opts, ['scale', 'type', 'quality', 'as', 'motionBlur']);
    this._requireReady('snapshot');
    return this._captureFrame(clampFrame(frame, this.totalFrames), { scale: opts.scale ?? 1, type: opts.type ?? 'image/png', quality: opts.quality, as: opts.as ?? 'blob', motionBlur: opts.motionBlur });
  }

  /** Seek to `frame` (quietly, and stay there) and draw the canvas on a new canvas of `scale` times its size. */
  private async _frameCanvas(frame: number, scale: number, motionBlur?: MotionBlurSpec): Promise<HTMLCanvasElement> {
    const mb = this._blurFor(motionBlur, 'a picture');            // undefined: the movie's own setting; false: none
    let source = this.app!.canvas as HTMLCanvasElement;
    if (mb) { source = this._blurCanvas(); await this._quietly(() => this._exposeFrame(frame, mb, source, true)); }
    else await this._quietly(() => this.gotoFrame(frame, true));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(this.width * scale));
    out.height = Math.max(1, Math.round(this.height * scale));
    out.getContext('2d')!.drawImage(source, 0, 0, out.width, out.height);
    return out;
  }

  /** Seek to `frame` (quietly, and stay there) and encode the canvas as a picture. */
  private async _captureFrame(frame: number, o: { scale: number; type: string; quality?: number; as: 'blob' | 'dataURL' | 'imageData'; motionBlur?: MotionBlurSpec }): Promise<Blob | string | ImageData> {
    const out = await this._frameCanvas(frame, o.scale, o.motionBlur);
    if (o.as === 'imageData') return out.getContext('2d')!.getImageData(0, 0, out.width, out.height);
    return encodeCanvas(out, o.type, o.as, o.quality);
  }

  /**
   * One picture of a movement: `count` frames from `from` to `to` drawn one over the other, each later one stronger, so a thing that
   * moves leaves a trail (its path and its easing: even steps = constant speed, bunched = slow) and what stays still stays itself.
   * The movie is left where it was.
   */
  async onionSkin(opts?: OnionSkinOptions & { as?: 'blob' }): Promise<Blob>;
  async onionSkin(opts: OnionSkinOptions & { as: 'dataURL' }): Promise<string>;
  async onionSkin(opts: OnionSkinOptions = {}): Promise<Blob | string> {
    warnUnknownOptions('movie.onionSkin()', opts, ['from', 'to', 'count', 'scale', 'as', 'motionBlur']);
    this._requireReady('onionSkin');
    const from = opts.from ?? 0, to = opts.to ?? this.duration, count = opts.count ?? 8, scale = opts.scale ?? 1;
    if (!(Number.isInteger(count) && count >= 1 && count <= 64)) throw new Error(`pixi-effects: movie.onionSkin(): count must be a whole number from 1 to 64, got ${count}`);
    if (!(from >= 0 && to <= this.duration + 1e-9 && (count === 1 || from < to))) throw new Error(`pixi-effects: movie.onionSkin(): from must be before to, inside the movie (0 to ${this.duration} s), got ${from} to ${to}`);
    if (!(scale > 0 && scale <= 4)) throw new Error(`pixi-effects: movie.onionSkin(): scale must be above 0 and at most 4, got ${scale}`);
    const mb = this._blurFor(opts.motionBlur, 'movie.onionSkin()');
    const blurred = mb ? this._blurCanvas() : null;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(this.width * scale));
    out.height = Math.max(1, Math.round(this.height * scale));
    const g = out.getContext('2d')!;
    const alphas = onionAlphas(count);
    const frames = onionTimes(from, to, count).map(t => clampFrame(t * this.frameRate, this.totalFrames));
    const back = this.currentFrame, wasAtPoster = this._atPoster;
    try {
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
        if (mb && blurred) await this._quietly(() => this._exposeFrame(f, mb, blurred, true));
        else await this._quietly(() => this.gotoFrame(f, true));
        g.globalAlpha = alphas[i]!;
        g.drawImage(blurred ?? (this.app!.canvas as HTMLCanvasElement), 0, 0, out.width, out.height);
      }
    } finally {
      g.globalAlpha = 1;
      if (wasAtPoster) await this._showPoster();                     // the movie is left as it was: still showing its poster
      else await this._quietly(() => this.gotoFrame(back, true));
    }
    return encodeCanvas(out, 'image/png', opts.as ?? 'blob');
  }

  /**
   * Several frames on ONE image, each labelled with its frame number and time — the cheapest way to
   * check a whole animation by eye. Restores the current frame afterwards.
   */
  async contactSheet(opts?: ContactSheetOptions & { as?: 'blob' }): Promise<Blob>;
  async contactSheet(opts: ContactSheetOptions & { as: 'dataURL' }): Promise<string>;
  async contactSheet(opts: ContactSheetOptions = {}): Promise<Blob | string> {
    warnUnknownOptions('movie.contactSheet()', opts, ['frames', 'times', 'count', 'columns', 'cellWidth', 'as', 'motionBlur']);
    this._requireReady('contactSheet');
    const mb = this._blurFor(opts.motionBlur, 'movie.contactSheet()');
    const blurred = mb ? this._blurCanvas() : null;
    const frames = (opts.frames
      ?? opts.times?.map(t => Math.round(t * this.frameRate))
      ?? pickFrames(this.totalFrames, opts.count ?? 6)).map(f => clampFrame(f, this.totalFrames));
    const LABEL_H = 26;
    const L = sheetLayout(frames.length, opts.columns ?? 3, opts.cellWidth ?? 480, this.width, this.height, LABEL_H);
    const sheet = document.createElement('canvas');
    sheet.width = L.width;
    sheet.height = L.height;
    const g = sheet.getContext('2d')!;
    g.fillStyle = '#10131c';
    g.fillRect(0, 0, L.width, L.height);
    const back = this.currentFrame, wasAtPoster = this._atPoster;
    try {
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
        if (mb && blurred) await this._quietly(() => this._exposeFrame(f, mb, blurred, true));
        else await this._quietly(() => this.gotoFrame(f, true));
        const { x, y } = L.positions[i]!;
        g.drawImage(blurred ?? (this.app!.canvas as HTMLCanvasElement), x, y + LABEL_H, L.cellW, L.cellH);
        g.fillStyle = '#e8ecf8';
        g.font = '600 15px system-ui, sans-serif';
        g.textBaseline = 'middle';
        g.fillText(`frame ${f}  ·  ${(f / this.frameRate).toFixed(2)}s`, x + 8, y + LABEL_H / 2);
      }
    } finally {
      if (wasAtPoster) await this._showPoster();                     // the movie is left as it was: still showing its poster
      else await this._quietly(() => this.gotoFrame(back, true));
    }
    return encodeCanvas(sheet, 'image/png', opts.as ?? 'blob');
  }

  /**
   * Where every layer is drawn at `frame` (canvas pixels, visibility) plus `issues` — text that is off
   * the canvas, cut by an edge, empty, or overlapping other text. Seeks there and stays there.
   */
  async inspect(frame: number = this.currentFrame, opts: InspectOptions = { layers: 'visible' }): Promise<InspectReport> {
    warnUnknownOptions('movie.inspect()', opts, ['layers']);
    this._requireReady('inspect');
    const f = clampFrame(frame, this.totalFrames);
    await this.gotoFrame(f, true);
    return inspectScene(this._rootSequence as CompositionSequence, f, f / this.frameRate, { width: this.width, height: this.height }, opts);
  }

  /**
   * Every layer as a row with absolute start / end / keyframe times (seconds), plus the transition windows. Runs of
   * similar layers (`pop-1` … `pop-12`) are one row with a `parts` span each. Read it, or draw it with `timelineChart()`.
   */
  timelineData(): TimelineData {
    this._requireReady('timelineData');
    return collectTimeline(this._rootSequence as CompositionSequence, this.duration);
  }

  /** The timeline as one self-contained HTML page (an inline SVG, no scripts): layers as bars on a time axis, ◆ keyframes, transition bands. Open it in a browser. */
  timelineChart(opts: TimelineHtmlOptions = {}): string {
    warnUnknownOptions('movie.timelineChart()', opts, ['title']);
    return timelineHtml(this.timelineData(), opts);
  }

  /** Just the chart: one `<svg>` whose geometry is in `data-*` attributes (a viewer puts a playhead on it: `pixi-effects view`). */
  timelineSvg(opts: TimelineSvgOptions = {}): string {
    warnUnknownOptions('movie.timelineSvg()', opts, ['chartWidth', 'labels']);
    return timelineSvg(this.timelineData(), opts);
  }

  /**
   * The soundtrack, measured: when every audio layer plays, how loud the mix is over time, and `issues`
   * (limiting, inaudible layers, sounds cut off by the end). Use it to CHECK sound you cannot hear.
   */
  /** The pictures to look at for moments such as `3.5`, `50%`, `f120`, `title@end` (comma-separated). A mistake says what could not be read. */
  resolveAt(list: string): Array<{ label: string; frame: number }> {
    this._requireReady('resolveAt');
    return resolveAtList(list, { frameRate: this.frameRate, totalFrames: this.totalFrames, duration: this.duration, rows: this.timelineData().rows });
  }

  /**
   * One call that looks at everything `pixi-effects check` looks at inside the page: layout issues over the whole timeline (every
   * scene's first and last frame and a frame every 0.25 s), fonts and the sound. See `ReviewReport`. Page warnings are in `window.__logs`. The movie is left as it was.
   */
  async review(opts: ReviewOptions = {}): Promise<ReviewReport> {
    warnUnknownOptions('movie.review()', opts, ['at', 'strict']);
    this._requireReady('review');
    const back = this.currentFrame, wasAtPoster = this._atPoster;
    try {
      return await reviewMovie(this, opts);
    } finally {                                                    // the movie is left as it was: still showing its poster, or back at its frame
      this.currentFrame = back;
      if (wasAtPoster) await this._showPoster();
      else await this._quietly(() => this.gotoFrame(back, true));
    }
  }

  /**
   * The fonts of the text layers: `missing` lists layers none of whose `fontFamily` entries is available in this browser (they are
   * drawn in a fallback font), `failed` lists web fonts (`@font-face`) whose file could not be loaded.
   */
  inspectFonts(): FontReport {
    this._requireReady('inspectFonts');
    return inspectFonts(this._rootSequence as Sequence);
  }

  inspectAudio(opts: AudioInspectOptions = {}): AudioReport {
    warnUnknownOptions('movie.inspectAudio()', opts, ['window', 'scenes']);
    this._requireReady('inspectAudio');
    const scenes = opts.scenes ?? namedScenes(this.timelineData().rows);       // the scenes of the movie: named top-level compositions of a second or more
    return analyzeAudio(this.audioBuffer, this._audioSources, this._mixStats, this.duration, { ...opts, scenes });
  }

  /**
   * Draw the stage now. PixiJS's CullerPlugin only culls inside `app.render()` (the ticker), and we render
   * by hand — while seeking and especially during `render()`, which stops the ticker — so without this the
   * `culled` flags are whatever the last tick left: a layer that is now on screen can stay culled and be
   * missing from the frame or from the exported video. Cull again (updating transforms: the timeline just
   * moved things) right before drawing.
   */
  private _renderNow(): void {
    const app = this.app;
    if (!app?.renderer) return;
    if (!this._synced) this._rootSequence?.syncFrame();           // normally _updateSpace() has already done it (see there)
    this._synced = false;
    this._feedTimeFilters();                                       // the same time again when nothing called _updateSpace first
    Culler.shared.cull(app.stage, app.renderer.screen, false);
    app.renderer.render({ container: app.stage });
  }

  private _requireReady(what: string): void {
    if (this._initState !== 'ready' || !this._rootSequence || !this.app) {
      throw new Error(`pixi-effects: movie.${what}() needs a ready movie — await movie.init(...) first`);
    }
  }

  /** True when the layers were already synced to the playhead for the frame about to be drawn (so `_renderNow` need not do it again). */
  private _synced = false;

  /**
   * Projects every `threeD` layer for the current frame (see src/space). A threeD card is drawn into its own texture HERE, before the stage is
   * drawn, so the shapes inside it must be brought up to the playhead first: syncing only in `_renderNow` left every card showing the state of
   * the frame before (after a jump seek, a card whose children were animated showed a stale picture).
   */
  private _updateSpace(t: number = this._timeOf(this.currentFrame)): void {
    this._feedTimeFilters();                                       // before anything is drawn: a threeD card is drawn to its texture right here
    if (!this._rootSequence || !this.app) return;
    this._rootSequence.syncFrame();
    this._synced = true;
    this._rootSequence.updateSpace(t, this.app.renderer);
  }

  /** The motion blur an operation uses: its own option when given (`false` is off), otherwise the movie's. */
  private _blurFor(option: MotionBlurSpec | undefined, where: string): ResolvedMotionBlur | null {
    return option === undefined ? this.motionBlur : resolveMotionBlur(option, where);
  }

  /**
   * @internal Draw `frame` with motion blur into `target` (a canvas the size of the stage): the average of `mb.samples` renders at moments
   * spread over the shutter interval around the frame time. With `settle` the playhead and the stage are left exactly on the frame.
   */
  async _exposeFrame(frame: number, mb: ResolvedMotionBlur, target: HTMLCanvasElement, settle: boolean): Promise<void> {
    const g = target.getContext('2d')!;
    const stage = this.app!.canvas as HTMLCanvasElement;
    this._atPoster = false;
    const times = blurTimes(frame, this.frameRate, mb, Math.max(0, this.duration - END_MARGIN));
    this._nominalTime = this._timeOf(Math.max(0, Math.min(frame, this.totalFrames)));
    try {
      for (let k = 0; k < times.length; k++) {
        const t = times[k]!;
        this.timeline!.time(t);
        await this._awaitVideoFrames(t);
        this._updateSpace(t);
        this._renderNow();
        if (k === 0) g.clearRect(0, 0, target.width, target.height);
        g.globalAlpha = 1 / (k + 1);                                     // a running mean: sample k weighs 1/(k + 1)
        g.drawImage(stage, 0, 0, target.width, target.height);
      }
    } finally { this._nominalTime = null; }
    g.globalAlpha = 1;
    if (settle) await this._goto(frame);
    else {
      this.currentFrame = Math.max(0, Math.min(frame, this.totalFrames));
      this.emit('frame', { frame: this.currentFrame, totalFrames: this.totalFrames } satisfies FrameEvent);
    }
  }

  private _blurCanvas(): HTMLCanvasElement {
    const stage = this.app!.canvas as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = stage.width; c.height = stage.height;
    return c;
  }

  /**
   * Play and pause exactly at `seconds`: it resolves `true` when the playhead has landed on that frame, `false` when something else ended it
   * first (a `pause()`, a seek, a newer `playUntil()`), or when there is nothing to play toward (a time at or before the playhead, which also
   * pauses it where it is, or a movie that is not ready). A time at or past the end lands on the last frame; with no time at all it plays to
   * the end and resolves `true` once the movie has ended (and says `ended`). An ordinary `play()` is
   * not affected by it. It is the one primitive a presentation is built on (see `pixi-effects/present`).
   */
  async playUntil(seconds?: number): Promise<boolean> {
    if (this._initState !== 'ready') return false;
    this._settleUntil(false);                                                    // a new target replaces the one in flight
    if (this.currentFrame >= this.totalFrames) return false;
    const frame = seconds === undefined ? Infinity : Math.round(seconds * this.frameRate);
    if (frame <= this.currentFrame) { this.pause(); return false; }
    this._until = Number.isFinite(frame) ? Math.min(frame, this.totalFrames) : null;      // a time at or past the end lands on the last frame (no 'ended'); only no time at all runs to the end
    const landed = new Promise<boolean>(resolve => this._untilWaiters.push(resolve));
    if (!this.isPlaying) this.play();
    return landed;
  }

  /**
   * Look around and put the movie back: pauses, runs `fn` (seek, take pictures: the seeks made inside are not reported as `seeking` / `seeked`),
   * then puts the playhead (or the poster) back where it was, whatever `fn` did, and returns what `fn` returned.
   */
  async peek<T>(fn: () => Promise<T>): Promise<T> {
    this._requireReady('peek');
    return this._exclusive(async () => {
      this.pause();
      const back = this.currentFrame, wasAtPoster = this._atPoster;
      try { return await this._quietly(fn); }
      finally {
        if (wasAtPoster) await this._showPoster();
        else await this._quietly(() => this.gotoFrame(back, true));
      }
    });
  }

  /** Run `fn` as the only thing that moves the composition: waits for a rebuild in flight, and holds the next one's swap until `fn` is done. */
  private async _exclusive<T>(fn: () => Promise<T>): Promise<T> {
    while (this._rebuildRun) await this._rebuildRun.catch(() => {});
    this._busy++;
    try { return await fn(); }
    finally { if (--this._busy === 0) { const waiting = this._idleWaiters; this._idleWaiters = []; waiting.forEach(w => w()); } }
  }

  private _settleUntil(landed: boolean): void {
    const waiters = this._untilWaiters; this._untilWaiters = []; this._until = null;
    waiters.forEach(w => w(landed));
  }
  private _cancelUntil(): void { if (this._untilWaiters.length > 0 || this._until !== null) this._settleUntil(false); }
  /** The playhead reached the frame `playUntil()` was playing to: land exactly on it, pause, resolve true. */
  private async _arriveUntil(): Promise<void> {
    const frame = this._until!;
    const waiters = this._untilWaiters; this._untilWaiters = []; this._until = null;      // (taken first, so the pause below does not cancel them)
    let landed = true;
    try { this.pause(); await this._goto(frame); }
    catch (err) { landed = false; console.warn('pixi-effects: could not land on the frame playUntil() was playing to:', err); this._emitError('playback', err); }
    waiters.forEach(w => w(landed));
  }

  play(): void {
    if (this._initState !== 'ready') return;
    if (this.currentFrame >= this.totalFrames) this.currentFrame = 0;
    const wasPlaying = this.isPlaying;
    this.isPlaying = true;
    const startFrame = this.currentFrame;
    const startTime = performance.now() - (this.currentFrame / this.frameRate * 1000);
    let inFlight = false;
    const tick = (time: number) => {
      if (!this.isPlaying) return;
      if (inFlight) {
        this._raf = requestAnimationFrame(tick);
        return;
      }
      const elapsed = (time - startTime) / 1000;
      const frame = Math.max(startFrame, Math.floor(elapsed * this.frameRate));        // (rAF's time is a little before `startTime`: the first tick must not land a frame back)
      if (this._until !== null && frame >= this._until) { void this._arriveUntil(); return; }
      if (frame <= this.totalFrames) {
        inFlight = true;
        this._goto(frame)
          .catch((err) => { console.warn('pixi-effects: gotoFrame failed during playback:', err); this._emitError('playback', err); })
          .finally(() => { inFlight = false; });
        this._raf = requestAnimationFrame(tick);
      } else if (this._loop && this._untilWaiters.length === 0) {
        // loop: back to the start, playing on (the stop and start are the movie's own: no pause / play events, no ended)
        this._silent++;
        try { this.pause(); this._goto(0).catch((err) => { console.warn('pixi-effects: gotoFrame failed at the loop:', err); this._emitError('playback', err); }); this.play(); }
        finally { this._silent--; }
      } else {
        const toEnd = this._untilWaiters; this._untilWaiters = []; this._until = null;     // `playUntil()` to the end: it has landed
        this.pause();
        // Final frame — also catch so the play loop never leaves an unhandled rejection.
        this._goto(this.totalFrames).catch((err) => {
          console.warn('pixi-effects: final gotoFrame failed:', err);
          this._emitError('playback', err);
        });
        this.emit('ended');
        toEnd.forEach(w => w(true));
      }
    };
    this._raf = requestAnimationFrame(tick);

    if (this.audioBuffer) {
      const ctx = this._ensureAudioContext();
      const buffer = this.audioBuffer;
      this._cancelAudioStart?.();
      // A browser keeps the context suspended until the user has interacted with the page: start the sound when it
      // runs, from the position the movie has reached by then, instead of at a stale offset.
      this._cancelAudioStart = startWhenRunning(ctx, () => {
        if (!this.isPlaying) return;
        this.audioSource = ctx.createBufferSource();
        this.audioSource.buffer = buffer;
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this._muted ? 0 : this._volume;
        this.audioSource.connect(this.gainNode).connect(ctx.destination);
        this.audioSource.start(0, Math.min(this.currentFrame / this.frameRate, buffer.duration));
      }, typeof window !== 'undefined' ? window : undefined);
    }
    if (!wasPlaying && !this._silent) this.emit('play');
  }

  pause(): void {
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;
    this._cancelAudioStart?.();
    this._cancelAudioStart = null;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this.audioSource) {
      try { this.audioSource.stop(); } catch { /* ignore */ }
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (wasPlaying && !this._silent) this.emit('pause');
    this._cancelUntil();
  }

  set volume(v: number) {
    const next = Math.max(0, Math.min(1, v));
    const changed = next !== this._volume;
    this._volume = next;
    if (this.gainNode) this.gainNode.gain.value = this._muted ? 0 : this._volume;
    if (changed) this.emit('volumechange', { volume: this._volume, muted: this._muted } satisfies VolumeEvent);
  }
  get volume(): number { return this._volume; }
  set muted(v: boolean) {
    const changed = !!v !== this._muted;
    this._muted = !!v;
    if (this.gainNode) this.gainNode.gain.value = this._muted ? 0 : this._volume;
    if (changed) this.emit('volumechange', { volume: this._volume, muted: this._muted } satisfies VolumeEvent);
  }
  get muted(): boolean { return this._muted; }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }

  /**
   * At the end of an ordinary `play()` the movie goes back to the start and plays on (no `ended`, no `pause` / `play` events at the wrap; the sound
   * starts again). Default false. `playUntil()` and `render()` ignore it. Can be changed at any time; `loopchange` says so.
   */
  set loop(v: boolean) {
    const next = !!v;
    if (next === this._loop) return;
    this._loop = next;
    this.emit('loopchange', { loop: next } satisfies LoopEvent);
  }
  get loop(): boolean { return this._loop; }

  async render(options?: RenderOptions): Promise<Blob> {
    warnUnknownOptions('movie.render()', options, ['format', 'video', 'audio', 'motionBlur', 'range', 'scale', 'draft']);
    try {
      return await this._exclusive(() => this._quietly(() => exportFrames(this, options)));
    } catch (err) {
      this._emitError('render', err);
      throw err;
    }
  }

  async destroy(): Promise<void> {
    safeRun(() => this.pause());
    this._timeFilters = [];
    safeRun(() => this._rootSequence?.destroy());
    this._rootSequence = null;
    safeRun(() => this.timeline?.kill());
    this.timeline = null;
    safeRun(() => this.app?.destroy(true, { children: true, texture: true }));
    this.app = null;
    this.audioBuffer = null;
    this._audioSources = [];
    this._mixStats = null;
    this._mixCache.set(null, null);
    safeRun(() => this._audioContext?.close().catch(() => {}));
    this._audioContext = null;
    this._initState = 'destroyed';
  }
}

/** How far before the end of the movie its last frame is drawn (seconds): inside every layer's lifespan, far below a frame. */
const END_MARGIN = 1e-4;

/**
 * PixiJS warns "a textureSource was destroyed while still bound to a shader" when a layer that was drawn a moment ago is destroyed. A rebuild does
 * exactly that to the composition it replaces; the renderer builds its bind groups again on the next draw, so the warning says nothing here and
 * would make `check` count a problem. Silenced for the synchronous destroy only; any other warning goes through.
 */
function muteBoundTextureWarning(): () => void {
  const original = console.warn;
  const ours = (...args: unknown[]) => { if (args.some(a => /destroyed while still bound/.test(String(a)))) return; original.apply(console, args); };
  console.warn = ours;
  return () => { if (console.warn === ours) console.warn = original; };
}

const clampFrame = (f: number, last: number): number => Math.max(0, Math.min(Math.round(f), last));

function encodeCanvas(canvas: HTMLCanvasElement, type: string, as: 'blob' | 'dataURL', quality?: number): Promise<Blob | string> {
  if (as === 'dataURL') return Promise.resolve(canvas.toDataURL(type, quality));
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('pixi-effects: could not encode the image'))), type, quality));
}

interface VideoLike {
  at: number;
  duration: number | undefined;
  absoluteStart?: number | null;
  /** The layer draws the frame its own timeline is at (a video): Movie does not compute a local time for it. */
  selfTimed?: boolean;
  awaitFrameAt(t: number): Promise<void>;
}

function safeRun(fn: () => unknown): void {
  try { fn(); } catch (e) { console.warn('pixi-effects: cleanup step threw, continuing:', e); }
}

/**
 * Exported for tests/internal use only — not part of the public API.
 * Walks a sequence tree (including mask sequences) collecting any node
 * that exposes `awaitFrameAt`, so Movie can await frame-driven sequences
 * (video, three) wherever they appear, including inside masks.
 */
export function collectVideoSequences(seq: Sequence, out: VideoLike[], clocks?: Map<VideoLike, () => number>, clock: (() => number) | null = null): void {
  if (typeof (seq as Sequence & Partial<VideoLike>).awaitFrameAt === 'function') {
    out.push(seq as unknown as VideoLike);
    if (clock && clocks) clocks.set(seq as unknown as VideoLike, clock);       // inside a composition with its own time: that composition's clock
  }
  if (seq.maskSequence) collectVideoSequences(seq.maskSequence, out, clocks, clock);
  const own = (seq as Sequence & { localClock?: () => (() => number) | null }).localClock?.() ?? clock;
  for (const child of (seq as Sequence & { _children?: Sequence[] })._children ?? []) {
    collectVideoSequences(child, out, clocks, own);
  }
}

/** How many layers a composition spec holds (its children, theirs, …): the size of the `build` stage of `loadprogress`. */
function countLayers(spec: { sequences?: unknown[] } | undefined): number {
  let n = 0;
  for (const s of spec?.sequences ?? []) {
    const mask = (s as { mask?: unknown }).mask;
    n += 1 + countLayers(s as { sequences?: unknown[] });
    const spans = (s as { spans?: unknown }).spans;
    if (Array.isArray(spans)) n += spans.length;                         // a text with spans is built as a group and one layer per piece (at least one per span)
    const src = maskSourceOf(mask);
    if (src.kind === 'inline') n += 1 + countLayers(src.spec as { sequences?: unknown[] });   // an inline mask is built as a layer too
  }
  return n;
}
