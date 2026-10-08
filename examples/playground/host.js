// examples/playground/host.js — runs a movie page in a sandboxed iframe (no origin) and talks to it through the bridge.
import { compose } from './doc.js';
import { validateCommand } from './bridge.js';

const START_TIMEOUT_MS = 70000;                                // the frame's own give-up is 60 s; this one works even when the frame's loop is stuck
const COMMAND_TIMEOUT_MS = 120000, RENDER_TIMEOUT_MS = 600000;

/** `startTimeoutMs` / `commandTimeoutMs`: how long to wait for the movie to become ready / for one command's answer (the tests shorten them). */
export function createRunner({ container, templateUrl, distBase, assetBase, extraImportsFor = () => ({}), onEvent = () => {}, startTimeoutMs = START_TIMEOUT_MS, commandTimeoutMs }) {
  let frame = null, template = null, nextId = 1, listener = null, settle = null;
  let starting = false, loaded = false, startTimer = 0;                 // a run is under way / the movie has said it is ready or has failed: only then does the bridge answer
  const pending = new Map();

  async function getTemplate() { return (template ??= await (await fetch(templateUrl)).text()); }

  function destroy() {
    if (listener) { removeEventListener('message', listener); listener = null; }
    if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }                 // the page and its GL context go with the frame
    for (const [, p] of pending) p.reject(new Error('the movie was replaced'));
    pending.clear();
    clearTimeout(startTimer);
    starting = false; loaded = false;
    if (settle) { settle({ ready: false, failed: 'replaced by a newer run', replaced: true }); settle = null; }   // a run() still waiting must not hang
  }

  function call(cmd, args = {}) {
    const msg = { id: nextId++, cmd, args };
    const v = validateCommand(msg);
    if (!v.ok) return Promise.reject(new Error(v.error));
    if (!frame && !starting) return Promise.reject(new Error('nothing is running: press Run'));
    if (!loaded) return Promise.reject(new Error('the movie is still starting: wait until it is ready (a command sent now would be lost)'));
    const limit = commandTimeoutMs ?? (cmd === 'render' ? RENDER_TIMEOUT_MS : COMMAND_TIMEOUT_MS);
    return new Promise((resolve, reject) => {
      // a frame that stops answering (an endless loop) must not hold a caller, or an agent's queue, for ever
      const timer = setTimeout(() => { pending.delete(msg.id); reject(new Error(`the movie did not answer "${cmd}" in ${Math.round(limit / 1000) || '<1'} s (does its code loop forever? press Run to start again)`)); }, limit);
      pending.set(msg.id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      frame.contentWindow.postMessage(msg, '*');
    });
  }

  /** Replace the movie with one made from `code`. Resolves with the status when it is ready or has failed. */
  async function run(code) {
    starting = true; loaded = false;
    let templateHtml;
    try { templateHtml = await getTemplate(); } catch (e) { starting = false; throw e; }
    destroy();                                                                 // after the await: two quick runs never leave two frames
    starting = true;
    const html = compose(templateHtml, code, { distBase, assetBase, extraImports: extraImportsFor(code) });
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-downloads');           // no allow-same-origin: no access to this page or this site's data
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('title', 'The video');
    const mine = frame;
    const settled = new Promise((resolve) => {
      settle = resolve;
      listener = (event) => {
        if (event.source !== mine.contentWindow) return;                      // only our own frame
        const d = event.data;
        if (!d || typeof d !== 'object') return;
        if (d.event === 'ready') { onEvent(d); clearTimeout(startTimer); settle = null; loaded = true; starting = false; resolve({ ...d.status, failed: undefined }); return; }
        if (d.event === 'failed') { onEvent(d); clearTimeout(startTimer); settle = null; loaded = true; starting = false; resolve({ ...d.status, ready: false, failed: d.error }); return; }
        const p = pending.get(d.id);
        if (p) { pending.delete(d.id); d.ok ? p.resolve(d.result) : p.reject(new Error(d.error)); }
      };
      addEventListener('message', listener);
    });
    startTimer = setTimeout(() => {
      if (frame !== mine || !settle) return;
      const done = settle; settle = null;
      destroy();
      done({ ready: false, failed: `the movie did not become ready in ${Math.round(startTimeoutMs / 1000)} s (does its code loop forever?)` });
    }, startTimeoutMs);
    mine.srcdoc = html;
    container.appendChild(mine);
    return settled;
  }

  return { run, call, destroy };
}
