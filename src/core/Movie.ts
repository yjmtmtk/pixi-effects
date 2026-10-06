import * as PIXI from 'pixi.js';
import { Application, Container, Culler, Rectangle, extensions, CullerPlugin } from 'pixi.js';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { loadAssetBundle } from './AssetLoader';
import { CompositionSequence } from '../sequences/Composition';
import { mixdown, limitMix, type MixStats } from './AudioMixer';
import { analyzeAudio, type AudioReport, type AudioInspectOptions } from './inspectAudio';
import { exportFrames } from './Renderer';
import { expandTransitions, carryTransitionWindows } from './Transitions';
import { inspectScene, type InspectReport, type InspectOptions } from './inspect';
import { pickFrames, sheetLayout } from './frames';
import { warnUnknownOptions } from './options';
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
}

export interface RenderOptions {
  format?: 'mp4' | 'mov' | 'webm' | 'mkv';
  video?: { codec?: string; bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' };
  audio?: { codec?: string; bitrate?: 'very-low' | 'low' | 'medium' | 'high' | 'very-high' };
}

export interface SnapshotOptions {
  /** Output size relative to the canvas (default 1). */
  scale?: number;
  /** `'image/png'` (default) or `'image/jpeg'`. */
  type?: 'image/png' | 'image/jpeg';
  /** Return a `data:` URL string instead of a Blob (handy for scripts that can only return text). */
  as?: 'blob' | 'dataURL';
}

export interface ContactSheetOptions {
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

export interface FrameEvent { frame: number; totalFrames: number }
export interface ProgressEvent { progress: number; frame: number; totalFrames: number }

type Listener = (...args: any[]) => void;

export class Movie {
  private _events: Record<string, Listener[]> = {};
  private _initState: 'idle' | 'pending' | 'ready' | 'destroyed' = 'idle';
  app: Application | null = null;
  timeline: ReturnType<typeof gsap.timeline> | null = null;
  audioBuffer: AudioBuffer | null = null;
  audioSource: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;
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
  private _rootContainer: Container | null = null;
  private _raf: number | null = null;
  /** What went into the mix, and its peak before limiting — kept for inspectAudio(). */
  private _audioSources: AudioDescriptor[] = [];
  private _mixStats: MixStats | null = null;

  on(event: 'ready', fn: () => void): this;
  on(event: 'frame', fn: (e: FrameEvent) => void): this;
  on(event: 'progress', fn: (e: ProgressEvent) => void): this;
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

  private _ensureAudioContext(): AudioContext {
    if (!this._audioContext) {
      const Ctx = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this._audioContext = new Ctx();
    }
    return this._audioContext;
  }

  async init(options: MovieOptions = {}): Promise<void> {
    warnUnknownOptions('movie.init()', options, ['width', 'height', 'duration', 'frameRate', 'background', 'canvas', 'assets', 'composition']);
    this._initState = 'pending';
    try {
      this.width = options.width ?? 1920;
      this.height = options.height ?? 1080;
      this.duration = options.duration ?? 10;
      this.frameRate = options.frameRate ?? 30;
      this.totalFrames = Math.round(this.duration * this.frameRate);
      this.background = options.background ?? '#000000';

      this.timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
      this.timeline.add(gsap.to({}, { duration: this.duration }));

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
      await loadAssetBundle(options.assets ?? [], audioContext);

      const rootShape: CompositionShape = { width: this.width, height: this.height, duration: this.duration };
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
      await composition.build();
      this._rootSequence = composition;
      if (composition.target) root.addChild(composition.target);
      composition.bindTimeline(this.timeline);

      const audios: AudioDescriptor[] = [];
      composition.collectAudio(audios, 0);
      if (audios.length > 0) {
        this.audioBuffer = await mixdown(audios, this.duration, audioContext.sampleRate);
        if (this.audioBuffer) this._mixStats = limitMix(this.audioBuffer, audios);
      }
      this._audioSources = audios;

      this.timeline.progress(1).progress(0);
      await this._awaitVideoFrames();
      this._updateSpace();
      this._renderNow();

      this._initState = 'ready';
      this.emit('ready');
    } catch (err) {
      try { await this.destroy(); } catch (cleanupErr) {
        console.warn('pixi-effects: cleanup after init failure also threw:', cleanupErr);
      }
      throw err;
    }
  }

  async gotoFrame(frame: number, force = false): Promise<void> {
    if (this._initState !== 'ready') return;
    if (!force && this.currentFrame === frame) return;
    this.currentFrame = Math.max(0, Math.min(frame, this.totalFrames));
    this.timeline!.time(this.currentFrame / this.frameRate);
    await this._awaitVideoFrames();
    this._updateSpace();
    this._renderNow();
    this.emit('frame', { frame: this.currentFrame, totalFrames: this.totalFrames } satisfies FrameEvent);
  }

  private async _awaitVideoFrames(): Promise<void> {
    if (!this._rootSequence) return;
    const collected: VideoLike[] = [];
    collectVideoSequences(this._rootSequence, collected);
    const t = this.currentFrame / this.frameRate;
    await Promise.all(collected.map(v => {
      const local = t - (v.absoluteStart ?? v.at);
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
    warnUnknownOptions('movie.snapshot()', opts, ['scale', 'type', 'as']);
    this._requireReady('snapshot');
    await this.gotoFrame(clampFrame(frame, this.totalFrames), true);
    const scale = opts.scale ?? 1;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(this.width * scale));
    out.height = Math.max(1, Math.round(this.height * scale));
    out.getContext('2d')!.drawImage(this.app!.canvas as HTMLCanvasElement, 0, 0, out.width, out.height);
    return encodeCanvas(out, opts.type ?? 'image/png', opts.as ?? 'blob');
  }

  /**
   * Several frames on ONE image, each labelled with its frame number and time — the cheapest way to
   * check a whole animation by eye. Restores the current frame afterwards.
   */
  async contactSheet(opts?: ContactSheetOptions & { as?: 'blob' }): Promise<Blob>;
  async contactSheet(opts: ContactSheetOptions & { as: 'dataURL' }): Promise<string>;
  async contactSheet(opts: ContactSheetOptions = {}): Promise<Blob | string> {
    warnUnknownOptions('movie.contactSheet()', opts, ['frames', 'times', 'count', 'columns', 'cellWidth', 'as']);
    this._requireReady('contactSheet');
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
    const back = this.currentFrame;
    try {
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
        await this.gotoFrame(f, true);
        const { x, y } = L.positions[i]!;
        g.drawImage(this.app!.canvas as HTMLCanvasElement, x, y + LABEL_H, L.cellW, L.cellH);
        g.fillStyle = '#e8ecf8';
        g.font = '600 15px system-ui, sans-serif';
        g.textBaseline = 'middle';
        g.fillText(`frame ${f}  ·  ${(f / this.frameRate).toFixed(2)}s`, x + 8, y + LABEL_H / 2);
      }
    } finally {
      await this.gotoFrame(back, true);
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
   * The soundtrack, measured: when every audio layer plays, how loud the mix is over time, and `issues`
   * (limiting, inaudible layers, sounds cut off by the end). Use it to CHECK sound you cannot hear.
   */
  inspectAudio(opts: AudioInspectOptions = {}): AudioReport {
    warnUnknownOptions('movie.inspectAudio()', opts, ['window']);
    this._requireReady('inspectAudio');
    return analyzeAudio(this.audioBuffer, this._audioSources, this._mixStats, this.duration, opts);
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
    this._rootSequence?.syncFrame();
    Culler.shared.cull(app.stage, app.renderer.screen, false);
    app.renderer.render({ container: app.stage });
  }

  private _requireReady(what: string): void {
    if (this._initState !== 'ready' || !this._rootSequence || !this.app) {
      throw new Error(`pixi-effects: movie.${what}() needs a ready movie — await movie.init(...) first`);
    }
  }

  /** Projects every `threeD` layer for the current frame (see src/space). */
  private _updateSpace(): void {
    if (!this._rootSequence || !this.app) return;
    this._rootSequence.updateSpace(this.currentFrame / this.frameRate, this.app.renderer);
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
      if (frame <= this.totalFrames) {
        inFlight = true;
        this.gotoFrame(frame)
          .catch((err) => { console.warn('pixi-effects: gotoFrame failed during playback:', err); })
          .finally(() => { inFlight = false; });
        this._raf = requestAnimationFrame(tick);
      } else {
        this.pause();
        // Final frame — also catch so the play loop never leaves an unhandled rejection.
        this.gotoFrame(this.totalFrames).catch((err) => {
          console.warn('pixi-effects: final gotoFrame failed:', err);
        });
      }
    };
    this._raf = requestAnimationFrame(tick);

    if (this.audioBuffer) {
      const ctx = this._ensureAudioContext();
      this.audioSource = ctx.createBufferSource();
      this.audioSource.buffer = this.audioBuffer;
      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = this._muted ? 0 : this._volume;
      this.audioSource.connect(this.gainNode).connect(ctx.destination);
      this.audioSource.start(0, this.currentFrame / this.frameRate);
    }
    if (!wasPlaying) this.emit('play');
  }

  pause(): void {
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;
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
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) this.gainNode.gain.value = this._muted ? 0 : this._volume;
  }
  get volume(): number { return this._volume; }
  set muted(v: boolean) {
    this._muted = !!v;
    if (this.gainNode) this.gainNode.gain.value = this._muted ? 0 : this._volume;
  }
  get muted(): boolean { return this._muted; }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }

  async render(options?: RenderOptions): Promise<Blob> {
    warnUnknownOptions('movie.render()', options, ['format', 'video', 'audio']);
    return await exportFrames(this, options);
  }

  async destroy(): Promise<void> {
    safeRun(() => this.pause());
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

const clampFrame = (f: number, last: number): number => Math.max(0, Math.min(Math.round(f), last));

function encodeCanvas(canvas: HTMLCanvasElement, type: string, as: 'blob' | 'dataURL'): Promise<Blob | string> {
  if (as === 'dataURL') return Promise.resolve(canvas.toDataURL(type));
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('pixi-effects: could not encode the image'))), type));
}

interface VideoLike {
  at: number;
  duration: number | undefined;
  absoluteStart?: number | null;
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
export function collectVideoSequences(seq: Sequence, out: VideoLike[]): void {
  if (typeof (seq as Sequence & Partial<VideoLike>).awaitFrameAt === 'function') {
    out.push(seq as unknown as VideoLike);
  }
  if (seq.maskSequence) collectVideoSequences(seq.maskSequence, out);
  for (const child of (seq as Sequence & { _children?: Sequence[] })._children ?? []) {
    collectVideoSequences(child, out);
  }
}
