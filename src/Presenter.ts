import type { Movie, StopEvent } from './core/Movie';
import type { Stop } from './core/stops';
import { warnUnknownOptions } from './core/options';

export interface PresenterOptions {
  canvas: HTMLCanvasElement;
  /** Keys on the page: arrows, Space, Enter, PageUp / PageDown, Home / End, page number + Enter, B / W, F, ?, Esc. Default true. */
  keyboard?: boolean;
  /** A click (or tap) on the picture is "next". Default true. */
  clickToAdvance?: boolean;
  /** A swipe to the left is "next", to the right "back" (touch screens). Default true. */
  swipe?: boolean;
  /** The page counter, the page name and a progress line (they fade out when nothing happens). Default true. */
  indicator?: boolean;
  /** Stops with `advance: seconds` move on by themselves. Default true. */
  autoAdvance?: boolean;
  /** Run off the end: go back to the start and play again (a kiosk, a looping demo). Default false. */
  loop?: boolean;
  /** The accent of the progress line (any CSS colour). */
  accent?: string;
  /** Called when the audience-facing session is over: Escape with nothing left to close, or fullscreen left. (`Controller`'s Present button uses it to bring its bar back.) */
  onExit?: () => void;
}

const OPTION_KEYS = ['canvas', 'keyboard', 'clickToAdvance', 'swipe', 'indicator', 'autoAdvance', 'loop', 'accent', 'onExit'] as const;
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp']);
const clock = (ms: number): string => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const IDLE_MS = 2500;
const DIGITS_MS = 2000;
const SWIPE_PX = 50;

const CSS = `
.movie-presenter { position: absolute; inset: 0; z-index: 3; pointer-events: none; font: 500 13px/1.3 system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #fff; }
.movie-presenter .mp-info { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); white-space: nowrap; display: flex; align-items: baseline; gap: 12px; padding: 6px 12px; border-radius: 999px; background: rgba(0, 0, 0, 0.45); transition: opacity 0.4s ease; }
.movie-presenter .mp-title { opacity: 0.75; }
.movie-presenter .mp-title:empty { display: none; }
.movie-presenter .mp-counter { font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
.movie-presenter .mp-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.14); transition: opacity 0.4s ease; }
.movie-presenter .mp-progress::after { content: ''; position: absolute; inset: 0; background: var(--mp-accent, #ffffff); transform-origin: 0 50%; transform: scaleX(var(--mp-fill, 0)); transition: transform 0.4s ease; }
.movie-presenter[data-idle="true"] .mp-info, .movie-presenter[data-idle="true"] .mp-progress { opacity: 0; }
.movie-presenter .mp-cover { position: absolute; inset: 0; z-index: 4; opacity: 0; pointer-events: none; background: #000; transition: opacity 0.25s ease; }
.movie-presenter .mp-cover[data-mode="black"] { opacity: 1; pointer-events: auto; background: #000; }
.movie-presenter .mp-cover[data-mode="white"] { opacity: 1; pointer-events: auto; background: #fff; }
.movie-presenter .mp-jump { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 10px 22px; border-radius: 12px; background: rgba(0, 0, 0, 0.6); font-size: 34px; font-weight: 600; letter-spacing: 0.06em; opacity: 0; transition: opacity 0.15s ease; }
.movie-presenter .mp-jump[data-active="true"] { opacity: 1; }
.movie-presenter .mp-help { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 5; padding: 18px 26px; border-radius: 14px; background: rgba(12, 14, 24, 0.92); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); pointer-events: auto; }
.movie-presenter .mp-help[data-open="false"] { display: none; }
.movie-presenter .mp-help h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.12em; opacity: 0.7; }
.movie-presenter .mp-help dl { display: grid; grid-template-columns: auto auto; gap: 6px 22px; margin: 0; }
.movie-presenter .mp-help dt { opacity: 0.95; font-weight: 600; white-space: nowrap; }
.movie-presenter .mp-help dd { margin: 0; opacity: 0.75; }
.movie-presenter .mp-wait { position: absolute; inset: 0; z-index: 7; display: grid; place-items: center; background: #000; font-size: 13px; letter-spacing: 0.4em; opacity: 0.9; padding-left: 0.4em; }
.movie-presenter .mp-wait[data-open="false"] { display: none; }
.movie-presenter .mp-overview { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; gap: 14px; padding: 26px 30px 18px; overflow: auto; background: rgba(8, 10, 18, 0.985); pointer-events: auto; }
.movie-presenter .mp-overview[data-open="false"] { display: none; }
.movie-presenter .mp-grid { display: grid; grid-template-columns: repeat(var(--mp-cols, 3), minmax(0, 1fr)); gap: 14px; }
.movie-presenter .mp-cell { position: relative; aspect-ratio: var(--mp-ratio, 16 / 9); overflow: hidden; border-radius: 8px; background: #000; border: 2px solid transparent; cursor: pointer; }
.movie-presenter .mp-cell img { display: block; width: 100%; height: 100%; object-fit: cover; }
.movie-presenter .mp-cell[data-current="true"] { border-color: rgba(255, 255, 255, 0.45); }
.movie-presenter .mp-cell[data-selected="true"] { border-color: var(--mp-accent, #ffffff); box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.18); }
.movie-presenter .mp-cell-label { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 8px; align-items: baseline; padding: 18px 10px 7px; background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent); font-size: 12px; }
.movie-presenter .mp-cell-num { font-weight: 700; font-variant-numeric: tabular-nums; }
.movie-presenter .mp-cell-name { opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.movie-presenter .mp-overview-hint { margin-top: auto; opacity: 0.55; font-size: 12px; letter-spacing: 0.04em; }
[data-pr-wrap] .movie-controller { display: none !important; }
[data-pr-wrap]:fullscreen { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: #000; }
[data-pr-wrap]:fullscreen > canvas { width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; object-fit: contain; border-radius: 0; }
@media (prefers-reduced-motion: reduce) { .movie-presenter * { transition: none !important; } }
`;
function installStyles(): void {
  if (typeof document === 'undefined' || document.head.querySelector('style[data-movie-presenter]')) return;
  const el = document.createElement('style');
  el.setAttribute('data-movie-presenter', '');
  el.textContent = CSS;
  document.head.appendChild(el);
}

const HELP: Array<[string, string]> = [
  ['→  ↓  Space  Enter  PageDown  click', 'next (plays to the next stop)'],
  ['←  ↑  Backspace  PageUp', 'back one stop'],
  ['Home  /  End', 'first page  /  last stop'],
  ['number, then Enter', 'jump to that page'],
  ['B  or  .', 'black screen'],
  ['W  or  ,', 'white screen'],
  ['G', 'overview of all pages (arrows + Enter, or click)'],
  ['P', 'presenter view: notes, next picture, timer (a second window)'],
  ['F', 'fullscreen'],
  ['Esc', 'close this / black screen / fullscreen'],
  ['swipe ← →', 'next / back (touch)'],
];

const VIEW_CSS = `
html, body { margin: 0; height: 100%; background: #0c0e16; color: #e8ecf8; font: 500 15px/1.4 system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; }
.pv { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 18px; height: 100%; padding: 18px; box-sizing: border-box; }
.pv-label { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; opacity: 0.55; }
.pv-main { display: flex; flex-direction: column; min-height: 0; }
.pv-now { width: 100%; height: auto; background: #000; border-radius: 8px; }
.pv-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.pv-top { display: flex; align-items: baseline; gap: 14px; }
.pv-count { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pv-title { flex: 1; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-timer { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
.pv-nextbox { position: relative; aspect-ratio: var(--pv-ratio, 16 / 9); background: #000; border-radius: 8px; overflow: hidden; }
.pv-next { display: block; width: 100%; height: 100%; object-fit: cover; }
.pv-nextbox[data-end="true"] .pv-next { display: none; }
.pv-end { position: absolute; inset: 0; display: none; place-items: center; opacity: 0.6; letter-spacing: 0.2em; font-size: 12px; }
.pv-nextbox[data-end="true"] .pv-end { display: grid; }
.pv-notes { flex: 1; min-height: 80px; overflow: auto; padding: 12px 14px; border-radius: 8px; background: #151927; font-size: 20px; line-height: 1.5; white-space: pre-wrap; }
.pv-notes[data-empty="true"] { opacity: 0.4; font-size: 14px; }
.pv-notes[data-empty="true"]::before { content: 'No notes for this page.'; }
.pv-buttons { display: flex; gap: 10px; }
.pv button { font: inherit; color: inherit; border: 0; border-radius: 8px; padding: 10px 16px; background: #232a40; cursor: pointer; }
.pv button:hover { background: #2e3754; }
.pv .pv-nextbtn { flex: 1; background: #3b5bdb; font-weight: 600; }
.pv .pv-nextbtn:hover { background: #4c6ef5; }
.pv .pv-reset { padding: 4px 10px; font-size: 12px; opacity: 0.7; }
`;

/**
 * A presentation player for a movie with `stops` (`composition.stops`): it stops where the stops are, and moves on with the keys,
 * a click, a tap or a swipe, like slides with animation. It draws only a small page counter, the page name and a progress line (they
 * fade out when idle), and a black / white screen, a list of keys (`?`) and fullscreen (`F`). Use it instead of `Controller` on the page.
 */
export class Presenter {
  readonly movie: Movie;
  readonly options: Required<Omit<PresenterOptions, 'accent' | 'onExit'>> & { accent?: string; onExit?: () => void };

  private box: HTMLElement;
  private wrappedHere = false;
  private root: HTMLDivElement;
  private counterEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private coverEl!: HTMLElement;
  private helpEl!: HTMLElement;
  private jumpEl!: HTMLElement;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private digitsTimer: ReturnType<typeof setTimeout> | null = null;
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private overviewEl!: HTMLElement;
  private gridEl!: HTMLElement;
  private overviewSel = 0;
  /** A picture of every stop (by stop index), made once before the talk: for the overview and the presenter view's "next". */
  private thumbs = new Map<number, string>();
  private thumbsPromise: Promise<void> | null = null;
  private waitEl!: HTMLElement;
  private view: { win: Window; timer: ReturnType<typeof setInterval>; started: number; els: Record<string, HTMLElement>; onClose: () => void } | null = null;
  private digits = '';
  private downAt: { x: number; y: number } | null = null;
  private swiped = false;
  private canvasCursor = '';
  private destroyed = false;
  private wasWrapAttr = false;

  private onKey = (e: KeyboardEvent) => this.handleKey(e);
  private onStop = (e: StopEvent) => this.handleStop(e);
  private onSeeked = () => this.refresh();
  private onFrame = () => this.mirror();
  private onEnded = () => this.handleEnded();
  private onPointerDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY }; this.swiped = false; };
  private onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
  private onPointerMove = () => this.wake();
  private onClick = () => this.handleClick();
  private wasFullscreen = false;
  private onFullscreenChange = () => {
    const now = document.fullscreenElement === this.box;
    if (this.wasFullscreen && !now) this.options.onExit?.();
    this.wasFullscreen = now;
  };

  constructor(movie: Movie, options: PresenterOptions) {
    if (!options || !options.canvas) throw new Error('Presenter requires options.canvas (HTMLCanvasElement).');
    warnUnknownOptions('Presenter', options, OPTION_KEYS);
    this.movie = movie;
    this.options = {
      canvas: options.canvas, keyboard: options.keyboard ?? true, clickToAdvance: options.clickToAdvance ?? true, swipe: options.swipe ?? true,
      indicator: options.indicator ?? true, autoAdvance: options.autoAdvance ?? true, loop: options.loop ?? false, accent: options.accent, onExit: options.onExit,
    };
    if ((movie.stops?.length ?? 0) === 0) {
      console.warn('pixi-effects: Presenter: this movie has no stops, so there is nowhere to pause; add `stops: [2, 5, 9]` (seconds) to the composition. next() and back still work.');
    }
    installStyles();
    const canvas = this.options.canvas;
    this.box = this.positioningBox(canvas);
    this.wasWrapAttr = this.box.hasAttribute('data-pr-wrap');
    this.box.setAttribute('data-pr-wrap', '');
    this.root = document.createElement('div');
    this.root.className = 'movie-presenter';
    this.root.setAttribute('data-idle', 'false');
    if (this.options.accent) this.root.style.setProperty('--mp-accent', this.options.accent);
    this.root.innerHTML = `
      ${this.options.indicator ? '<div class="mp-progress"></div><div class="mp-info"><span class="mp-title"></span><span class="mp-counter"></span></div>' : ''}
      <div class="mp-wait" data-open="false">Preparing…</div>
      <div class="mp-jump" data-active="false"></div>
      <div class="mp-overview" data-open="false" role="dialog" aria-label="Pages"><div class="mp-grid"></div><div class="mp-overview-hint">← → ↑ ↓ choose  ·  Enter or click: go  ·  G or Esc: close</div></div>
      <div class="mp-cover" data-mode="off"></div>
      <div class="mp-help" data-open="false" role="dialog" aria-label="Keys"><h3>KEYS</h3><dl>${HELP.map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('')}</dl></div>`;
    this.box.appendChild(this.root);
    this.counterEl = this.root.querySelector('.mp-counter');
    this.titleEl = this.root.querySelector('.mp-title');
    this.progressEl = this.root.querySelector('.mp-progress');
    this.coverEl = this.root.querySelector('.mp-cover') as HTMLElement;
    this.helpEl = this.root.querySelector('.mp-help') as HTMLElement;
    this.jumpEl = this.root.querySelector('.mp-jump') as HTMLElement;
    this.waitEl = this.root.querySelector('.mp-wait') as HTMLElement;
    this.overviewEl = this.root.querySelector('.mp-overview') as HTMLElement;
    this.gridEl = this.root.querySelector('.mp-grid') as HTMLElement;
    this.coverEl.addEventListener('click', () => this.setCover('off'));

    this.canvasCursor = canvas.style.cursor;
    if (this.options.clickToAdvance) { canvas.style.cursor = 'pointer'; canvas.addEventListener('click', this.onClick); }
    if (this.options.swipe) { canvas.addEventListener('pointerdown', this.onPointerDown); canvas.addEventListener('pointerup', this.onPointerUp); }
    canvas.addEventListener('pointermove', this.onPointerMove);
    if (this.options.keyboard) document.addEventListener('keydown', this.onKey);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    movie.on('stop', this.onStop);
    movie.on('seeked', this.onSeeked);
    movie.on('ended', this.onEnded);
    this.refresh();
    this.wake();
  }

  /** Enter presentation: ask for fullscreen (a browser needs a click or key press for that) and play to the first stop. */
  async start(): Promise<void> {
    this.waitEl.setAttribute('data-open', 'true');                       // "Preparing": the pictures are made before the audience sees a thing
    try { await this.ensureThumbs(); } finally { this.waitEl.setAttribute('data-open', 'false'); }
    await this.enterFullscreen();
    await this.next();
  }

  /** Leave fullscreen. */
  async exit(): Promise<void> {
    if (document.fullscreenElement === this.box) await document.exitFullscreen?.().catch(() => {});
  }

  next(): Promise<void> { this.cancelAdvance(); return this.run(() => this.movie.next()); }
  prev(): Promise<void> { this.cancelAdvance(); return this.run(() => this.movie.prev()); }

  /** Black out (`'black'`), white out (`'white'`) or bring the picture back (`'off'`). */
  setCover(mode: 'black' | 'white' | 'off'): void {
    this.coverEl.setAttribute('data-mode', mode);
    if (mode !== 'off') this.cancelAdvance();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const canvas = this.options.canvas;
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    canvas.removeEventListener('click', this.onClick);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    this.closePresenterView();
    this.movie.off('stop', this.onStop);
    this.movie.off('seeked', this.onSeeked);
    this.movie.off('ended', this.onEnded);
    for (const t of [this.idleTimer, this.digitsTimer, this.advanceTimer, this.loopTimer]) if (t) clearTimeout(t);
    canvas.style.cursor = this.canvasCursor;
    this.root.remove();
    if (!this.wasWrapAttr) this.box.removeAttribute('data-pr-wrap');
    if (this.wrappedHere) {
      const parent = this.box.parentElement;
      if (parent) { parent.insertBefore(canvas, this.box); this.box.remove(); }
    }
  }

  // ── internals ──

  private positioningBox(canvas: HTMLCanvasElement): HTMLElement {
    const parent = canvas.parentElement;
    if (!parent) throw new Error('Presenter: canvas must be attached to the DOM before constructing.');
    const pos = getComputedStyle(parent).position;
    if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') return parent;
    const wrap = document.createElement('div');
    wrap.className = 'movie-presenter-wrap';
    wrap.style.cssText = 'position: relative; display: inline-block; line-height: 0;';
    parent.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
    this.wrappedHere = true;
    return wrap;
  }

  private run(fn: () => Promise<void>): Promise<void> {
    return fn().catch(err => { console.warn('pixi-effects: Presenter:', err); });
  }

  private async enterFullscreen(): Promise<void> {
    const box = this.box as HTMLElement & { requestFullscreen?: () => Promise<void> };
    try { await box.requestFullscreen?.(); } catch { /* the browser said no (no gesture, or iPhone Safari): present in the page */ }
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement === this.box) void this.exit();
    else void this.enterFullscreen();
  }

  private cancelAdvance(): void {
    if (this.advanceTimer) { clearTimeout(this.advanceTimer); this.advanceTimer = null; }
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
  }

  private handleStop(e: StopEvent): void {
    this.refresh();
    this.cancelAdvance();
    if (this.options.autoAdvance && e.stop.advance !== undefined && this.coverEl.getAttribute('data-mode') === 'off') {
      this.advanceTimer = setTimeout(() => { this.advanceTimer = null; void this.next(); }, e.stop.advance * 1000);
    }
  }

  private handleEnded(): void {
    this.refresh();
    if (!this.options.loop) return;
    this.cancelAdvance();
    this.loopTimer = setTimeout(() => {
      this.loopTimer = null;
      void this.run(async () => { await this.movie.gotoFrame(0, true); await this.movie.next(); });
    }, 800);
  }

  private refresh(): void {
    const m = this.movie;
    const pages = m.pageCount ?? 0, stops = m.stops?.length ?? 0;
    if (this.counterEl) {
      this.counterEl.textContent = pages > 0 ? `${m.pageIndex >= 0 ? m.pageIndex + 1 : '–'} / ${pages}` : '';
      this.counterEl.style.display = pages > 0 ? '' : 'none';
    }
    if (this.titleEl) this.titleEl.textContent = m.currentStop?.page ?? '';
    if (this.progressEl) this.progressEl.style.setProperty('--mp-fill', String(stops > 0 ? (m.stopIndex + 1) / stops : 0));
    this.refreshView();
  }

  private wake(): void {
    this.root.setAttribute('data-idle', 'false');
    if (this.options.clickToAdvance) this.options.canvas.style.cursor = 'pointer';
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.root.setAttribute('data-idle', 'true');
      this.options.canvas.style.cursor = 'none';
    }, IDLE_MS);
  }

  private showDigits(): void {
    this.jumpEl.textContent = this.digits ? `→ ${this.digits}` : '';
    this.jumpEl.setAttribute('data-active', this.digits ? 'true' : 'false');
    if (this.digitsTimer) clearTimeout(this.digitsTimer);
    this.digitsTimer = this.digits ? setTimeout(() => { this.digits = ''; this.showDigits(); }, DIGITS_MS) : null;
  }

  /** Something that moves the presentation: if the screen is blacked out (or the key list is open) the first press only brings it back. */
  private navigate(go: () => void): void {
    if (this.coverEl.getAttribute('data-mode') !== 'off') { this.setCover('off'); return; }
    if (this.helpEl.getAttribute('data-open') === 'true') { this.helpEl.setAttribute('data-open', 'false'); return; }
    go();
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = e.key;
    let handled = true;
    this.wake();
    if (k === 'g' || k === 'G') { this.toggleOverview(); e.preventDefault(); return; }
    if (this.overviewOpen()) { if (this.handleOverviewKey(e)) e.preventDefault(); return; }
    if (k >= '0' && k <= '9' && k.length === 1) { this.digits = (this.digits + k).slice(0, 4); this.showDigits(); }
    else if (k === 'Enter' && this.digits) {
      const page = Number(this.digits) - 1; this.digits = ''; this.showDigits();
      this.navigate(() => { this.cancelAdvance(); void this.run(() => this.movie.goToPage(page)); });
    }
    else if (k === 'Backspace' && this.digits) { this.digits = this.digits.slice(0, -1); this.showDigits(); }
    else if (NEXT_KEYS.has(k)) this.navigate(() => void this.next());
    else if (PREV_KEYS.has(k)) this.navigate(() => void this.prev());
    else if (k === 'Home') this.navigate(() => { this.cancelAdvance(); void this.run(() => this.movie.goToPage(0)); });
    else if (k === 'End') this.navigate(() => { this.cancelAdvance(); void this.run(() => this.movie.goToStop(Math.max(0, (this.movie.stops?.length ?? 1) - 1))); });
    else if (k === 'b' || k === 'B' || k === '.') this.setCover(this.coverEl.getAttribute('data-mode') === 'black' ? 'off' : 'black');
    else if (k === 'w' || k === 'W' || k === ',') this.setCover(this.coverEl.getAttribute('data-mode') === 'white' ? 'off' : 'white');
    else if (k === 'p' || k === 'P') this.togglePresenterView();
    else if (k === 'f' || k === 'F') this.toggleFullscreen();
    else if (k === '?' || k === 'h' || k === 'H') this.helpEl.setAttribute('data-open', this.helpEl.getAttribute('data-open') === 'true' ? 'false' : 'true');
    else if (k === 'Escape') {
      if (this.helpEl.getAttribute('data-open') === 'true') this.helpEl.setAttribute('data-open', 'false');
      else if (this.coverEl.getAttribute('data-mode') !== 'off') this.setCover('off');
      else if (this.digits) { this.digits = ''; this.showDigits(); }
      else if (document.fullscreenElement === this.box) handled = false;       // the browser's own Escape leaves fullscreen (and the change ends the session)
      else if (this.options.onExit) this.options.onExit();
    }
    else handled = false;
    if (handled) e.preventDefault();
  }

  // ── the presenter view: a second window for the speaker ──

  private togglePresenterView(): void {
    if (this.view && !this.view.win.closed) this.closePresenterView();
    else this.openPresenterView();
  }

  /** Open the speaker's window: what is on screen (live), the next picture, the notes of the page, a timer, and next / back. Returns it (null if the browser blocked the popup). */
  openPresenterView(): Window | null {
    if (this.view && !this.view.win.closed) { this.view.win.focus(); return this.view.win; }
    this.closePresenterView();
    const win = window.open('', 'pixi-effects-presenter-view', 'popup=yes,width=1180,height=720');
    if (!win) { console.warn('pixi-effects: Presenter: the browser blocked the presenter view popup; allow popups for this page and press P again.'); return null; }
    const doc = win.document;
    doc.title = 'Presenter view';
    const style = doc.createElement('style');
    style.textContent = VIEW_CSS;
    doc.head.appendChild(style);
    const { width, height } = this.options.canvas;
    doc.body.innerHTML = `<div class="pv" style="--pv-ratio: ${width} / ${height}">
      <div class="pv-main"><div class="pv-label">NOW</div><canvas class="pv-now" width="${Math.min(width, 960)}" height="${Math.round(height * Math.min(width, 960) / width)}"></canvas></div>
      <div class="pv-side">
        <div class="pv-top"><span class="pv-count"></span><span class="pv-title"></span><span class="pv-timer">00:00</span><button class="pv-reset" type="button">reset</button></div>
        <div><div class="pv-label">NEXT</div><div class="pv-nextbox" data-end="false"><img class="pv-next" alt=""><div class="pv-end">END OF THE TALK</div></div></div>
        <div class="pv-notes" data-empty="true"></div>
        <div class="pv-buttons"><button class="pv-prev" type="button">◀ Back</button><button class="pv-nextbtn" type="button">Next ▶</button></div>
      </div></div>`;
    const els: Record<string, HTMLElement> = {};
    for (const c of ['count', 'title', 'timer', 'next', 'nextbox', 'notes', 'now']) els[c] = doc.querySelector(`.pv-${c}`) as HTMLElement;
    const started = Date.now();
    const onClose = () => { if (this.view && this.view.win === win) this.closePresenterView(); };
    const timer = setInterval(() => { els.timer!.textContent = clock(Date.now() - this.view!.started); }, 1000);
    this.view = { win, timer, started, els, onClose };
    (doc.querySelector('.pv-nextbtn') as HTMLElement).addEventListener('click', () => void this.next());
    (doc.querySelector('.pv-prev') as HTMLElement).addEventListener('click', () => void this.prev());
    (doc.querySelector('.pv-reset') as HTMLElement).addEventListener('click', () => { this.view!.started = Date.now(); els.timer!.textContent = '00:00'; });
    if (this.options.keyboard) doc.addEventListener('keydown', this.onKey);
    win.addEventListener?.('pagehide', onClose);
    this.movie.on('frame', this.onFrame);
    void this.ensureThumbs();
    this.refreshView();
    this.mirror();
    return win;
  }

  closePresenterView(): void {
    const v = this.view;
    if (!v) return;
    this.view = null;
    clearInterval(v.timer);
    this.movie.off('frame', this.onFrame);
    try { v.win.document.removeEventListener('keydown', this.onKey); v.win.removeEventListener?.('pagehide', v.onClose); } catch { /* the window is already gone */ }
    if (!v.win.closed) { try { v.win.close(); } catch { /* ignore */ } }
  }

  /** Copy what the movie has just drawn into the view (called from the `frame` event, right after the render, when the canvas can be read). */
  private mirror(): void {
    const v = this.view;
    if (!v || v.win.closed) return;
    const c = v.els.now as HTMLCanvasElement;
    c.getContext('2d')?.drawImage(this.options.canvas, 0, 0, c.width, c.height);
  }

  private refreshView(): void {
    const v = this.view;
    if (!v || v.win.closed) return;
    const m = this.movie;
    const stops = m.stops ?? [];
    const pages = m.pageCount ?? 0;
    const cur = m.stopIndex ?? -1;
    v.els.count!.textContent = pages > 0 ? `${m.pageIndex >= 0 ? m.pageIndex + 1 : '–'} / ${pages}` : '';
    v.els.title!.textContent = m.currentStop?.page ?? (cur < 0 ? stops[0]?.page ?? '' : '');
    // the notes of the page the talk is in (before the first stop: of the first page, "coming up"): the latest ones written on or before this stop
    const upTo = cur < 0 ? 0 : cur, pageIndex = stops[upTo]?.pageIndex;
    let notes = '';
    for (const s of stops) if (s.pageIndex === pageIndex && s.index <= upTo && s.notes) notes = s.notes;
    v.els.notes!.textContent = notes;
    v.els.notes!.setAttribute('data-empty', String(notes === ''));
    const next = stops[cur + 1];
    v.els.nextbox!.setAttribute('data-end', String(!next));
    const src = next ? this.thumbs.get(next.index) : undefined;
    if (src) v.els.next!.setAttribute('src', src); else v.els.next!.removeAttribute('src');
  }

  // ── the overview ──

  private pageStops(): Stop[] { return (this.movie.stops ?? []).filter(s => s.pageStart); }
  private overviewOpen(): boolean { return this.overviewEl.getAttribute('data-open') === 'true'; }

  private toggleOverview(): void {
    if (this.overviewOpen()) { this.overviewEl.setAttribute('data-open', 'false'); return; }
    if (this.pageStops().length === 0) return;
    this.cancelAdvance();
    if (this.movie.isPlaying) this.movie.pause();
    this.helpEl.setAttribute('data-open', 'false');
    this.buildOverview();
    this.overviewEl.setAttribute('data-open', 'true');
    void this.ensureThumbs();
  }

  /**
   * Make a picture of every stop, once. Taking them moves the playhead through the stops and back, which the audience would see:
   * `start()` does it before anything is shown (behind a "Preparing" cover), and an overview opened before that does it on the spot.
   */
  ensureThumbs(): Promise<void> {
    this.thumbsPromise ??= (async () => {
      try {
        await this.movie.stopImages({
          which: 'stops', as: 'dataURL', type: 'image/jpeg', quality: 0.72, scale: Math.min(1, 480 / Math.max(1, this.options.canvas.width)),
          onImage: img => { this.thumbs.set(img.stop.index, img.image as string); this.onThumb(img.stop.index); },
        });
      } catch (err) {
        console.warn('pixi-effects: Presenter: could not make the page pictures:', err);
        this.thumbsPromise = null;
      }
    })();
    return this.thumbsPromise;
  }

  /** A page's picture is its last stop's (the page fully built). */
  private pageThumb(page: number): string | undefined {
    const stops = (this.movie.stops ?? []).filter(s => s.pageIndex === page);
    return stops.length ? this.thumbs.get(stops[stops.length - 1]!.index) : undefined;
  }

  private onThumb(stopIndex: number): void {
    const stop = this.movie.stops?.[stopIndex];
    if (stop) this.fillThumb(stop.pageIndex);
    this.refreshView();
  }

  private buildOverview(): void {
    const pages = this.pageStops();
    const { width, height } = this.options.canvas;
    const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(pages.length))));
    this.gridEl.style.setProperty('--mp-cols', String(cols));
    this.gridEl.style.setProperty('--mp-ratio', `${width} / ${height}`);
    this.gridEl.innerHTML = '';
    const current = Math.max(0, this.movie.pageIndex ?? 0);
    pages.forEach((s, i) => {
      const cell = document.createElement('div');
      cell.className = 'mp-cell';
      cell.setAttribute('data-current', String(i === this.movie.pageIndex));
      cell.setAttribute('data-selected', String(i === current));
      cell.innerHTML = `<div class="mp-cell-label"><span class="mp-cell-num">${i + 1}</span><span class="mp-cell-name"></span></div>`;
      (cell.querySelector('.mp-cell-name') as HTMLElement).textContent = s.page ?? '';
      cell.addEventListener('click', () => { this.overviewEl.setAttribute('data-open', 'false'); this.cancelAdvance(); void this.run(() => this.movie.goToPage(i)); });
      this.gridEl.appendChild(cell);
      this.fillThumb(i);
    });
    this.overviewSel = current;
  }

  private fillThumb(page: number): void {
    const cell = this.gridEl.children[page] as HTMLElement | undefined;
    const src = this.pageThumb(page);
    if (!cell || !src || cell.querySelector('img')) return;
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    cell.insertBefore(img, cell.firstChild);
  }

  private select(i: number): void {
    const cells = [...this.gridEl.children] as HTMLElement[];
    this.overviewSel = Math.min(cells.length - 1, Math.max(0, i));
    cells.forEach((c, k) => c.setAttribute('data-selected', String(k === this.overviewSel)));
    cells[this.overviewSel]?.scrollIntoView?.({ block: 'nearest' });
  }

  private handleOverviewKey(e: KeyboardEvent): boolean {
    const cols = Number(this.gridEl.style.getPropertyValue('--mp-cols')) || 3;
    switch (e.key) {
      case 'ArrowRight': this.select(this.overviewSel + 1); return true;
      case 'ArrowLeft': this.select(this.overviewSel - 1); return true;
      case 'ArrowDown': this.select(this.overviewSel + cols); return true;
      case 'ArrowUp': this.select(this.overviewSel - cols); return true;
      case 'Enter': { const page = this.overviewSel; this.overviewEl.setAttribute('data-open', 'false'); this.cancelAdvance(); void this.run(() => this.movie.goToPage(page)); return true; }
      case 'Escape': this.overviewEl.setAttribute('data-open', 'false'); return true;
      default: return NEXT_KEYS.has(e.key) || PREV_KEYS.has(e.key);        // swallowed: the presentation does not move underneath
    }
  }

  private handleClick(): void {
    if (this.swiped) { this.swiped = false; return; }
    this.wake();
    this.navigate(() => void this.next());
  }

  private handlePointerUp(e: PointerEvent): void {
    const d = this.downAt; this.downAt = null;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx)) return;
    this.swiped = true;
    this.wake();
    this.navigate(() => void (dx < 0 ? this.next() : this.prev()));
  }
}
