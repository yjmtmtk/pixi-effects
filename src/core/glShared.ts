/**
 * The one WebGL2 context every shader layer of the page draws with. A context per layer would hit the browser's limit (about 16 live
 * contexts) after a few layers, and a composition with none must not make one: it is created on first use and let go when the last
 * layer is destroyed. If the browser takes it away (`webglcontextlost`), the next `currentGl()` makes a new one and a new `generation`,
 * and the layers compile their programs again.
 */
export interface SharedGl { gl: WebGL2RenderingContext; canvas: HTMLCanvasElement; generation: number }

let shared: SharedGl | null = null;
let generation = 0;
let refs = 0;
let unavailable = false;

function create(): SharedGl | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  const made: SharedGl = { gl, canvas, generation: ++generation };
  canvas.addEventListener('webglcontextlost', (e: Event) => {
    e.preventDefault();
    if (shared === made) shared = null;                         // the next currentGl() makes a new one
  });
  return made;
}

/** The context, made when there is none (or it was lost). Null when this browser has no WebGL2. */
export function currentGl(): SharedGl | null {
  if (shared) return shared;
  if (unavailable) return null;
  shared = create();
  if (!shared) unavailable = true;
  return shared;
}

/** A layer that draws with the shared context says so; the context lives while any does. */
export function acquireGl(): SharedGl | null { refs++; return currentGl(); }

export function releaseGl(): void {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && shared) {
    const lose = (shared.gl as { getExtension?: (n: string) => { loseContext(): void } | null }).getExtension?.('WEBGL_lose_context');
    try { lose?.loseContext(); } catch { /* already gone */ }
    shared = null;
  }
}

/** For tests: forget everything (a new test starts with no context and no memory of a browser without WebGL2). */
export function resetGl(): void { shared = null; generation = 0; refs = 0; unavailable = false; }
