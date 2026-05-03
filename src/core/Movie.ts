import * as PIXI from 'pixi.js';
import { Application, Container, Rectangle, extensions, CullerPlugin } from 'pixi.js';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { loadAssetBundle } from './AssetLoader';
import { CompositionSequence } from '../sequences/Composition';
import { mixdown } from './AudioMixer';
import { exportFrames } from './Renderer';
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

  on(event: 'ready', fn: () => void): this;
  on(event: 'frame', fn: (e: FrameEvent) => void): this;
  on(event: 'progress', fn: (e: ProgressEvent) => void): this;
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

      this.app = new Application();
      await this.app.init({
        width: this.width,
        height: this.height,
        background: this.background,
        antialias: true,
        resolution: 1,
        autoDensity: false,
        preference: 'webgl',
        preserveDrawingBuffer: true,
        canvas: options.canvas,
      });

      const root = new Container();
      root.cullable = true;
      root.cullableChildren = true;
      root.cullArea = new Rectangle(0, 0, this.width, this.height);
      this.app.stage.addChild(root);
      this._rootContainer = root;

      const audioContext = this._ensureAudioContext();
      await loadAssetBundle(options.assets ?? [], audioContext);

      const rootShape: CompositionShape = { width: this.width, height: this.height, duration: this.duration };
      const rootSeqSpec = {
        type: 'composition' as const,
        width: this.width,
        height: this.height,
        duration: this.duration,
        ...options.composition,
      };
      const composition = new CompositionSequence(rootSeqSpec, null, rootShape);
      await composition.build();
      this._rootSequence = composition;
      if (composition.target) root.addChild(composition.target);
      composition.bindTimeline(this.timeline);

      const audios: AudioDescriptor[] = [];
      composition.collectAudio(audios, 0);
      if (audios.length > 0) {
        this.audioBuffer = await mixdown(audios, this.duration, audioContext.sampleRate);
      }

      this.timeline.progress(1).progress(0);
      this.app.renderer.render({ container: this.app.stage });

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
    this.app?.renderer?.render({ container: this.app.stage });
    this.emit('frame', { frame: this.currentFrame, totalFrames: this.totalFrames } satisfies FrameEvent);
  }

  private async _awaitVideoFrames(): Promise<void> {
    if (!this._rootSequence) return;
    const collected: VideoLike[] = [];
    collectVideoSequences(this._rootSequence, collected);
    const t = this.currentFrame / this.frameRate;
    await Promise.all(collected.map(v => {
      const local = t - v.at;
      if (local < 0 || local > (v.duration ?? 0)) return Promise.resolve();
      return v.awaitFrameAt(local);
    }));
  }

  play(): void {
    if (this._initState !== 'ready') return;
    if (this.currentFrame >= this.totalFrames) this.currentFrame = 0;
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
    safeRun(() => this._audioContext?.close().catch(() => {}));
    this._audioContext = null;
    this._initState = 'destroyed';
  }
}

interface VideoLike {
  at: number;
  duration: number | undefined;
  awaitFrameAt(t: number): Promise<void>;
}

function safeRun(fn: () => unknown): void {
  try { fn(); } catch (e) { console.warn('pixi-effects: cleanup step threw, continuing:', e); }
}

function collectVideoSequences(seq: Sequence, out: VideoLike[]): void {
  if (typeof (seq as Sequence & Partial<VideoLike>).awaitFrameAt === 'function') {
    out.push(seq as unknown as VideoLike);
  }
  for (const child of (seq as Sequence & { _children?: Sequence[] })._children ?? []) {
    collectVideoSequences(child, out);
  }
}
