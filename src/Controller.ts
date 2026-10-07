import type { Movie } from './core/Movie';
import { warnUnknownOptions } from './core/options';

const ICONS = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 2 L13 8 L3 14 Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>',
  volumeOn: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 Q13 8 11 11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12.5 3.5 Q15.5 8 12.5 12.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  volumeOff: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 L15 11 M15 5 L11 11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 V11 M4 7 L8 11 L12 7 M3 13 H13"/></svg>',
  fullscreenEnter: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6 V2 H6 M14 6 V2 H10 M2 10 V14 H6 M14 10 V14 H10"/></svg>',
  present: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2.5 H14 V10.5 H2 Z M8 10.5 V13.5 M5 13.5 H11"/></svg>',
  fullscreenExit: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 V6 H2 M10 2 V6 H14 M6 14 V10 H2 M10 14 V10 H14"/></svg>',
} as const;

const STYLE_ATTR = 'data-movie-controller';

/** The bar's default stylesheet. Its colours and sizes are CSS custom properties (`--mc-accent`, `--mc-fg`, `--mc-track`, `--mc-bar-bg`, `--mc-track-height`, `--mc-font`): set them in your page CSS, or with the `theme` option. */
export const CONTROLLER_CSS = `
.movie-controller-wrap { position: relative; display: inline-block; line-height: 0; }
.movie-controller {
  position: absolute;
  pointer-events: none;
  font-family: var(--mc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
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
  outline: none;
}
.mc-progress:focus-visible {
  outline: 2px solid var(--mc-accent, #007AFF);
  outline-offset: 2px;
}
.mc-progress::before {
  content: ""; position: absolute; left: 12px; right: 12px;
  height: var(--mc-track-height, 3px); background: var(--mc-track, rgba(255,255,255,0.25));
  transition: height 120ms ease;
}
.mc-progress:hover::before, .mc-progress.mc-scrubbing::before { height: calc(var(--mc-track-height, 3px) + 2px); }
.mc-stops { position: absolute; left: 12px; right: 12px; top: 0; bottom: 0; pointer-events: none; }
.mc-stop-tick { position: absolute; top: 50%; width: 7px; height: 7px; transform: translate(-50%, -50%); border-radius: 50%; background: var(--mc-fg, #fff); box-shadow: 0 0 0 1.5px rgba(0,0,0,0.5); }
.mc-stop-page { width: 11px; height: 11px; box-shadow: 0 0 0 2.5px var(--mc-accent, #007AFF), 0 0 0 4px rgba(0,0,0,0.35); }
.mc-progress-fill {
  position: absolute; left: 12px; top: 50%;
  height: var(--mc-track-height, 3px);
  width: calc((100% - 24px) * var(--mc-fill, 0));
  background: var(--mc-accent, #007AFF);
  transform: translateY(-50%);
  transition: height 120ms ease;
  pointer-events: none;
}
.mc-progress:hover .mc-progress-fill,
.mc-progress.mc-scrubbing .mc-progress-fill { height: calc(var(--mc-track-height, 3px) + 2px); }
.mc-progress-thumb {
  position: absolute; top: 50%;
  left: calc(12px + (100% - 24px) * var(--mc-fill, 0));
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--mc-accent, #007AFF);
  transform: translate(-50%, -50%) scale(0);
  transition: transform 120ms ease;
  pointer-events: none;
}
.mc-progress:hover .mc-progress-thumb,
.mc-progress.mc-scrubbing .mc-progress-thumb { transform: translate(-50%, -50%) scale(1); }

.mc-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px 8px 12px;
  background: var(--mc-bar-bg, linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%));
  color: var(--mc-fg, #fff);
  line-height: 1;
}
.mc-btn {
  background: none; border: 0; padding: 0; margin: 0;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--mc-fg, #fff); opacity: 0.85; cursor: pointer;
  transition: opacity 120ms ease;
}
.mc-btn:hover { opacity: 1; }
.mc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mc-time {
  font-size: 12px; font-family: Menlo, Monaco, monospace;
  color: var(--mc-fg, #fff); opacity: 0.85;
  min-width: 90px;
}
.mc-spacer { flex: 1; }

.mc-volume { display: flex; align-items: center; }
.mc-vol-slider {
  position: relative;
  width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-left: 0;
  outline: none;
  transition: width 200ms ease, margin-left 200ms ease;
  overflow: hidden;
}
.mc-volume:hover .mc-vol-slider,
.mc-volume:focus-within .mc-vol-slider,
.mc-vol-slider.mc-scrubbing {
  width: 70px;
  margin-left: 6px;
}
.mc-vol-slider:focus-visible { outline: 2px solid var(--mc-accent, #007AFF); outline-offset: 2px; }
.mc-vol-slider::before {
  content: ""; position: absolute; left: 4px; right: 4px;
  height: 3px; background: var(--mc-track, rgba(255,255,255,0.25)); border-radius: 2px;
}
.mc-vol-fill {
  position: absolute; left: 4px; top: 50%;
  height: 3px;
  width: calc((100% - 8px) * var(--mc-volume, 1));
  background: var(--mc-fg, #fff);
  transform: translateY(-50%);
  border-radius: 2px;
  pointer-events: none;
}
.mc-vol-thumb {
  position: absolute; top: 50%;
  left: calc(4px + (100% - 8px) * var(--mc-volume, 1));
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--mc-fg, #fff);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

[data-mc-wrap]:fullscreen {
  width: 100vw; height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: #000;
}
[data-mc-wrap]:fullscreen > canvas {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: contain;
  border-radius: 0;
}

.mc-settings-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 12px;
  background: rgba(20, 20, 20, 0.96);
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 180px;
  color: #fff;
  font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mc-settings-popover[data-open="false"] { display: none; }
.mc-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mc-settings-row > span { color: rgba(255,255,255,0.85); }
.mc-settings-row > select {
  font: inherit;
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
}
.mc-export-confirm {
  margin-top: 4px;
  width: 100%;
  background: var(--mc-accent, #007AFF);
  color: #fff;
  border: 0;
  border-radius: 4px;
  padding: 6px 10px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease;
}
.mc-export-confirm:hover { background: #0066d6; }
.mc-export-confirm:disabled { background: rgba(255,255,255,0.18); cursor: not-allowed; }

.mc-export-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; justify-content: center; align-items: center;
  z-index: 2;
}
.mc-export-panel {
  background: rgba(20,20,20,0.96); color: #fff;
  border-radius: 8px; padding: 16px 20px;
  text-align: center; min-width: 200px; max-width: 80%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.mc-export-title { font-size: 13px; margin-bottom: 10px; opacity: 0.9; }
.mc-export-track {
  width: 100%; height: 6px;
  background: rgba(255,255,255,0.15); border-radius: 3px;
  margin-bottom: 8px; overflow: hidden;
}
.mc-export-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--mc-accent, #007AFF), var(--mc-accent, #0056CC));
  transition: width 0.3s ease; border-radius: 3px;
}
.mc-export-text {
  color: rgba(255,255,255,0.7); font-size: 11px;
  font-family: Menlo, Monaco, monospace;
}
`;

let styleRefCount = 0;

function installStyles(): void {
  if (styleRefCount === 0) {
    const el = document.createElement('style');
    el.setAttribute(STYLE_ATTR, '');
    el.textContent = CONTROLLER_CSS;
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

export function pxToFraction(clientX: number, rect: { left: number; width: number }, inset = 0): number {
  const innerLeft = rect.left + inset;
  const innerWidth = Math.max(0, rect.width - 2 * inset);
  if (innerWidth <= 0) return 0;
  const ratio = (clientX - innerLeft) / innerWidth;
  return Math.min(Math.max(ratio, 0), 1);
}

/** The JPEG quality of a PDF page for each quality choice of the panel. */
const PDF_QUALITY = { 'low': 0.6, 'medium': 0.75, 'high': 0.88, 'very-high': 0.95 } as const;

export function extensionForMimeType(mime: string): string {
  const t = (mime || '').toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime') || t.includes('mov')) return 'mov';
  if (t.includes('matroska') || t.includes('mkv')) return 'mkv';
  return 'mp4';
}

/**
 * The look of the bar. Each key sets a CSS custom property on the bar (so you can also set `--mc-accent` … in your own CSS, on the
 * canvas's parent or on `:root`). `null` puts a value back to the default.
 */
export interface ControllerTheme {
  /** The colour of the progress bar, its thumb and the focus rings. Default `#007AFF` (blue). */
  accent?: string | null;
  /** Icons, the time and the volume slider. Default `#fff`. */
  foreground?: string | null;
  /** The unfilled part of the progress and volume bars. Default `rgba(255,255,255,0.25)`. */
  track?: string | null;
  /** The background behind the buttons: any CSS background, e.g. a gradient. Default: black fading to transparent upward. */
  barBackground?: string | null;
  /** Thickness of the progress bar in px (a number) or any CSS length. Default 3. */
  trackHeight?: number | string | null;
  /** `font-family` of the bar. */
  font?: string | null;
}

const THEME_PROPERTIES: Record<keyof ControllerTheme, string> = {
  accent: '--mc-accent', foreground: '--mc-fg', track: '--mc-track', barBackground: '--mc-bar-bg', trackHeight: '--mc-track-height', font: '--mc-font',
};

export interface ControllerOptions {
  canvas: HTMLCanvasElement;
  /** Colours and sizes of the bar, see {@link ControllerTheme}. Can be changed later with `controller.setTheme()`. */
  theme?: ControllerTheme;
  showExportButton?: boolean;
  enableKeyboardShortcuts?: boolean;
  /** A click (or tap) on the picture plays / pauses, like a `<video>` element. Default true; `false` leaves the canvas alone. */
  clickToPlay?: boolean;
  /** A movie with `stops` gets a Present button that starts a {@link Presenter} (keys, click and swipe move through the stops). Default true; `false` keeps only the marks on the seek bar. */
  present?: boolean;
  /** A movie with `stops`: the play button (and a click on the picture, and Space) plays to the next stop and pauses there, like a slide. Default true; `false` plays straight through to the end. */
  pauseAtStops?: boolean;
  className?: string;
}

interface ResolvedOptions {
  canvas: HTMLCanvasElement;
  showExportButton: boolean;
  enableKeyboardShortcuts: boolean;
  clickToPlay: boolean;
  present: boolean;
  pauseAtStops: boolean;
  className: string;
}

export class Controller {
  movie: Movie;
  options: ResolvedOptions;

  private root: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private wrappedHere = false;
  /** The canvas's own inline width / height, as the page wrote them (we override them while the wrapper is fitted). */
  private canvasInlineWidth = '';
  private canvasInlineHeight = '';
  private fitWrapHandler: (() => void) | null = null;
  private fitObserver: ResizeObserver | null = null;
  private destroyed = false;

  private progressEl!: HTMLDivElement;
  private progressFillEl!: HTMLDivElement;
  private progressThumbEl!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private timeEl!: HTMLSpanElement;
  private exportBtn: HTMLButtonElement | null = null;
  private settingsPopoverEl: HTMLDivElement | null = null;
  private settingsFormatSelect: HTMLSelectElement | null = null;
  private settingsQualitySelect: HTMLSelectElement | null = null;
  private exportConfirmBtn: HTMLButtonElement | null = null;
  private exportFormat: 'mp4' | 'webm' | 'mov' | 'pdf' | 'pdf-steps' = 'mp4';
  private exportQuality: 'low' | 'medium' | 'high' | 'very-high' = 'high';
  private settingsOpen = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly HIDE_DELAY_MS = 2500;
  private static readonly PROGRESS_INSET_PX = 12;
  private isScrubbing = false;
  private wasPlayingBeforeScrub = false;
  private activePointerId: number | null = null;
  private isExporting = false;
  private exportPages: { done: number; total: number } | null = null;
  private exportOverlay: HTMLDivElement | null = null;
  private exportFillEl: HTMLDivElement | null = null;
  private exportTextEl: HTMLDivElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private settingsKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private settingsOutsideHandler: ((e: PointerEvent) => void) | null = null;
  private onReady: (() => void) | null = null;
  private presenter: { destroy(): void } | null = null;
  private presentBtn: HTMLButtonElement | null = null;
  private onFrame: ((e: { frame: number; totalFrames: number }) => void) | null = null;
  private onPlay: (() => void) | null = null;
  private onPause: (() => void) | null = null;
  private onProgress: ((e: { progress: number; frame: number; totalFrames: number }) => void) | null = null;
  private onWrapPointerMove: (() => void) | null = null;
  private onWrapMouseLeave: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private volumeSliderEl: HTMLDivElement | null = null;
  private volumeContainerEl: HTMLDivElement | null = null;
  private fullscreenBtn: HTMLButtonElement | null = null;
  private isVolumeScrubbing = false;
  private canvasClickHandler: (() => void) | null = null;
  private canvasPointerDownHandler: (() => void) | null = null;
  private canvasCursor = '';
  /** Set when a pointerdown on the canvas closed the export popover: the click that follows must not play / pause. */
  private swallowCanvasClick = false;
  private fullscreenChangeHandler: (() => void) | null = null;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  /** Ends a drag the pointerup of which never arrives (see bindScrubbing). */
  private windowBlurHandler: (() => void) | null = null;

  constructor(movie: Movie, options: ControllerOptions) {
    if (!options || !options.canvas) {
      throw new Error('Controller requires options.canvas (HTMLCanvasElement).');
    }
    this.movie = movie;
    this.options = {
      canvas: options.canvas,
      showExportButton: options.showExportButton ?? true,
      enableKeyboardShortcuts: options.enableKeyboardShortcuts ?? true,
      clickToPlay: options.clickToPlay ?? true,
      present: options.present ?? true,
      pauseAtStops: options.pauseAtStops ?? true,
      className: options.className ?? 'movie-controller',
    };

    installStyles();
    this.wrapper = this.ensurePositioningContext(this.options.canvas);
    this.root = document.createElement('div');
    this.root.className = this.options.className;
    this.wrapper.appendChild(this.root);
    this.buildBar();
    this.setTheme(options.theme ?? {});
    this.bindFitWrap();
    this.syncRootToCanvas();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncRootToCanvas());
      this.resizeObserver.observe(this.options.canvas);
      // Also observe the wrapper: when its size changes (browser resize, sibling
      // panels resizing) the canvas's position can shift without its own size
      // changing, which canvas-only observation would miss.
      this.resizeObserver.observe(this.wrapper);
    }
    this.root.setAttribute('data-state', 'visible');
    this.bindMovieEvents();
    this.refreshStops();
    this.bindPlayButton();
    if (this.options.clickToPlay) this.bindCanvasClick();
    this.bindScrubbing();
    this.bindMuteButton();
    this.bindVolumeSlider();
    this.bindExportPopover();
    this.bindFullscreen();
    this.bindVisibility();
    if (this.options.enableKeyboardShortcuts) this.bindKeyboard();
  }

  private buildBar(): void {
    const popoverHtml = this.options.showExportButton ? `
      <div class="mc-settings-popover" role="dialog" aria-label="Export settings" data-open="false">
        <label class="mc-settings-row">
          <span>Format</span>
          <select class="mc-settings-format">
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="mov">MOV</option>
          </select>
        </label>
        <label class="mc-settings-row">
          <span>Quality</span>
          <select class="mc-settings-quality">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high" selected>High</option>
            <option value="very-high">Very High</option>
          </select>
        </label>
        <button type="button" class="mc-export-confirm">Download</button>
      </div>
    ` : '';
    this.root.innerHTML = `
      <div class="mc-progress" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="${this.movie.totalFrames}" aria-valuenow="0">
        <div class="mc-progress-fill"></div>
        <div class="mc-progress-thumb"></div>
      </div>
      <div class="mc-bar">
        ${popoverHtml}
        <button class="mc-btn mc-play" aria-label="Play">${ICONS.play}</button>
        <div class="mc-volume">
          <button class="mc-btn mc-mute" aria-label="Mute">${ICONS.volumeOn}</button>
          <div class="mc-vol-slider" role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
            <div class="mc-vol-fill"></div>
            <div class="mc-vol-thumb"></div>
          </div>
        </div>
        <span class="mc-time">0:00 / 0:00</span>
        <div class="mc-spacer"></div>
        ${this.options.showExportButton ? `<button class="mc-btn mc-export" aria-label="Export" aria-expanded="false">${ICONS.download}</button>` : ''}
        <button class="mc-btn mc-fullscreen" aria-label="Enter fullscreen">${ICONS.fullscreenEnter}</button>
      </div>
    `;
    this.progressEl = this.root.querySelector('.mc-progress') as HTMLDivElement;
    this.progressFillEl = this.root.querySelector('.mc-progress-fill') as HTMLDivElement;
    this.progressThumbEl = this.root.querySelector('.mc-progress-thumb') as HTMLDivElement;
    this.playBtn = this.root.querySelector('.mc-play') as HTMLButtonElement;
    this.muteBtn = this.root.querySelector('.mc-mute') as HTMLButtonElement;
    this.timeEl = this.root.querySelector('.mc-time') as HTMLSpanElement;
    this.exportBtn = this.root.querySelector('.mc-export') as HTMLButtonElement | null;
    this.settingsPopoverEl = this.root.querySelector('.mc-settings-popover') as HTMLDivElement | null;
    this.settingsFormatSelect = this.root.querySelector('.mc-settings-format') as HTMLSelectElement | null;
    this.settingsQualitySelect = this.root.querySelector('.mc-settings-quality') as HTMLSelectElement | null;
    this.exportConfirmBtn = this.root.querySelector('.mc-export-confirm') as HTMLButtonElement | null;
    this.volumeSliderEl = this.root.querySelector('.mc-vol-slider') as HTMLDivElement | null;
    this.volumeContainerEl = this.root.querySelector('.mc-volume') as HTMLDivElement | null;
    this.fullscreenBtn = this.root.querySelector('.mc-fullscreen') as HTMLButtonElement | null;
    if (this.settingsFormatSelect) this.settingsFormatSelect.value = this.exportFormat;
    if (this.settingsQualitySelect) this.settingsQualitySelect.value = this.exportQuality;
  }

  /** Change the look of the bar (see {@link ControllerTheme}): only the keys you give change, `null` restores the default. */
  setTheme(theme: ControllerTheme): void {
    warnUnknownOptions('Controller theme', theme as Record<string, unknown>, Object.keys(THEME_PROPERTIES));
    for (const key of Object.keys(THEME_PROPERTIES) as Array<keyof ControllerTheme>) {
      if (!(key in theme)) continue;
      const value = theme[key];
      const prop = THEME_PROPERTIES[key];
      if (value === null || value === undefined || value === '') this.root.style.removeProperty(prop);
      else this.root.style.setProperty(prop, typeof value === 'number' ? `${value}px` : String(value));
    }
  }

  private ensurePositioningContext(canvas: HTMLCanvasElement): HTMLDivElement {
    const parent = canvas.parentElement;
    if (!parent) {
      throw new Error('Controller: canvas must be attached to the DOM before constructing.');
    }
    const pos = getComputedStyle(parent).position;
    if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') {
      // Tag the user's element so the [data-mc-wrap]:fullscreen style hooks apply
      // to it the same way they apply to our auto-wrap. Cleaned up on destroy.
      parent.setAttribute('data-mc-wrap', '');
      return parent as HTMLDivElement;
    }
    const wrap = document.createElement('div');
    wrap.className = 'movie-controller-wrap';
    wrap.setAttribute('data-mc-wrap', '');
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';
    wrap.style.lineHeight = '0';
    parent.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
    this.wrappedHere = true;
    this.canvasInlineWidth = canvas.style.width;
    this.canvasInlineHeight = canvas.style.height;

    return wrap;
  }

  /**
   * Make the wrapper exactly as wide as the canvas. A shrink-to-fit wrapper around a canvas that is sized in percent (the usual
   * `canvas { width: min(960px, 100%) }`) is as wide as the canvas's width ATTRIBUTE (1280), so the picture sat at its left edge
   * with an empty strip beside it. We measure the canvas as the page styled it (the wrapper made transparent to layout), give
   * the wrapper that width, and let the canvas fill the wrapper. Re-measured when the window or the page's box changes.
   */
  private fitWrap(): void {
    if (!this.wrappedHere) return;
    const wrap = this.wrapper, canvas = this.options.canvas;
    if (document.fullscreenElement === wrap) {                    // the fullscreen CSS owns the size
      wrap.style.width = '';
      canvas.style.width = this.canvasInlineWidth; canvas.style.height = this.canvasInlineHeight;
      return;
    }
    canvas.style.width = this.canvasInlineWidth; canvas.style.height = this.canvasInlineHeight;
    const display = wrap.style.display;
    wrap.style.display = 'contents'; wrap.style.width = '';
    const w = canvas.getBoundingClientRect().width;
    wrap.style.display = display;
    if (!(w > 0)) return;
    wrap.style.width = `${w}px`;
    canvas.style.width = '100%'; canvas.style.height = 'auto';
  }

  private bindFitWrap(): void {
    if (!this.wrappedHere) return;
    this.fitWrap();
    let queued = false;
    this.fitWrapHandler = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; this.fitWrap(); });
    };
    window.addEventListener('resize', this.fitWrapHandler);
    const parent = this.wrapper.parentElement;
    if (parent && typeof ResizeObserver !== 'undefined') {
      this.fitObserver = new ResizeObserver(this.fitWrapHandler);
      this.fitObserver.observe(parent);
    }
  }

  private bindMovieEvents(): void {
    this.onReady = () => {
      this.progressEl.setAttribute('aria-valuemax', String(this.movie.totalFrames));
      this.refreshTime(0);
      this.refreshProgress(0);
      this.refreshVolumeUI();
      this.refreshStops();
    };
    this.onFrame = ({ frame, totalFrames }) => {
      if (!this.isScrubbing) {
        this.refreshProgress(frame, totalFrames);
      }
      this.refreshTime(frame);
    };
    // `movie.play()` may be called by the host page, not only by this bar's button.
    this.onPlay = () => {
      this.refreshPlayIcon();
      this.kickIdleTimer();
    };
    this.onPause = () => {
      this.refreshPlayIcon();
      // YouTube-style: pause shows the bar momentarily, then auto-hides on idle.
      this.kickIdleTimer();
    };
    this.onProgress = ({ progress, frame, totalFrames }) => {
      if (!this.isExporting || !this.exportFillEl || !this.exportTextEl) return;
      this.exportFillEl.style.width = `${progress}%`;
      this.exportTextEl.textContent = `${progress}% (${frame} / ${totalFrames} frames)`;
    };
    this.movie.on('ready', this.onReady);
    this.movie.on('frame', this.onFrame);
    this.movie.on('play', this.onPlay);
    this.movie.on('pause', this.onPause);
    this.movie.on('progress', this.onProgress);
  }

  /** The stops of a presentation as marks on the seek bar, and the Present button. */
  private refreshStops(): void {
    this.progressEl.querySelector('.mc-stops')?.remove();
    const stops = this.movie.stops ?? [];
    this.refreshPdfChoices(stops.length > 0);
    if (stops.length === 0) {
      this.presentBtn?.remove(); this.presentBtn = null;
      return;
    }
    const total = this.movie.totalFrames || 1;
    const holder = document.createElement('div');
    holder.className = 'mc-stops';
    for (const s of stops) {
      const tick = document.createElement('div');
      tick.className = s.pageStart ? 'mc-stop-tick mc-stop-page' : 'mc-stop-tick';
      tick.style.left = `${(s.frame / total) * 100}%`;
      if (s.page) tick.title = s.page;
      holder.appendChild(tick);
    }
    this.progressEl.appendChild(holder);
    if (this.options.present && !this.presentBtn && this.fullscreenBtn) {
      const btn = document.createElement('button');
      btn.className = 'mc-btn mc-present';
      btn.setAttribute('aria-label', 'Present');
      btn.title = 'Present';
      btn.innerHTML = ICONS.present;
      btn.addEventListener('click', () => { void this.startPresenting(); });
      this.fullscreenBtn.parentElement?.insertBefore(btn, this.fullscreenBtn);
      this.presentBtn = btn;
    }
  }

  /** A deck can be downloaded as a PDF: the format list gets "PDF" choices while the movie has stops. */
  private refreshPdfChoices(has: boolean): void {
    const select = this.settingsFormatSelect;
    if (!select) return;
    const present = !!select.querySelector('option[value="pdf"]');
    if (has && !present) {
      for (const [value, label] of [['pdf', 'PDF (pages)'], ['pdf-steps', 'PDF (every step)']] as const) {
        const o = document.createElement('option');
        o.value = value; o.textContent = label;
        select.appendChild(o);
      }
    } else if (!has && present) {
      select.querySelectorAll('option[value="pdf"], option[value="pdf-steps"]').forEach((o) => o.remove());
      if (this.exportFormat === 'pdf' || this.exportFormat === 'pdf-steps') { this.exportFormat = 'mp4'; select.value = 'mp4'; }
    }
  }

  /** Play, or pause: a movie with stops plays to the next stop (and from the end, again from the start). */
  private async togglePlay(): Promise<void> {
    if (this.movie.isPlaying) { this.movie.pause(); return; }
    await this.startPlaying();
  }

  /** Start playing: to the next stop for a movie with stops, to the end for any other (or with `pauseAtStops: false`). */
  private async startPlaying(): Promise<void> {
    if (this.options.pauseAtStops && (this.movie.stops?.length ?? 0) > 0) {
      if (this.movie.currentFrame >= this.movie.totalFrames) await this.movie.gotoFrame(0, true);
      await this.movie.next();
    } else this.movie.play();
  }

  /** Hand the page over to a Presenter (fullscreen, keys, click and swipe move through the stops); Escape gives it back. */
  private async startPresenting(): Promise<void> {
    if (this.presenter || this.destroyed) return;
    const { Presenter } = await import('./Presenter');
    if (this.presenter || this.destroyed) return;
    const p = new Presenter(this.movie, { canvas: this.options.canvas, onExit: () => this.stopPresenting() });
    this.presenter = p;
    await p.start();
  }

  private stopPresenting(): void {
    const p = this.presenter;
    this.presenter = null;
    p?.destroy();
  }

  private bindPlayButton(): void {
    // pause / play emit 'pause' / 'play' events, which the handlers turn into refreshPlayIcon + kickIdleTimer
    this.playBtn.addEventListener('click', () => { void this.togglePlay(); });
  }

  /** Clicking the picture plays / pauses (a tap on a phone too). */
  private bindCanvasClick(): void {
    const canvas = this.options.canvas;
    this.canvasCursor = canvas.style.cursor;
    canvas.style.cursor = 'pointer';
    this.canvasPointerDownHandler = () => { this.swallowCanvasClick = false; };
    this.canvasClickHandler = () => {
      if (this.presenter) return;                                             // a presentation: the Presenter owns clicks
      // the tap that closed the export popover (see bindExportPopover) is not also a play / pause
      if (this.swallowCanvasClick) { this.swallowCanvasClick = false; return; }
      void this.togglePlay();
    };
    canvas.addEventListener('pointerdown', this.canvasPointerDownHandler);
    canvas.addEventListener('click', this.canvasClickHandler);
  }

  private refreshPlayIcon(): void {
    this.playBtn.innerHTML = this.movie.isPlaying ? ICONS.pause : ICONS.play;
    this.playBtn.setAttribute('aria-label', this.movie.isPlaying ? 'Pause' : 'Play');
  }

  private bindMuteButton(): void {
    this.muteBtn.addEventListener('click', () => {
      this.movie.toggleMute();
      this.refreshVolumeUI();
    });
  }

  private refreshMuteIcon(): void {
    const silent = this.movie.muted || this.movie.volume <= 0;
    this.muteBtn.innerHTML = silent ? ICONS.volumeOff : ICONS.volumeOn;
    this.muteBtn.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
  }

  private refreshVolumeUI(): void {
    this.refreshMuteIcon();
    if (!this.volumeSliderEl) return;
    const effective = this.movie.muted ? 0 : this.movie.volume;
    this.volumeSliderEl.style.setProperty('--mc-volume', String(effective));
    this.volumeSliderEl.setAttribute('aria-valuenow', String(Math.round(effective * 100)));
  }

  private bindVolumeSlider(): void {
    if (!this.volumeSliderEl || !this.volumeContainerEl) return;
    const slider = this.volumeSliderEl;
    const container = this.volumeContainerEl;

    const setFromPointer = (clientX: number) => {
      const rect = slider.getBoundingClientRect();
      const v = pxToFraction(clientX, { left: rect.left, width: rect.width }, 4);
      this.movie.volume = v;
      if (this.movie.muted && v > 0) this.movie.muted = false;
      this.refreshVolumeUI();
    };

    const onDown = (e: PointerEvent) => {
      this.isVolumeScrubbing = true;
      slider.classList.add('mc-scrubbing');
      try { slider.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
      setFromPointer(e.clientX);
    };
    const finish = (pointerId?: number) => {
      if (!this.isVolumeScrubbing) return;
      this.isVolumeScrubbing = false;
      slider.classList.remove('mc-scrubbing');
      try { if (pointerId !== undefined) slider.releasePointerCapture(pointerId); } catch { /* unsupported */ }
    };
    const onMove = (e: PointerEvent) => {
      if (!this.isVolumeScrubbing) return;
      if (e.buttons === 0) { finish(e.pointerId); return; }     // released outside an iframe: see bindScrubbing
      setFromPointer(e.clientX);
    };
    const onUp = (e: PointerEvent) => finish(e.pointerId);
    slider.addEventListener('pointerdown', onDown);
    slider.addEventListener('pointermove', onMove);
    slider.addEventListener('pointerup', onUp);
    slider.addEventListener('pointercancel', onUp);
    slider.addEventListener('lostpointercapture', () => finish());

    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      this.adjustVolume(e.deltaY < 0 ? 0.05 : -0.05);
    };
    container.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  /**
   * Does this browser have the Fullscreen API for an element? iPhone Safari does not (it can only put a <video> in fullscreen),
   * and a button that does nothing is worse than none.
   */
  private supportsFullscreen(): boolean {
    return typeof (this.wrapper as { requestFullscreen?: unknown }).requestFullscreen === 'function' && document.fullscreenEnabled !== false;
  }

  private bindFullscreen(): void {
    if (!this.fullscreenBtn) return;
    if (!this.supportsFullscreen()) {
      this.fullscreenBtn.remove();
      this.fullscreenBtn = null;                                   // the F key checks this too
      return;
    }
    this.fullscreenBtn.addEventListener('click', () => {
      void this.toggleFullscreen();
    });
    this.fullscreenChangeHandler = () => {
      this.fitWrap();
      this.refreshFullscreenIcon();
      // Fullscreen reflow can shift the canvas without changing its size, which
      // ResizeObserver would miss; resync the overlay explicitly.
      this.syncRootToCanvas();
    };
    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement === this.wrapper) {
        await document.exitFullscreen();
      } else {
        await this.wrapper.requestFullscreen();
      }
    } catch (err) {
      console.warn('pixi-effects: fullscreen denied:', err);
    }
  }

  private refreshFullscreenIcon(): void {
    if (!this.fullscreenBtn) return;
    const inFs = document.fullscreenElement === this.wrapper;
    this.fullscreenBtn.innerHTML = inFs ? ICONS.fullscreenExit : ICONS.fullscreenEnter;
    this.fullscreenBtn.setAttribute('aria-label', inFs ? 'Exit fullscreen' : 'Enter fullscreen');
  }

  private refreshProgress(frame: number, totalFrames?: number): void {
    const total = totalFrames ?? this.movie.totalFrames;
    const pct = frameToPercent(frame, total);
    this.progressEl.style.setProperty('--mc-fill', String(pct / 100));
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
    // End the drag. `clientX` is given when the pointer was released over the bar (seek to where it was).
    // A page inside an iframe never receives the pointerup of a button released OUTSIDE the iframe, so the
    // drag also ends on lostpointercapture, on the window losing focus, and on the first pointermove that
    // has no button down — otherwise it stayed "scrubbing" (paused, seeking on every hover).
    const finish = (clientX?: number, pointerId?: number) => {
      if (!this.isScrubbing) return;
      if (clientX !== undefined) this.seekFromPointer(clientX);
      this.isScrubbing = false;
      this.activePointerId = null;
      this.progressEl.classList.remove('mc-scrubbing');
      try { if (pointerId !== undefined) this.progressEl.releasePointerCapture(pointerId); } catch { /* unsupported */ }
      if (this.wasPlayingBeforeScrub) {
        void this.startPlaying();
        this.refreshPlayIcon();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!this.isScrubbing) return;
      if (e.buttons === 0) { finish(undefined, e.pointerId); return; }
      this.seekFromPointer(e.clientX);
    };
    const onUp = (e: PointerEvent) => finish(e.clientX, e.pointerId);
    this.progressEl.addEventListener('pointerdown', onDown);
    this.progressEl.addEventListener('pointermove', onMove);
    this.progressEl.addEventListener('pointerup', onUp);
    this.progressEl.addEventListener('pointercancel', onUp);
    this.progressEl.addEventListener('lostpointercapture', () => finish());
    this.windowBlurHandler = () => { finish(); this.isVolumeScrubbing = false; this.volumeSliderEl?.classList.remove('mc-scrubbing'); };
    window.addEventListener('blur', this.windowBlurHandler);
  }

  private seekFromPointer(clientX: number): void {
    const rect = this.progressEl.getBoundingClientRect();
    const inset = Controller.PROGRESS_INSET_PX;
    const innerLeft = rect.left + inset;
    const innerWidth = Math.max(0, rect.width - 2 * inset);
    const frame = pxToFrame(clientX, { left: innerLeft, width: innerWidth }, this.movie.totalFrames);
    this.refreshProgress(frame);
    void this.movie.gotoFrame(frame);
  }

  private bindExportPopover(): void {
    if (!this.exportBtn || !this.settingsPopoverEl) return;

    // Download icon on the bar toggles the popover (it does NOT directly trigger export).
    this.exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettings(!this.settingsOpen);
    });

    // Confirm button inside the popover triggers the actual export, then closes.
    if (this.exportConfirmBtn) {
      this.exportConfirmBtn.addEventListener('click', () => {
        this.toggleSettings(false);
        void this.handleExport();
      });
    }

    if (this.settingsFormatSelect) {
      this.settingsFormatSelect.addEventListener('change', (e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === 'mp4' || v === 'webm' || v === 'mov' || v === 'pdf' || v === 'pdf-steps') this.exportFormat = v;
      });
    }
    if (this.settingsQualitySelect) {
      this.settingsQualitySelect.addEventListener('change', (e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === 'low' || v === 'medium' || v === 'high' || v === 'very-high') this.exportQuality = v;
      });
    }

    this.settingsKeyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && this.settingsOpen) {
        e.preventDefault();
        this.toggleSettings(false);
      }
    };
    document.addEventListener('keydown', this.settingsKeyHandler);

    this.settingsOutsideHandler = (e: PointerEvent) => {
      if (!this.settingsOpen) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (this.settingsPopoverEl?.contains(target)) return;
      if (this.exportBtn?.contains(target)) return;
      if (this.options.canvas.contains(target)) this.swallowCanvasClick = true;     // closing the popover is all this tap does
      this.toggleSettings(false);
    };
    document.addEventListener('pointerdown', this.settingsOutsideHandler);
  }

  private toggleSettings(open: boolean): void {
    if (!this.exportBtn || !this.settingsPopoverEl) return;
    this.settingsOpen = open;
    this.settingsPopoverEl.setAttribute('data-open', open ? 'true' : 'false');
    this.exportBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      // Keep the bar visible while the popover is open.
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.setVisible(true);
    } else {
      // Resume normal auto-hide cadence after closing.
      this.kickIdleTimer();
    }
  }

  private async handleExport(): Promise<void> {
    if (this.isExporting) return;
    this.isExporting = true;
    const wasPlaying = this.movie.isPlaying;
    if (wasPlaying) {
      this.movie.pause();
      this.refreshPlayIcon();
    }
    const pdf = this.exportFormat === 'pdf' || this.exportFormat === 'pdf-steps';
    if (pdf) {
      const stops = this.movie.stops ?? [];
      const total = this.exportFormat === 'pdf-steps' ? stops.filter((s) => s.pdf !== false).length : new Set(stops.map((s) => s.pageIndex)).size;
      this.showExportOverlay('Exporting PDF...', `0% (0 / ${total} pages)`);
      this.exportPages = { done: 0, total };
    } else this.showExportOverlay();
    try {
      const blob = pdf
        ? await this.movie.exportPDF({
          which: this.exportFormat === 'pdf-steps' ? 'stops' : 'pages',
          quality: PDF_QUALITY[this.exportQuality],
          onImage: () => this.pdfPageDone(),
        })
        : await this.movie.render({
          format: this.exportFormat as 'mp4' | 'webm' | 'mov',
          video: { bitrate: this.exportQuality },
          audio: { bitrate: this.exportQuality },
        });
      if (this.exportFillEl) this.exportFillEl.style.width = '100%';
      if (this.exportTextEl) this.exportTextEl.textContent = 'Preparing download...';
      this.triggerDownload(blob);
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed.');
    } finally {
      this.hideExportOverlay();
      this.isExporting = false;
      if (wasPlaying) {
        void this.startPlaying();
        this.refreshPlayIcon();
      }
    }
  }

  private triggerDownload(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.makeFilename(blob);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  private makeFilename(blob: Blob): string {
    const ext = extensionForMimeType(blob.type);
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `movie-${ts}.${ext}`;
  }

  /** One more PDF page is ready: move the bar. */
  private pdfPageDone(): void {
    const p = this.exportPages;
    if (!p || !this.exportFillEl || !this.exportTextEl) return;
    p.done++;
    const percent = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 100;
    this.exportFillEl.style.width = `${percent}%`;
    this.exportTextEl.textContent = `${percent}% (${p.done} / ${p.total} pages)`;
  }

  private showExportOverlay(title = 'Exporting video...', text = '0% (0 / 0 frames)'): void {
    const overlay = document.createElement('div');
    overlay.className = 'mc-export-overlay';
    overlay.innerHTML = `
      <div class="mc-export-panel">
        <div class="mc-export-title"></div>
        <div class="mc-export-track"><div class="mc-export-fill"></div></div>
        <div class="mc-export-text"></div>
      </div>
    `;
    overlay.querySelector('.mc-export-title')!.textContent = title;
    overlay.querySelector('.mc-export-text')!.textContent = text;
    this.root.appendChild(overlay);
    this.exportOverlay = overlay;
    this.exportFillEl = overlay.querySelector('.mc-export-fill') as HTMLDivElement;
    this.exportTextEl = overlay.querySelector('.mc-export-text') as HTMLDivElement;
  }

  private hideExportOverlay(): void {
    if (this.exportOverlay) {
      this.exportOverlay.remove();
      this.exportOverlay = null;
      this.exportFillEl = null;
      this.exportTextEl = null;
    }
    this.exportPages = null;
  }

  private bindVisibility(): void {
    const wrap = this.wrapper;
    this.onWrapPointerMove = () => this.kickIdleTimer();
    this.onWrapMouseLeave = () => {
      if (!this.settingsOpen && !this.isScrubbing && !this.isVolumeScrubbing) this.setVisible(false);
    };
    wrap.addEventListener('pointermove', this.onWrapPointerMove);
    wrap.addEventListener('mouseleave', this.onWrapMouseLeave);
    this.root.addEventListener('pointerenter', () => {
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.setVisible(true);
    });
  }

  private kickIdleTimer(): void {
    this.setVisible(true);
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this.settingsOpen) return;
    this.hideTimer = setTimeout(() => {
      if (!this.isScrubbing && !this.isVolumeScrubbing && !this.settingsOpen) this.setVisible(false);
    }, Controller.HIDE_DELAY_MS);
  }

  private setVisible(v: boolean): void {
    this.root.setAttribute('data-state', v ? 'visible' : 'hidden');
  }

  private syncRootToCanvas(): void {
    const c = this.options.canvas;
    const cr = c.getBoundingClientRect();
    const wr = this.wrapper.getBoundingClientRect();
    this.root.style.left = `${cr.left - wr.left}px`;
    this.root.style.top = `${cr.top - wr.top}px`;
    this.root.style.width = `${cr.width}px`;
    this.root.style.height = `${cr.height}px`;
  }

  private bindKeyboard(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (this.presenter) return;                                             // a presentation: the Presenter owns the keys
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable || target.getAttribute?.('contenteditable') === 'true') return;
      }
      if (this.isExporting) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.playBtn.click();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.stepFrame(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.stepFrame(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.adjustVolume(0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.adjustVolume(-0.05);
          break;
        case 'KeyM':
          e.preventDefault();
          this.muteBtn.click();
          break;
        case 'KeyE':
          if (e.shiftKey && this.exportBtn) {
            e.preventDefault();
            // Power-user shortcut: skip the popover and export with current settings.
            void this.handleExport();
          }
          break;
        case 'KeyF':
          if (this.fullscreenBtn) {
            e.preventDefault();
            void this.toggleFullscreen();
          }
          break;
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private stepFrame(delta: number): void {
    const next = Math.max(0, Math.min(this.movie.totalFrames, this.movie.currentFrame + delta));
    void this.movie.gotoFrame(next);
  }

  private adjustVolume(delta: number): void {
    const next = Math.max(0, Math.min(1, this.movie.volume + delta));
    this.movie.volume = next;
    if (this.movie.muted && next > 0) this.movie.muted = false;
    this.refreshVolumeUI();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopPresenting();
    if (this.onReady) { this.movie.off('ready', this.onReady); this.onReady = null; }
    if (this.onFrame) { this.movie.off('frame', this.onFrame); this.onFrame = null; }
    if (this.onPlay) { this.movie.off('play', this.onPlay); this.onPlay = null; }
    if (this.onPause) { this.movie.off('pause', this.onPause); this.onPause = null; }
    if (this.onProgress) { this.movie.off('progress', this.onProgress); this.onProgress = null; }
    if (this.onWrapPointerMove) {
      this.wrapper.removeEventListener('pointermove', this.onWrapPointerMove);
      this.onWrapPointerMove = null;
    }
    if (this.onWrapMouseLeave) {
      this.wrapper.removeEventListener('mouseleave', this.onWrapMouseLeave);
      this.onWrapMouseLeave = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.canvasClickHandler) {
      this.options.canvas.removeEventListener('click', this.canvasClickHandler);
      this.options.canvas.removeEventListener('pointerdown', this.canvasPointerDownHandler!);
      this.options.canvas.style.cursor = this.canvasCursor;
      this.canvasClickHandler = null; this.canvasPointerDownHandler = null;
    }
    if (this.fitObserver) { this.fitObserver.disconnect(); this.fitObserver = null; }
    if (this.fitWrapHandler) { window.removeEventListener('resize', this.fitWrapHandler); this.fitWrapHandler = null; }
    if (this.wrappedHere) {                                       // give the canvas its own sizing back
      this.options.canvas.style.width = this.canvasInlineWidth;
      this.options.canvas.style.height = this.canvasInlineHeight;
    }
    this.root.remove();
    if (this.wrappedHere) {
      const parent = this.wrapper.parentElement;
      const canvas = this.options.canvas;
      if (parent) {
        parent.insertBefore(canvas, this.wrapper);
        this.wrapper.remove();
      }
    } else {
      this.wrapper.removeAttribute('data-mc-wrap');
    }
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.settingsKeyHandler) {
      document.removeEventListener('keydown', this.settingsKeyHandler);
      this.settingsKeyHandler = null;
    }
    if (this.settingsOutsideHandler) {
      document.removeEventListener('pointerdown', this.settingsOutsideHandler);
      this.settingsOutsideHandler = null;
    }
    if (this.fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
      this.fullscreenChangeHandler = null;
    }
    if (this.windowBlurHandler) {
      window.removeEventListener('blur', this.windowBlurHandler);
      this.windowBlurHandler = null;
    }
    if (this.wheelHandler && this.volumeContainerEl) {
      this.volumeContainerEl.removeEventListener('wheel', this.wheelHandler);
      this.wheelHandler = null;
    }
    if (document.fullscreenElement === this.wrapper) {
      void document.exitFullscreen().catch(() => {});
    }
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.hideExportOverlay();
    uninstallStyles();
  }
}
