// mediabunny (about 180 KB gzipped) is what writes a video file and decodes a `video` layer. A page that only plays never needs it, so it is
// fetched the first time something asks for it: `movie.render()`, a video asset. Nothing imports it at the top of a module.
import type * as Mediabunny from 'mediabunny';

/** The mediabunny module, as `import * as mb from 'mediabunny'` gives it. */
export type MediabunnyModule = typeof Mediabunny;

/**
 * Where mediabunny comes from, for {@link useMediabunny}:
 * - the module itself (`import * as mb from 'mediabunny'`: it is ready, nothing is fetched),
 * - a URL to `import()` (a page with no import map entry for it),
 * - a function that returns the module (`() => import('mediabunny')`, your own copy, a bundler chunk).
 */
export type MediabunnySource = MediabunnyModule | string | (() => Promise<MediabunnyModule>);

let source: MediabunnySource | null = null;
let pending: Promise<MediabunnyModule> | null = null;

/**
 * Says where mediabunny comes from. Without it, the bare name `'mediabunny'` is imported the first time it is needed, which your bundler or the
 * page's import map resolves. A page that only plays (no export, no `video` layer) needs neither this nor an import map entry for it.
 * Calling it again replaces the source for the next load; a module that was already loaded stays in use by what holds it.
 */
export function useMediabunny(from: MediabunnySource): void {
  if (from == null || (typeof from !== 'string' && typeof from !== 'function' && typeof from !== 'object')) {
    throw new TypeError(`pixi-effects: useMediabunny() takes the mediabunny module, a URL or a function that returns the module; it got ${String(from)}`);
  }
  source = from;
  pending = null;
}

/** The mediabunny module, fetched once (the first call starts it; later calls share it). A failed load is tried again on the next call. */
export function loadMediabunny(): Promise<MediabunnyModule> {
  if (!pending) {
    const from = source;
    const p = fetchModule(from).then(
      (mod) => {
        if (!mod || typeof (mod as { Output?: unknown }).Output !== 'function') {
          throw new Error(`pixi-effects: ${describe(from)} did not give the mediabunny module (no Output in it). ${HOW}`);
        }
        return mod;
      },
      (err: unknown) => {
        const why = err instanceof Error ? err.message : String(err);
        throw new Error(`pixi-effects: could not load mediabunny from ${describe(from)} (${why}). ${HOW}`, { cause: err });
      },
    );
    pending = p;
    p.catch(() => { if (pending === p) pending = null; });   // the next call tries again (a network blip, an import map added later)
  }
  return pending;
}

const HOW = 'mediabunny is needed to export (movie.render(), the download button) and for a video layer; playing needs nothing. '
  + 'Add it to the import map ("mediabunny": "https://cdn.jsdelivr.net/npm/mediabunny@1/+esm"), install it next to pixi-effects, '
  + 'or call useMediabunny(module | url | () => import(...)) before you export.';

function fetchModule(from: MediabunnySource | null): Promise<MediabunnyModule> {
  if (from === null) return import('mediabunny');
  if (typeof from === 'string') return import(/* @vite-ignore */ /* webpackIgnore: true */ from) as Promise<MediabunnyModule>;
  if (typeof from === 'function') return Promise.resolve().then(from);
  return Promise.resolve(from);
}

function describe(from: MediabunnySource | null): string {
  if (from === null) return "'mediabunny' (the bare name: an import map or a bundler resolves it)";
  if (typeof from === 'string') return from;
  if (typeof from === 'function') return 'the function given to useMediabunny()';
  return 'the object given to useMediabunny()';
}
