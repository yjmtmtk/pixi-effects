/** The part of an AudioContext this needs (so a test can pass a fake). */
export interface ResumableContext {
  state: string;
  resume?: () => Promise<void>;
  addEventListener(type: 'statechange', fn: () => void): void;
  removeEventListener(type: 'statechange', fn: () => void): void;
}

/**
 * Run `start` once the context is `running`. A browser keeps a new AudioContext `suspended` until the user has
 * interacted with the page; scheduling a sound then would play it at a stale position once the context wakes up.
 * So when it is not running we ask it to resume and wait, and `start` reads the movie's position at that moment.
 * `gesture` (the window) is where the user's first click / key press is heard: resume() is asked again then.
 * Returns a cancel function (pause before the browser allowed the sound).
 */
export function startWhenRunning(ctx: ResumableContext, start: () => void, gesture?: EventTarget): () => void {
  if (ctx.state === 'running') { start(); return () => {}; }
  let done = false;
  const resume = (): void => { ctx.resume?.()?.catch(() => { /* still blocked: the picture plays silently */ }); };
  const stop = (): void => {
    done = true;
    ctx.removeEventListener('statechange', onState);
    for (const e of GESTURES) gesture?.removeEventListener(e, resume, true);
  };
  const onState = (): void => {
    if (done || ctx.state !== 'running') return;
    stop();
    start();
  };
  ctx.addEventListener('statechange', onState);
  // A resume() asked for before any user gesture is not granted later by itself (Chrome): ask again on the first one.
  for (const e of GESTURES) gesture?.addEventListener(e, resume, true);
  resume();
  return stop;
}

const GESTURES = ['pointerdown', 'mousedown', 'touchend', 'keydown'];
