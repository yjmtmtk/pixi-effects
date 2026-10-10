import * as PIXI from 'pixi.js';
import { usesAdvancedBlend, enableAdvancedBlend } from './blend';
import { Application, Container, Culler, Rectangle, extensions, CullerPlugin } from 'pixi.js';
import { gsap } from 'gsap';
import { createTimeline, lengthen } from './timelineEngine';
import { PixiPlugin } from 'gsap/PixiPlugin';
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
import { warnUnknownOptions } from './options';
import { startWhenRunning, audioIsBlocked } from './startWhenRunning';
import { normalizePoster } from './poster';
import { buildPdf } from './pdf';
import { normalizeStops, nextStopAfter, previousStopBefore, stopAtOrBefore, pageStarts, pictureStops, changedFraction, type Stop } from './stops';
import { resolveLoader, dismissLoader, failLoader, setLoaderProgress, type LoaderOption } from './loader';
import { LoadProgress, type LoadProgressState, type LoadStage } from './loadProgress';
import { resolveMotionBlur, blurTimes, type MotionBlurSpec, type MotionBlurOptions, type ResolvedMotionBlur } from './motionBlur';
import { ensureFilterLibrary } from '../filters/named';
import type { Sequence } from '../sequences/Base';
import type {
  AssetSpec, CompositionSpec, CompositionShape, AudioDescriptor,
} from '../types';

extensions.add(CullerPlugin);

gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

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
  /** Return a `data:` URL string instead of a Blob (handy for scripts that can only return text). */
  as?: 'blob' | 'dataURL';
}

/** One picture of a stop (see `movie.stopImages()`). */
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
/** A presentation reached a stop (`movie.next()` played to it, or `prev()` / `goToStop()` / `goToPage()` jumped to it). */
export interface StopEvent { index: number; stop: Stop; pageIndex: number }
export interface ProgressEvent { progress: number; frame: number; totalFrames: number }
/** `volumechange`: the values after the change. */
export interface VolumeEvent { volume: number; muted: boolean }
/** `error`: something failed in `init()`, `render()` or during playback. The call that failed still rejects / warns as before. */
export interface MovieErrorEvent { where: 'init' | 'render' | 'playback'; message: string; error: unknown }

type Listener = (...args: any[]) => void;

export class Movie {
  private _events: Record<string, Listener[]> = {};
  private _initState: 'idle' | 'pending' | 'ready' | 'destroyed' = 'idle';
  app: Application | null = null;
  timeline: ReturnType<typeof gsap.timeline> | null = null;
  audioBuffer: AudioBuffer | null = null;
  audioSource: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;
  private _cancelAudioStart: (() => void) | null = null;
  /** The poster time in seconds (`movie.init({ poster })`), or null. */
  poster: number | null = null;
  /** The stops of the composition (`composition.stops`), checked and in order: where `next()` pauses. Empty for an ordinary movie. */
  stops: Stop[] = [];
  /** The frame `next()` is playing toward, or null. */
  private _stopAt: number | null = null;
  private _stopWaiters: Array<() => void> = [];
  private _arriving = false;
  /** The motion blur `render()`, `snapshot()` and `contactSheet()` apply unless told otherwise (`movie.init({ motionBlur })`), or null. */
  motionBlur: ResolvedMotionBlur | null = null;
  private _posterFrame: number | null = null;
  /** The canvas shows the poster picture while the playhead is still at frame 0 (like `<video poster>`): the first seek or play replaces it. */
  private _atPoster = false;
  /** > 0 while the movie moves its own playhead (playback, render, snapshot, contactSheet): those are not the seeks `seeking` / `seeked` report. */
  private _quiet = 0;
  private _volume = 1;
  private _muted = false;
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
  /** What went into the mix, and its peak before limiting — kept for inspectAudio(). */
  private _audioSources: AudioDescriptor[] = [];
  private _mixStats: MixStats | null = null;

  on(event: 'ready', fn: () => void): this;
  /** A presentation is now on a stop (see `stops` in the composition, `next()`, `prev()`). */
  on(event: 'stop', fn: (e: StopEvent) => void): this;
  on(event: 'frame', fn: (e: FrameEvent) => void): this;
  /** A jump to another frame (`gotoFrame`, a seek bar) starts / finishes. Not emitted for playback ticks, `render()`, `snapshot()` or `contactSheet()`. */
  on(event: 'seeking' | 'seeked', fn: (e: FrameEvent) => void): this;
  /** Playback ran off the end (after `pause`). Pausing by hand does not emit it. */
  on(event: 'ended', fn: () => void): this;
  on(event: 'volumechange', fn: (e: VolumeEvent) => void): this;
  on(event: 'error', fn: (e: MovieErrorEvent) => void): this;
  on(event: 'progress', fn: (e: ProgressEvent) => void): this;
  /** How far `init()` is while it builds the movie: `{ stage: 'assets' | 'build' | 'sound' | 'frames', loaded, total, progress }`, `progress` 0 to 1. The page's `.pe-loader` shows it by itself. */
  on(event: 'loadprogress', fn: (e: LoadProgressState) => void): this;
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
    warnUnknownOptions('movie.init()', options, ['width', 'height', 'duration', 'frameRate', 'background', 'canvas', 'assets', 'composition', 'poster', 'motionBlur', 'loader']);
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
      this.stops = normalizeStops(options.composition?.stops, this.duration, this.frameRate);
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

      if (usesAdvancedBlend(options.composition)) await enableAdvancedBlend(this.app.renderer);

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

      const rootShape: CompositionShape = { width: this.width, height: this.height, duration: this.duration, frameRate: this.frameRate,
        onLayerBuilt: async () => { lp.tick(); await lp.yieldIfDue(); } };
      // Inject root dimensions before expanding transitions: the macro
      // expander reads `width` / `height` to compute filter areas, so the
      // values must be present on the spec it sees rather than being merged
      // in below as overrides.
      const seededComposition = options.composition
        ? {
            ...options.composition,
            width: options.composition.width ?? this.width,
            height: options.composition.height ?? this.height,
            duration: options.composition.duration ?? this.duration,
          }
        : undefined;
      await ensureFilterLibrary(seededComposition);            // pixi-filters, only when a layer names one of its filters
      const userComposition = seededComposition ? expandTransitions(seededComposition) : undefined;
      const rootSeqSpec = {
        type: 'composition' as const,
        width: this.width,
        height: this.height,
        duration: this.duration,
        ...userComposition,
      };
      if (userComposition) carryTransitionWindows(userComposition, rootSeqSpec);
      const composition = new CompositionSequence(rootSeqSpec, null, rootShape);
      lp.begin('build', countLayers(rootSeqSpec));
      await composition.build();
      this._rootSequence = composition;
      if (composition.target) root.addChild(composition.target);
      composition.bindTimeline(this.timeline);
      this._timeFilters = collectTimeFilters(composition);

      const audios: AudioDescriptor[] = [];
      composition.collectAudio(audios, 0);
      lp.begin('sound', audios.length);
      if (audios.length > 0) {
        this.audioBuffer = await mixdown(audios, this.duration, audioContext.sampleRate);
        lp.tick(audios.length);
        if (this.audioBuffer) this._mixStats = limitMix(this.audioBuffer, audios);
      }
      this._audioSources = audios;

      this.timeline.progress(1).progress(0);
      lp.begin('frames', 0);
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

  async gotoFrame(frame: number, force = false): Promise<void> {
    if (this._initState !== 'ready') return;
    if (!this._arriving) this._cancelStop();                                      // a seek by someone else ends "play to the next stop"
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
  async snapshot(frame: number = this.currentFrame, opts: SnapshotOptions = {}): Promise<Blob | string> {
    warnUnknownOptions('movie.snapshot()', opts, ['scale', 'type', 'as', 'motionBlur']);
    this._requireReady('snapshot');
    return this._captureFrame(clampFrame(frame, this.totalFrames), { scale: opts.scale ?? 1, type: opts.type ?? 'image/png', as: opts.as ?? 'blob', motionBlur: opts.motionBlur });
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

  /** The pixels of `frame`, small (about 320 px wide) and without motion blur, to compare pictures. */
  private async _framePixels(frame: number): Promise<Uint8ClampedArray> {
    const c = await this._frameCanvas(frame, Math.min(1, 320 / Math.max(1, this.width)), false);
    return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  }

  /** Seek to `frame` (quietly, and stay there) and encode the canvas as a picture. */
  private async _captureFrame(frame: number, o: { scale: number; type: string; quality?: number; as: 'blob' | 'dataURL'; motionBlur?: MotionBlurSpec }): Promise<Blob | string> {
    const out = await this._frameCanvas(frame, o.scale, o.motionBlur);
    return encodeCanvas(out, o.type, o.as, o.quality);
  }

  /**
   * A picture of the settled state of each page (default: the page's last stop, fully built) or of every stop, for a page list, an
   * overview, an export. Pauses the movie, and leaves the playhead where it was. `onImage` is called as each picture is ready.
   */
  async stopImages(opts: StopImagesOptions & { as: 'dataURL' }): Promise<Array<StopImage & { image: string }>>;
  async stopImages(opts?: StopImagesOptions): Promise<StopImage[]>;
  async stopImages(opts: StopImagesOptions = {}): Promise<StopImage[]> {
    warnUnknownOptions('movie.stopImages()', opts, ['which', 'pick', 'scale', 'type', 'quality', 'as', 'motionBlur', 'pdf', 'onImage']);
    this._requireReady('stopImages');
    if (this.stops.length === 0) return [];
    const picks = pictureStops(this.stops, { which: opts.which, pick: opts.pick, pdf: opts.pdf });
    this.pause();
    const back = this.currentFrame, wasAtPoster = this._atPoster;
    const out: StopImage[] = [];
    try {
      for (const stop of picks) {
        const image = await this._captureFrame(stop.frame, {
          scale: opts.scale ?? 1, type: opts.type ?? 'image/png', quality: opts.quality, as: opts.as ?? 'blob', motionBlur: opts.motionBlur === undefined ? false : opts.motionBlur,
        });
        const item: StopImage = { stop, page: stop.pageIndex, image };
        out.push(item);
        opts.onImage?.(item);
      }
    } finally {
      if (wasAtPoster) await this._showPoster();
      else await this._quietly(() => this.gotoFrame(back, true));
    }
    return out;
  }

  /**
   * Look at every stop: is the picture there still changing? A stop is compared with the picture `lookback` frames before it (default 3):
   * when more than `tolerance` (default 0.4 %) of the picture differs, the audience, a page overview and a PDF all see a half-finished
   * animation. `issues` says which stop, which page and what to do; leaves the playhead where it was.
   */
  async inspectStops(opts: { lookback?: number; tolerance?: number } = {}): Promise<{ stops: Array<{ index: number; page: string | null; at: number; frame: number; moving: number; settled: boolean }>; issues: string[] }> {
    warnUnknownOptions('movie.inspectStops()', opts, ['lookback', 'tolerance']);
    this._requireReady('inspectStops');
    const out: { stops: Array<{ index: number; page: string | null; at: number; frame: number; moving: number; settled: boolean }>; issues: string[] } = { stops: [], issues: [] };
    if (this.stops.length === 0) return out;
    const lookback = Math.max(1, Math.round(opts.lookback ?? 3));
    const tolerance = opts.tolerance ?? 0.004;
    this.pause();
    const back = this.currentFrame, wasAtPoster = this._atPoster;
    try {
      for (const stop of this.stops) {
        const before = Math.max(0, stop.frame - lookback);
        let moving = 0;
        if (before < stop.frame) {
          const now = await this._framePixels(stop.frame);
          moving = changedFraction(now, await this._framePixels(before));
        }
        const settled = moving <= tolerance;
        out.stops.push({ index: stop.index, page: stop.page, at: stop.at, frame: stop.frame, moving, settled });
        if (!settled) {
          out.issues.push(`stop ${stop.index + 1}${stop.page ? ` (page "${stop.page}")` : ''} at ${stop.at.toFixed(1)} s: the picture is still changing there (${moving < 0.1 ? (moving * 100).toFixed(1) : Math.round(moving * 100)}% of it changed in the last ${stop.frame - before} frames), so the audience, the page overview and a PDF see it mid-animation. Move the stop to after the animation has finished, or flag a settled stop of the page with \`pdf: true\`.`);
        }
      }
    } finally {
      if (wasAtPoster) await this._showPoster();
      else await this._quietly(() => this.gotoFrame(back, true));
    }
    return out;
  }

  /**
   * The deck as a PDF: one page per page of the talk (the page's last stop, fully built, unless a stop says `pdf: true` or `pdf: false`;
   * `which: 'stops'` makes a page of every stop that is not `pdf: false`), each a
   * JPEG at the canvas size. Needs `composition.stops`. A transparent background comes out black: give the movie a `background`.
   */
  async exportPDF(opts: { which?: 'pages' | 'stops'; pick?: 'last' | 'first'; scale?: number; quality?: number; title?: string; motionBlur?: MotionBlurSpec; onImage?: (image: StopImage) => void } = {}): Promise<Blob> {
    warnUnknownOptions('movie.exportPDF()', opts, ['which', 'pick', 'scale', 'quality', 'title', 'motionBlur', 'onImage']);
    this._requireReady('exportPDF');
    if (this.stops.length === 0) throw new Error('pixi-effects: movie.exportPDF(): this movie has no stops, so there are no pages; add `stops` to the composition (or build it with deck())');
    const scale = opts.scale ?? 1;
    const images = await this.stopImages({
      which: opts.which, pick: opts.pick, scale, type: 'image/jpeg', quality: opts.quality ?? 0.92, as: 'blob', motionBlur: opts.motionBlur, pdf: true, onImage: opts.onImage,
    });
    const pages = await Promise.all(images.map(async i => ({
      jpeg: new Uint8Array(await (i.image as Blob).arrayBuffer()), width: Math.max(1, Math.round(this.width * scale)), height: Math.max(1, Math.round(this.height * scale)),
    })));
    return new Blob([buildPdf(pages, { title: opts.title }) as unknown as BlobPart], { type: 'application/pdf' });
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

  /** Just the chart: one `<svg>` whose geometry is in `data-*` attributes (a viewer puts a playhead on it: `pixi-effects-view`). */
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
   * One call that looks at everything `pixi-effects-check` looks at inside the page: layout issues over the whole timeline (every
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

  /** Which stop the playhead is on or has passed (-1 before the first). */
  get stopIndex(): number { return stopAtOrBefore(this.stops, this.currentFrame)?.index ?? -1; }
  /** The stop the playhead is on or has passed, or null. */
  get currentStop(): Stop | null { return stopAtOrBefore(this.stops, this.currentFrame); }
  /** Which page the playhead is in (0-based), -1 before the first stop. */
  get pageIndex(): number { return this.currentStop?.pageIndex ?? -1; }
  /** How many pages the stops make. */
  get pageCount(): number { return pageStarts(this.stops).length; }

  private _cancelStop(): void {
    this._stopAt = null;
    this._settleStopWaiters();
  }
  private _settleStopWaiters(): void {
    const waiters = this._stopWaiters; this._stopWaiters = [];
    waiters.forEach(w => w());
  }
  private _emitStop(stop: Stop): void {
    this.emit('stop', { index: stop.index, stop, pageIndex: stop.pageIndex } satisfies StopEvent);
  }
  /** Land exactly on a stop's frame, pause, and say so. */
  private async _arriveAtStop(frame: number): Promise<void> {
    this._arriving = true;
    this._stopAt = null;
    try {
      this.pause();
      await this._goto(frame);
    } catch (err) {
      console.warn('pixi-effects: could not land on a stop:', err);
      this._emitError('playback', err);
    } finally { this._arriving = false; }
    const stop = this.stops.find(s => s.frame === frame);
    if (stop) this._emitStop(stop);
    this._settleStopWaiters();
  }

  /**
   * Play to the next stop and pause exactly there (a presentation's "next"). Pressed again while it is playing toward a stop, it skips the
   * rest of the animation and lands on that stop at once. After the last stop it plays to the end. Resolves when it has landed (or
   * stopped for another reason). An ordinary `play()` ignores the stops.
   */
  async next(): Promise<void> {
    if (this._initState !== 'ready') return;
    if (this._stopAt !== null) { await this._arriveAtStop(this._stopAt); return; }
    if (this.currentFrame >= this.totalFrames) return;
    const target = nextStopAfter(this.stops, this.currentFrame);
    this._stopAt = target ? target.frame : null;
    const landed = new Promise<void>(resolve => this._stopWaiters.push(resolve));
    this.play();
    await landed;
  }

  /** Jump back to the previous stop at once (no reverse playback); from the first stop, to the start. */
  async prev(): Promise<void> {
    if (this._initState !== 'ready') return;
    this.pause();
    const target = previousStopBefore(this.stops, this.currentFrame);
    await this.gotoFrame(target ? target.frame : 0, true);
    if (target) this._emitStop(target);
  }

  /** Jump to stop `index` (0-based). */
  async goToStop(index: number): Promise<void> {
    if (this._initState !== 'ready') return;
    const stop = this.stops[index];
    if (!stop) { console.warn(`pixi-effects: movie.goToStop(${index}): there are ${this.stops.length} stops (0 to ${this.stops.length - 1})`); return; }
    this.pause();
    await this.gotoFrame(stop.frame, true);
    this._emitStop(stop);
  }

  /** Jump to the first stop of page `page` (0-based). */
  async goToPage(page: number): Promise<void> {
    const starts = pageStarts(this.stops);
    const stop = starts[page];
    if (!stop) { console.warn(`pixi-effects: movie.goToPage(${page}): there are ${starts.length} pages (0 to ${starts.length - 1})`); return; }
    await this.goToStop(stop.index);
  }

  play(): void {
    if (this._initState !== 'ready') return;
    if (this.currentFrame >= this.totalFrames) this.currentFrame = 0;
    const wasPlaying = this.isPlaying;
    this.isPlaying = true;
    const startTime = performance.now() - (this.currentFrame / this.frameRate * 1000);
    let inFlight = false;
    const tick = (time: number) => {
      if (!this.isPlaying) return;
      if (inFlight) {
        this._raf = requestAnimationFrame(tick);
        return;
      }
      const elapsed = (time - startTime) / 1000;
      const frame = Math.floor(elapsed * this.frameRate);
      if (this._stopAt !== null && frame >= this._stopAt) { void this._arriveAtStop(this._stopAt); return; }
      if (frame <= this.totalFrames) {
        inFlight = true;
        this._goto(frame)
          .catch((err) => { console.warn('pixi-effects: gotoFrame failed during playback:', err); this._emitError('playback', err); })
          .finally(() => { inFlight = false; });
        this._raf = requestAnimationFrame(tick);
      } else {
        this.pause();
        // Final frame — also catch so the play loop never leaves an unhandled rejection.
        this._goto(this.totalFrames).catch((err) => {
          console.warn('pixi-effects: final gotoFrame failed:', err);
          this._emitError('playback', err);
        });
        this.emit('ended');
        this._settleStopWaiters();
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
    if (!wasPlaying) this.emit('play');
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
    if (wasPlaying) this.emit('pause');
    if (!this._arriving) this._cancelStop();
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

  async render(options?: RenderOptions): Promise<Blob> {
    warnUnknownOptions('movie.render()', options, ['format', 'video', 'audio', 'motionBlur', 'range', 'scale', 'draft']);
    try {
      return await this._quietly(() => exportFrames(this, options));
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
    safeRun(() => this._audioContext?.close().catch(() => {}));
    this._audioContext = null;
    this._initState = 'destroyed';
  }
}

/** How far before the end of the movie its last frame is drawn (seconds): inside every layer's lifespan, far below a frame. */
const END_MARGIN = 1e-4;

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
    for (const m of Array.isArray(mask) ? mask : [mask]) if (m && typeof m === 'object' && 'type' in m) n += 1 + countLayers(m as { sequences?: unknown[] });   // an inline mask is built as a layer too
  }
  return n;
}
