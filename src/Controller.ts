import type { Movie } from './core/Movie';

const ICONS = {
  play: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 2 L13 8 L3 14 Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12"/><rect x="9.5" y="2" width="3.5" height="12"/></svg>',
  volumeOn: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 Q13 8 11 11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12.5 3.5 Q15.5 8 12.5 12.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  volumeOff: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 6 H5 L9 2 V14 L5 10 H2 Z"/><path d="M11 5 L15 11 M15 5 L11 11" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 V11 M4 7 L8 11 L12 7 M3 13 H13"/></svg>',
  gear: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5 V3 M8 13 V14.5 M1.5 8 H3 M13 8 H14.5 M3.4 3.4 L4.5 4.5 M11.5 11.5 L12.6 12.6 M3.4 12.6 L4.5 11.5 M11.5 4.5 L12.6 3.4"/></svg>',
} as const;

const STYLE_ATTR = 'data-movie-controller';

const STYLE_CSS = `
.movie-controller-wrap { position: relative; display: inline-block; line-height: 0; }
.movie-controller {
  position: absolute;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
  outline: 2px solid #007AFF;
  outline-offset: 2px;
}
.mc-progress::before {
  content: ""; position: absolute; left: 12px; right: 12px;
  height: 3px; background: rgba(255,255,255,0.25);
  transition: height 120ms ease;
}
.mc-progress:hover::before, .mc-progress.mc-scrubbing::before { height: 5px; }
.mc-progress-fill {
  position: absolute; left: 12px; top: 50%;
  height: 3px;
  width: calc((100% - 24px) * var(--mc-fill, 0));
  background: #007AFF;
  transform: translateY(-50%);
  transition: height 120ms ease;
  pointer-events: none;
}
.mc-progress:hover .mc-progress-fill,
.mc-progress.mc-scrubbing .mc-progress-fill { height: 5px; }
.mc-progress-thumb {
  position: absolute; top: 50%;
  left: calc(12px + (100% - 24px) * var(--mc-fill, 0));
  width: 12px; height: 12px; border-radius: 50%;
  background: #007AFF;
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

export function extensionForMimeType(mime: string): string {
  const t = (mime || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime') || t.includes('mov')) return 'mov';
  if (t.includes('matroska') || t.includes('mkv')) return 'mkv';
  return 'mp4';
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
  private settingsBtn: HTMLButtonElement | null = null;
  private settingsPopoverEl: HTMLDivElement | null = null;
  private settingsFormatSelect: HTMLSelectElement | null = null;
  private settingsQualitySelect: HTMLSelectElement | null = null;
  private exportFormat: 'mp4' | 'webm' | 'mov' = 'mp4';
  private exportQuality: 'low' | 'medium' | 'high' | 'very-high' = 'high';
  private settingsOpen = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly HIDE_DELAY_MS = 2500;
  private static readonly PROGRESS_INSET_PX = 12;
  private isScrubbing = false;
  private wasPlayingBeforeScrub = false;
  private activePointerId: number | null = null;
  private isExporting = false;
  private exportOverlay: HTMLDivElement | null = null;
  private exportFillEl: HTMLDivElement | null = null;
  private exportTextEl: HTMLDivElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private settingsKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private settingsOutsideHandler: ((e: PointerEvent) => void) | null = null;
  private onReady: (() => void) | null = null;
  private onFrame: ((e: { frame: number; totalFrames: number }) => void) | null = null;
  private onPause: (() => void) | null = null;
  private onProgress: ((e: { progress: number; frame: number; totalFrames: number }) => void) | null = null;
  private onWrapPointerMove: (() => void) | null = null;
  private onWrapMouseLeave: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

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
    this.syncRootToCanvas();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncRootToCanvas());
      this.resizeObserver.observe(this.options.canvas);
    }
    this.root.setAttribute('data-state', 'visible');
    this.bindMovieEvents();
    this.bindPlayButton();
    this.bindScrubbing();
    this.bindMuteButton();
    this.bindExportButton();
    this.bindSettingsPopover();
    this.bindVisibility();
    if (this.options.enableKeyboardShortcuts) this.bindKeyboard();
  }

  private buildBar(): void {
    const settingsHtml = this.options.showExportButton ? `
      <button class="mc-btn mc-settings" aria-label="Export settings" aria-expanded="false">${ICONS.gear}</button>
    ` : '';
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
        <button class="mc-btn mc-mute" aria-label="Mute">${ICONS.volumeOn}</button>
        <span class="mc-time">0:00 / 0:00</span>
        <div class="mc-spacer"></div>
        ${settingsHtml}
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
    this.settingsBtn = this.root.querySelector('.mc-settings') as HTMLButtonElement | null;
    this.settingsPopoverEl = this.root.querySelector('.mc-settings-popover') as HTMLDivElement | null;
    this.settingsFormatSelect = this.root.querySelector('.mc-settings-format') as HTMLSelectElement | null;
    this.settingsQualitySelect = this.root.querySelector('.mc-settings-quality') as HTMLSelectElement | null;
    if (this.settingsFormatSelect) this.settingsFormatSelect.value = this.exportFormat;
    if (this.settingsQualitySelect) this.settingsQualitySelect.value = this.exportQuality;
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
    this.onReady = () => {
      this.progressEl.setAttribute('aria-valuemax', String(this.movie.totalFrames));
      this.refreshTime(0);
      this.refreshProgress(0);
      this.refreshMuteIcon();
    };
    this.onFrame = ({ frame, totalFrames }) => {
      if (!this.isScrubbing) {
        this.refreshProgress(frame, totalFrames);
      }
      this.refreshTime(frame);
    };
    this.onPause = () => {
      this.refreshPlayIcon();
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.setVisible(true);
    };
    this.onProgress = ({ progress, frame, totalFrames }) => {
      if (!this.isExporting || !this.exportFillEl || !this.exportTextEl) return;
      this.exportFillEl.style.width = `${progress}%`;
      this.exportTextEl.textContent = `${progress}% (${frame} / ${totalFrames} frames)`;
    };
    this.movie.on('ready', this.onReady);
    this.movie.on('frame', this.onFrame);
    this.movie.on('pause', this.onPause);
    this.movie.on('progress', this.onProgress);
  }

  private bindPlayButton(): void {
    this.playBtn.addEventListener('click', () => {
      if (this.movie.isPlaying) {
        this.movie.pause();
        this.refreshPlayIcon();
        if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
        this.setVisible(true);
      } else {
        this.movie.play();
        this.refreshPlayIcon();
        this.kickIdleTimer();
      }
    });
  }

  private refreshPlayIcon(): void {
    this.playBtn.innerHTML = this.movie.isPlaying ? ICONS.pause : ICONS.play;
    this.playBtn.setAttribute('aria-label', this.movie.isPlaying ? 'Pause' : 'Play');
  }

  private bindMuteButton(): void {
    this.muteBtn.addEventListener('click', () => {
      this.movie.toggleMute();
      this.refreshMuteIcon();
    });
  }

  private refreshMuteIcon(): void {
    const silent = this.movie.muted || this.movie.volume <= 0;
    this.muteBtn.innerHTML = silent ? ICONS.volumeOff : ICONS.volumeOn;
    this.muteBtn.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
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
    const inset = Controller.PROGRESS_INSET_PX;
    const innerLeft = rect.left + inset;
    const innerWidth = Math.max(0, rect.width - 2 * inset);
    const frame = pxToFrame(clientX, { left: innerLeft, width: innerWidth }, this.movie.totalFrames);
    this.refreshProgress(frame);
    void this.movie.gotoFrame(frame);
  }

  private bindSettingsPopover(): void {
    if (!this.settingsBtn || !this.settingsPopoverEl) return;

    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettings(!this.settingsOpen);
    });

    if (this.settingsFormatSelect) {
      this.settingsFormatSelect.addEventListener('change', (e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === 'mp4' || v === 'webm' || v === 'mov') this.exportFormat = v;
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
      if (this.settingsBtn?.contains(target)) return;
      this.toggleSettings(false);
    };
    document.addEventListener('pointerdown', this.settingsOutsideHandler);
  }

  private toggleSettings(open: boolean): void {
    if (!this.settingsBtn || !this.settingsPopoverEl) return;
    this.settingsOpen = open;
    this.settingsPopoverEl.setAttribute('data-open', open ? 'true' : 'false');
    this.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      // Keep the bar visible while the popover is open.
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.setVisible(true);
    } else if (this.movie.isPlaying) {
      // Resume normal auto-hide cadence after closing during playback.
      this.kickIdleTimer();
    }
  }

  private bindExportButton(): void {
    if (!this.exportBtn) return;
    this.exportBtn.addEventListener('click', () => {
      void this.handleExport();
    });
  }

  private async handleExport(): Promise<void> {
    if (this.isExporting) return;
    this.isExporting = true;
    const wasPlaying = this.movie.isPlaying;
    if (wasPlaying) {
      this.movie.pause();
      this.refreshPlayIcon();
    }
    this.showExportOverlay();
    try {
      const blob = await this.movie.render({
        format: this.exportFormat,
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
        this.movie.play();
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

  private showExportOverlay(): void {
    const overlay = document.createElement('div');
    overlay.className = 'mc-export-overlay';
    overlay.innerHTML = `
      <div class="mc-export-panel">
        <div class="mc-export-title">Exporting video...</div>
        <div class="mc-export-track"><div class="mc-export-fill"></div></div>
        <div class="mc-export-text">0% (0 / 0 frames)</div>
      </div>
    `;
    document.body.appendChild(overlay);
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
  }

  private bindVisibility(): void {
    const wrap = this.wrapper;
    this.onWrapPointerMove = () => this.kickIdleTimer();
    this.onWrapMouseLeave = () => {
      if (this.movie.isPlaying) this.setVisible(false);
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
    if (!this.movie.isPlaying) return;
    this.hideTimer = setTimeout(() => {
      if (this.movie.isPlaying && !this.isScrubbing) this.setVisible(false);
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
            this.exportBtn.click();
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
    this.refreshMuteIcon();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.onReady) { this.movie.off('ready', this.onReady); this.onReady = null; }
    if (this.onFrame) { this.movie.off('frame', this.onFrame); this.onFrame = null; }
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
    this.root.remove();
    if (this.wrappedHere) {
      const parent = this.wrapper.parentElement;
      const canvas = this.options.canvas;
      if (parent) {
        parent.insertBefore(canvas, this.wrapper);
        this.wrapper.remove();
      }
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
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.hideExportOverlay();
    uninstallStyles();
  }
}
