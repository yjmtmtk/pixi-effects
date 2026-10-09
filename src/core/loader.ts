/**
 * The page's loader (see `src/loader.css`): a `.pe-loader` element that is on screen before any script runs. `movie.init()` finds it,
 * fades it out when the movie is ready and, if init fails, stops it and says so.
 */
import { STAGE_LABEL, type LoadProgressState } from './loadProgress';

export type LoaderOption = HTMLElement | string | false;

const FADE_FALLBACK_MS = 900;

/** The loader element for a canvas: the one named (element or selector), none (`false`), or a `.pe-loader` near the canvas (its box or a few levels up). */
export function resolveLoader(option: LoaderOption | undefined, canvas: HTMLCanvasElement | null): HTMLElement | null {
  if (option === false) return null;
  if (option instanceof HTMLElement) return option;
  if (typeof option === 'string') return document.querySelector<HTMLElement>(option);
  let box: Element | null = canvas?.parentElement ?? null;
  for (let level = 0; box && level < 4; level++, box = box.parentElement) {
    if (level > 0 && (box === document.body || box === document.documentElement)) break;     // never the whole page: that could be another movie's loader
    const found = box.querySelector<HTMLElement>('.pe-loader');
    if (found) return found;
  }
  return null;
}

/** Fade the loader out (a class, so the CSS transition runs) and take it away. Safe to call twice, or with null. */
export function dismissLoader(loader: HTMLElement | null): void {
  if (!loader || loader.classList.contains('pe-loader--done')) return;
  loader.classList.add('pe-loader--done');
  loader.setAttribute('aria-hidden', 'true');
  let removed = false;
  const remove = () => { if (!removed) { removed = true; loader.remove(); } };
  loader.addEventListener('transitionend', e => { if (e.target === loader && (e as TransitionEvent).propertyName === 'opacity') remove(); });   // not the bar's own transform transition
  setTimeout(remove, FADE_FALLBACK_MS);                       // no transition (display: none, reduced styles): still gone
}

/** init failed: stop the animation and say so, and leave the box on screen so the page does not look merely stuck. */
export function failLoader(loader: HTMLElement | null, message: string): void {
  if (!loader) return;
  loader.setAttribute('data-state', 'error');
  for (const a of ['data-stage', 'data-percent']) loader.removeAttribute(a);       // the error label, not "BUILDING LAYERS 42%"
  loader.querySelector('.pe-loader__bar')?.remove();
  if (loader.hasAttribute('data-label')) loader.setAttribute('data-label', message);
  loader.setAttribute('aria-busy', 'false');
}

/** How far init is: the share as `--pe-progress` (0 to 1, the bar scales by it), the stage and the percent as attributes (the label shows them). */
export function setLoaderProgress(loader: HTMLElement | null, state: LoadProgressState): void {
  if (!loader || loader.getAttribute('data-state') === 'error' || loader.classList.contains('pe-loader--done')) return;
  if (!loader.querySelector('.pe-loader__bar')) {
    const bar = loader.ownerDocument.createElement('i');
    bar.className = 'pe-loader__bar';
    bar.setAttribute('aria-hidden', 'true');
    loader.appendChild(bar);
  }
  loader.style.setProperty('--pe-progress', String(Math.round(state.progress * 1000) / 1000));
  loader.setAttribute('data-stage', STAGE_LABEL[state.stage]);
  loader.setAttribute('data-percent', String(Math.round(state.progress * 100)));
}
