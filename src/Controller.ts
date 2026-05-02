import type { Movie } from './core/Movie';

const ICONS = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 2 L13 8 L3 14 Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>',
  volumeOn: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 Q13 8 11 11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12.5 3.5 Q15.5 8 12.5 12.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  volumeOff: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 L15 11 M15 5 L11 11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 V11 M4 7 L8 11 L12 7 M3 13 H13"/></svg>',
} as const;

const STYLE_ATTR = 'data-movie-controller';

const STYLE_CSS = `
.movie-controller-wrap { position: relative; display: inline-block; line-height: 0; }
.movie-controller {
  position: absolute; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  opacity: 1;
  transition: opacity 200ms ease;
}
.movie-controller[data-state="hidden"] { opacity: 0; }
.movie-controller > * { pointer-events: auto; }

.mc-progress {
  position: relative;
  width: 100%;
  height: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.mc-progress::before {
  content: ""; position: absolute; left: 0; right: 0;
  height: 3px; background: rgba(255,255,255,0.25);
  transition: height 120ms ease;
}
.mc-progress:hover::before, .mc-progress.mc-scrubbing::before { height: 5px; }
.mc-progress-fill {
  position: absolute; left: 0; top: 50%;
  height: 3px; width: 0%;
  background: #007AFF;
  transform: translateY(-50%);
  transition: height 120ms ease;
  pointer-events: none;
}
.mc-progress:hover .mc-progress-fill,
.mc-progress.mc-scrubbing .mc-progress-fill { height: 5px; }
.mc-progress-thumb {
  position: absolute; top: 50%;
  width: 12px; height: 12px; border-radius: 50%;
  background: #007AFF;
  transform: translate(-50%, -50%) scale(0);
  transition: transform 120ms ease;
  pointer-events: none;
  left: 0%;
}
.mc-progress:hover .mc-progress-thumb,
.mc-progress.mc-scrubbing .mc-progress-thumb { transform: translate(-50%, -50%) scale(1); }

.mc-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px 8px 12px;
  background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%);
  color: #fff;
  line-height: 1;
}
.mc-btn {
  background: none; border: 0; padding: 0; margin: 0;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; opacity: 0.85; cursor: pointer;
  transition: opacity 120ms ease;
}
.mc-btn:hover { opacity: 1; }
.mc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mc-time {
  font-size: 12px; font-family: Menlo, Monaco, monospace;
  color: #fff; opacity: 0.85;
  min-width: 90px;
}
.mc-spacer { flex: 1; }

.mc-export-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
}
.mc-export-panel {
  background: #1a1a1a; color: #fff;
  border-radius: 12px; padding: 30px;
  text-align: center; min-width: 300px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.mc-export-title { font-size: 18px; margin-bottom: 20px; }
.mc-export-track {
  width: 100%; height: 8px;
  background: #333; border-radius: 4px;
  margin-bottom: 15px; overflow: hidden;
}
.mc-export-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #007AFF, #0056CC);
  transition: width 0.3s ease; border-radius: 4px;
}
.mc-export-text {
  color: #888; font-size: 14px;
  font-family: Menlo, Monaco, monospace;
}
`;

let styleRefCount = 0;

function installStyles(): void {
  if (styleRefCount === 0) {
    const el = document.createElement('style');
    el.setAttribute(STYLE_ATTR, '');
    el.textContent = STYLE_CSS;
    document.head.appendChild(el);
  }
  styleRefCount++;
}

function uninstallStyles(): void {
  styleRefCount = Math.max(0, styleRefCount - 1);
  if (styleRefCount === 0) {
    document.head.querySelectorAll(`style[${STYLE_ATTR}]`).forEach((n) => n.remove());
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function frameToPercent(frame: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0;
  const f = Math.min(Math.max(frame, 0), totalFrames);
  return (f / totalFrames) * 100;
}

export function pxToFrame(clientX: number, rect: { left: number; width: number }, totalFrames: number): number {
  if (rect.width <= 0 || totalFrames <= 0) return 0;
  const ratio = (clientX - rect.left) / rect.width;
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return Math.round(clamped * totalFrames);
}

export interface ControllerOptions {
  canvas: HTMLCanvasElement;
  showExportButton?: boolean;
  enableKeyboardShortcuts?: boolean;
  className?: string;
}

interface ResolvedOptions {
  canvas: HTMLCanvasElement;
  showExportButton: boolean;
  enableKeyboardShortcuts: boolean;
  className: string;
}

export class Controller {
  movie: Movie;
  options: ResolvedOptions;

  private root: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private wrappedHere = false;
  private destroyed = false;

  private progressEl!: HTMLDivElement;
  private progressFillEl!: HTMLDivElement;
  private progressThumbEl!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private timeEl!: HTMLSpanElement;
  private exportBtn: HTMLButtonElement | null = null;
  private isScrubbing = false;
  private wasPlayingBeforeScrub = false;
  private activePointerId: number | null = null;

  constructor(movie: Movie, options: ControllerOptions) {
    if (!options || !options.canvas) {
      throw new Error('Controller requires options.canvas (HTMLCanvasElement).');
    }
    this.movie = movie;
    this.options = {
      canvas: options.canvas,
      showExportButton: options.showExportButton ?? true,
      enableKeyboardShortcuts: options.enableKeyboardShortcuts ?? true,
      className: options.className ?? 'movie-controller',
    };

    installStyles();
    this.wrapper = this.ensurePositioningContext(this.options.canvas);
    this.root = document.createElement('div');
    this.root.className = this.options.className;
    this.wrapper.appendChild(this.root);
    this.buildBar();
    this.bindMovieEvents();
    this.bindPlayButton();
    this.bindScrubbing();
  }

  private buildBar(): void {
    this.root.innerHTML = `
      <div class="mc-progress" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="${this.movie.totalFrames}" aria-valuenow="0">
        <div class="mc-progress-fill"></div>
        <div class="mc-progress-thumb"></div>
      </div>
      <div class="mc-bar">
        <button class="mc-btn mc-play" aria-label="Play">${ICONS.play}</button>
        <button class="mc-btn mc-mute" aria-label="Mute">${ICONS.volumeOn}</button>
        <span class="mc-time">0:00 / 0:00</span>
        <div class="mc-spacer"></div>
        ${this.options.showExportButton ? `<button class="mc-btn mc-export" aria-label="Export">${ICONS.download}</button>` : ''}
      </div>
    `;
    this.progressEl = this.root.querySelector('.mc-progress') as HTMLDivElement;
    this.progressFillEl = this.root.querySelector('.mc-progress-fill') as HTMLDivElement;
    this.progressThumbEl = this.root.querySelector('.mc-progress-thumb') as HTMLDivElement;
    this.playBtn = this.root.querySelector('.mc-play') as HTMLButtonElement;
    this.muteBtn = this.root.querySelector('.mc-mute') as HTMLButtonElement;
    this.timeEl = this.root.querySelector('.mc-time') as HTMLSpanElement;
    this.exportBtn = this.root.querySelector('.mc-export') as HTMLButtonElement | null;
  }

  private ensurePositioningContext(canvas: HTMLCanvasElement): HTMLDivElement {
    const parent = canvas.parentElement;
    if (!parent) {
      throw new Error('Controller: canvas must be attached to the DOM before constructing.');
    }
    const pos = getComputedStyle(parent).position;
    if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') {
      return parent as HTMLDivElement;
    }
    const wrap = document.createElement('div');
    wrap.className = 'movie-controller-wrap';
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';
    wrap.style.lineHeight = '0';
    parent.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
    this.wrappedHere = true;
    return wrap;
  }

  private bindMovieEvents(): void {
    this.movie.on('ready', () => {
      this.progressEl.setAttribute('aria-valuemax', String(this.movie.totalFrames));
      this.refreshTime(0);
      this.refreshProgress(0);
    });
    this.movie.on('frame', ({ frame, totalFrames }) => {
      if (!this.isScrubbing) {
        this.refreshProgress(frame, totalFrames);
      }
      this.refreshTime(frame);
    });
  }

  private bindPlayButton(): void {
    this.playBtn.addEventListener('click', () => {
      if (this.movie.isPlaying) this.movie.pause();
      else this.movie.play();
      this.refreshPlayIcon();
    });
  }

  private refreshPlayIcon(): void {
    this.playBtn.innerHTML = this.movie.isPlaying ? ICONS.pause : ICONS.play;
    this.playBtn.setAttribute('aria-label', this.movie.isPlaying ? 'Pause' : 'Play');
  }

  private refreshProgress(frame: number, totalFrames?: number): void {
    const total = totalFrames ?? this.movie.totalFrames;
    const pct = frameToPercent(frame, total);
    this.progressFillEl.style.width = `${pct}%`;
    this.progressThumbEl.style.left = `${pct}%`;
    this.progressEl.setAttribute('aria-valuenow', String(frame));
  }

  private refreshTime(frame: number): void {
    const fr = this.movie.frameRate || 1;
    const cur = frame / fr;
    const total = this.movie.totalFrames / fr;
    this.timeEl.textContent = `${formatTime(cur)} / ${formatTime(total)}`;
  }

  private bindScrubbing(): void {
    const onDown = (e: PointerEvent) => {
      this.isScrubbing = true;
      this.activePointerId = e.pointerId;
      this.wasPlayingBeforeScrub = this.movie.isPlaying;
      if (this.movie.isPlaying) {
        this.movie.pause();
        this.refreshPlayIcon();
      }
      this.progressEl.classList.add('mc-scrubbing');
      try { this.progressEl.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
      this.seekFromPointer(e.clientX);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.isScrubbing) return;
      this.seekFromPointer(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      if (!this.isScrubbing) return;
      this.seekFromPointer(e.clientX);
      this.isScrubbing = false;
      this.activePointerId = null;
      this.progressEl.classList.remove('mc-scrubbing');
      try { this.progressEl.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
      if (this.wasPlayingBeforeScrub) {
        this.movie.play();
        this.refreshPlayIcon();
      }
    };
    this.progressEl.addEventListener('pointerdown', onDown);
    this.progressEl.addEventListener('pointermove', onMove);
    this.progressEl.addEventListener('pointerup', onUp);
    this.progressEl.addEventListener('pointercancel', onUp);
  }

  private seekFromPointer(clientX: number): void {
    const rect = this.progressEl.getBoundingClientRect();
    const frame = pxToFrame(clientX, { left: rect.left, width: rect.width }, this.movie.totalFrames);
    this.refreshProgress(frame);
    void this.movie.gotoFrame(frame);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
    if (this.wrappedHere) {
      const parent = this.wrapper.parentElement;
      const canvas = this.options.canvas;
      if (parent) {
        parent.insertBefore(canvas, this.wrapper);
        this.wrapper.remove();
      }
    }
    uninstallStyles();
  }
}
