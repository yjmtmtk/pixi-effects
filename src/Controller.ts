import type { Movie } from './core/Movie';
import { warnUnknownOptions } from './core/options';
import { CONTROLLER_CSS } from './controller/css';
import { formatTime, frameToPercent, pxToFrame, pxToFraction, extensionForMimeType } from './controller/helpers';

const ICONS = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 2 L13 8 L3 14 Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>',
  volumeOn: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 Q13 8 11 11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12.5 3.5 Q15.5 8 12.5 12.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  volumeOff: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 L15 11 M15 5 L11 11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  loop: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7 V6 Q3 4 5 4 H12"/><path d="M10 2 L12.5 4 L10 6"/><path d="M13 9 V10 Q13 12 11 12 H4"/><path d="M6 14 L3.5 12 L6 10"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 V11 M4 7 L8 11 L12 7 M3 13 H13"/></svg>',
  fullscreenEnter: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6 V2 H6 M14 6 V2 H10 M2 10 V14 H6 M14 10 V14 H10"/></svg>',
  present: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2.5 H14 V10.5 H2 Z M8 10.5 V13.5 M5 13.5 H11"/></svg>',
  fullscreenExit: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 V6 H2 M10 2 V6 H14 M6 14 V10 H2 M10 14 V10 H14"/></svg>',
} as const;

const STYLE_ATTR = 'data-movie-controller';

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

/** The JPEG quality of a PDF page for each quality choice of the panel. */
const PDF_QUALITY = { 'low': 0.6, 'medium': 0.75, 'high': 0.88, 'very-high': 0.95 } as const;

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

const CONTROLLER_OPTION_KEYS = ['canvas', 'theme', 'exportButton', 'keyboard', 'clickToPlay', 'presentButton', 'pauseAtStops', 'loopButton', 'thumbnails', 'className'] as const;

export interface ControllerOptions {
  canvas: HTMLCanvasElement;
  /** Colours and sizes of the bar, see {@link ControllerTheme}. Can be changed later with `controller.setTheme()`. */
  theme?: ControllerTheme;
  /** The download button and its panel. Default true. */
  exportButton?: boolean;
  /** Space, arrows, M, F, E … on the page (not while typing in a field). Default true. */
  keyboard?: boolean;
  /** A click (or tap) on the picture plays / pauses, like a `<video>` element. Default true; `false` leaves the canvas alone. */
  clickToPlay?: boolean;
  /** A movie with `stops` gets a Present button that starts a {@link Presenter} (keys, click and swipe move through the stops). Default true; `false` keeps only the marks on the seek bar. */
  presentButton?: boolean;
  /** A movie with `stops`: the play button (and a click on the picture, and Space) plays to the next stop and pauses there, like a slide. Default true; `false` plays straight through to the end. */
  pauseAtStops?: boolean;
  /** The loop button (and the L key) next to the volume: it flips `movie.loop`, so playing goes back to the start at the end. Default true; `false` leaves the loop to the page. */
  loopButton?: boolean;
  /**
   * A small picture of the frame under the pointer, above the seek bar, with its time (like a video site). Default false. It is made with `movie.thumbnail()` without
   * moving the playhead or changing the picture, also while the movie plays. It switches itself off for a movie with video footage or variables (`movie.thumbnailsOff`
   * says why), where a frame cannot be drawn on the side.
   */
  thumbnails?: boolean;
  className?: string;
}

interface ResolvedOptions {
  canvas: HTMLCanvasElement;
  exportButton: boolean;
  keyboard: boolean;
  clickToPlay: boolean;
  presentButton: boolean;
  pauseAtStops: boolean;
  loopButton: boolean;
  thumbnails: boolean;
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
  private loopBtn: HTMLButtonElement | null = null;
  private onLoopChange: (() => void) | null = null;
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
  /** A rebuild (setVars, resize, rebuild) may have moved the stops: draw their marks again. */
  private onRebuilt: (() => void) | null = null;
  private previewEl: HTMLDivElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewTimeEl: HTMLSpanElement | null = null;
  /** Pictures already made, by frame bucket (a frame is a pure function of time; cleared on a rebuild). */
  private previewCache = new Map<number, HTMLCanvasElement>();
  private previewWanted: number | null = null;
  private previewRunning = false;
  private previewRetry: ReturnType<typeof setTimeout> | null = null;
  private previewRetries = 0;
  private previewCleanup: (() => void) | null = null;
  private static readonly PREVIEW_WIDTH_PX = 160;
  private presenter: { destroy(): void } | null = null;
  /** `pixi-effects/present`, loaded as soon as the movie has stops (a press of play must not wait for it). */
  private present: typeof import('./present/index') | null = null;
  private presentLoading: Promise<typeof import('./present/index')> | null = null;
  private playStarting = false;
  private loadPresent(): Promise<typeof import('./present/index')> {
    return this.presentLoading ??= import('./present/index').then(m => (this.present = m), err => { this.presentLoading = null; throw err; });     // (a failed load is tried again next time)
  }
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
    warnUnknownOptions('Controller', options, CONTROLLER_OPTION_KEYS);
    this.movie = movie;
    this.options = {
      canvas: options.canvas,
      exportButton: options.exportButton ?? true,
      keyboard: options.keyboard ?? true,
      clickToPlay: options.clickToPlay ?? true,
      presentButton: options.presentButton ?? true,
      pauseAtStops: options.pauseAtStops ?? true,
      loopButton: options.loopButton ?? true,
      thumbnails: options.thumbnails ?? false,
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
    if (this.options.thumbnails) this.bindPreview();
    this.bindMuteButton();
    this.bindLoopButton();
    this.bindVolumeSlider();
    this.bindExportPopover();
    this.bindFullscreen();
    this.bindVisibility();
    if (this.options.keyboard) this.bindKeyboard();
  }

  private buildBar(): void {
    const popoverHtml = this.options.exportButton ? `
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
        ${this.options.loopButton ? `<button class="mc-btn mc-loop" aria-label="Loop" aria-pressed="false" title="Loop (L)">${ICONS.loop}</button>` : ''}
        <span class="mc-time">0:00 / 0:00</span>
        <div class="mc-spacer"></div>
        ${this.options.exportButton ? `<button class="mc-btn mc-export" aria-label="Export" aria-expanded="false">${ICONS.download}</button>` : ''}
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
    this.onRebuilt = () => { this.refreshStops(); this.previewCache.clear(); };
    this.movie.on('ready', this.onReady);
    this.movie.on('rebuilt', this.onRebuilt);
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
    this.loadPresent().catch(() => { /* said when it is needed: startPlaying() plays straight through instead */ });
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
    if (this.options.presentButton && !this.presentBtn && this.fullscreenBtn) {
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
      let present = this.present;
      if (!present) {
        if (this.playStarting) return;                                 // a second press while the module loads is the same press
        this.playStarting = true;
        try { present = await this.loadPresent(); }
        catch (err) { console.warn('pixi-effects: could not load pixi-effects/present, playing straight through:', err); }
        finally { this.playStarting = false; }
      }
      if (!present) { this.movie.play(); return; }
      await present.next(this.movie);
    } else this.movie.play();
  }

  /** Hand the page over to a Presenter (fullscreen, keys, click and swipe move through the stops); Escape gives it back. */
  private async startPresenting(): Promise<void> {
    if (this.presenter || this.destroyed) return;
    const { Presenter } = await this.loadPresent();
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

  private bindLoopButton(): void {
    this.loopBtn = this.root.querySelector('.mc-loop') as HTMLButtonElement | null;
    if (!this.loopBtn) return;
    const refresh = () => { this.loopBtn!.setAttribute('aria-pressed', String(this.movie.loop)); };
    this.loopBtn.addEventListener('click', () => { this.movie.loop = !this.movie.loop; refresh(); });
    this.onLoopChange = refresh;
    this.movie.on('loopchange', this.onLoopChange);
    refresh();
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

  /** The hover preview above the seek bar (`thumbnails: true`). */
  private bindPreview(): void {
    const el = document.createElement('div');
    el.className = 'mc-preview';
    el.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    const time = document.createElement('span');
    time.className = 'mc-preview-time';
    el.append(canvas, time);
    this.root.appendChild(el);
    this.previewEl = el; this.previewCanvas = canvas; this.previewTimeEl = time;

    const hide = () => { this.previewWanted = null; el.removeAttribute('data-show'); };
    const onMove = (e: PointerEvent) => {
      if (this.isScrubbing || this.movie.thumbnailsOff || e.pointerType === 'touch') { hide(); return; }
      const rect = this.progressEl.getBoundingClientRect();
      const inset = Controller.PROGRESS_INSET_PX;
      const frame = pxToFrame(e.clientX, { left: rect.left + inset, width: Math.max(0, rect.width - 2 * inset) }, this.movie.totalFrames);
      // the box follows the pointer but stays inside the picture
      const rootRect = this.root.getBoundingClientRect();
      // (the box is measured as drawn and placed in per cent of the bar, so a page that scales or zooms the bar does not move it out)
      const half = el.getBoundingClientRect().width / 2 + 2;
      const x = Math.min(Math.max(e.clientX - rootRect.left, half), Math.max(half, rootRect.width - half));
      el.style.left = `${rootRect.width > 0 ? (x / rootRect.width) * 100 : 50}%`;
      this.previewRetries = 0;
      time.textContent = formatTime(frame / (this.movie.frameRate || 1));
      this.previewWanted = frame;
      void this.runPreview();
    };
    this.progressEl.addEventListener('pointermove', onMove);
    this.progressEl.addEventListener('pointerleave', hide);
    this.progressEl.addEventListener('pointerdown', hide);
    this.previewCleanup = () => {
      this.progressEl.removeEventListener('pointermove', onMove);
      this.progressEl.removeEventListener('pointerleave', hide);
      this.progressEl.removeEventListener('pointerdown', hide);
      if (this.previewRetry) { clearTimeout(this.previewRetry); this.previewRetry = null; }
      el.remove();
    };
  }

  /** Draws the picture of the wanted frame into the preview; one at a time, and the last wish wins. */
  private async runPreview(): Promise<void> {
    if (this.previewRunning) return;
    this.previewRunning = true;
    try {
      while (this.previewWanted !== null && !this.destroyed) {
        const wanted = this.previewWanted;
        const fps = this.movie.frameRate || 30;
        const step = Math.max(1, Math.round(fps / 10));                  // pictures of the same tenth of a second are the same picture
        const key = Math.min(this.movie.totalFrames, Math.round(wanted / step) * step);
        let pic = this.previewCache.get(key) ?? null;
        if (!pic) {
          try { pic = await this.movie.thumbnail(key, { width: Controller.PREVIEW_WIDTH_PX }); }
          catch { this.previewWanted = null; this.previewEl?.removeAttribute('data-show'); break; }      // it cannot be made at all: do not ask again
          if (pic) {
            if (this.previewCache.size >= 120) this.previewCache.delete(this.previewCache.keys().next().value as number);
            this.previewCache.set(key, pic);
          }
        }
        if (this.previewWanted === null || this.destroyed) break;        // the pointer has left meanwhile
        if (pic) {
          const c = this.previewCanvas!;
          if (c.width !== pic.width || c.height !== pic.height) { c.width = pic.width; c.height = pic.height; }
          c.getContext('2d')!.drawImage(pic, 0, 0);
          this.previewEl!.setAttribute('data-show', '1');
          if (this.previewWanted === wanted) this.previewWanted = null;
        } else if (this.previewWanted !== wanted) {
          // the pointer moved on while this one was being made: the loop takes the newer wish
        } else if (!this.movie.thumbnailsOff && this.previewRetries++ < 10) {
          // not possible just now (a seek or an export is running): try again soon, if the pointer is still there
          this.previewRetry = setTimeout(() => { this.previewRetry = null; void this.runPreview(); }, 120);
          break;
        } else { this.previewWanted = null; this.previewEl?.removeAttribute('data-show'); }
      }
    } finally { this.previewRunning = false; }
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
    this.setVisible(true);                                                    // the progress is in the bar: keep it on screen until the export ends
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
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
        ? await (await this.loadPresent()).exportPDF(this.movie, {
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
      this.kickIdleTimer();                                                   // the normal idle behaviour again: the bar fades after a pause
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
      if (!this.settingsOpen && !this.isScrubbing && !this.isVolumeScrubbing && !this.isExporting) this.setVisible(false);
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
    if (this.settingsOpen || this.isExporting) return;                       // the export progress lives in the bar: it stays until the export is done
    this.hideTimer = setTimeout(() => {
      if (!this.isScrubbing && !this.isVolumeScrubbing && !this.settingsOpen && !this.isExporting) this.setVisible(false);
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
        case 'KeyL':
          if (this.loopBtn) { e.preventDefault(); this.loopBtn.click(); }
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
    if (this.previewCleanup) { this.previewCleanup(); this.previewCleanup = null; }
    if (this.onReady) { this.movie.off('ready', this.onReady); this.onReady = null; }
    if (this.onRebuilt) { this.movie.off('rebuilt', this.onRebuilt); this.onRebuilt = null; }
    if (this.onLoopChange) { this.movie.off('loopchange', this.onLoopChange); this.onLoopChange = null; }
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
