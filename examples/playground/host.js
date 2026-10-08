// examples/playground/host.js — runs a movie page in a sandboxed iframe (no origin) and talks to it through the bridge.
import { compose } from './doc.js';
import { validateCommand } from './bridge.js';

export function createRunner({ container, templateUrl, distBase, assetBase, extraImportsFor = () => ({}), onEvent = () => {} }) {
  let frame = null, template = null, nextId = 1, listener = null, settle = null;
  const pending = new Map();

  async function getTemplate() { return (template ??= await (await fetch(templateUrl)).text()); }

  function destroy() {
    if (listener) { removeEventListener('message', listener); listener = null; }
    if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }                 // the page and its GL context go with the frame
    for (const [, p] of pending) p.reject(new Error('the movie was replaced'));
    pending.clear();
    if (settle) { settle({ ready: false, failed: 'replaced by a newer run', replaced: true }); settle = null; }   // a run() still waiting must not hang
  }

  function call(cmd, args = {}) {
    const msg = { id: nextId++, cmd, args };
    const v = validateCommand(msg);
    if (!v.ok) return Promise.reject(new Error(v.error));
    if (!frame) return Promise.reject(new Error('nothing is running: press Run'));
    return new Promise((resolve, reject) => { pending.set(msg.id, { resolve, reject }); frame.contentWindow.postMessage(msg, '*'); });
  }

  /** Replace the movie with one made from `code`. Resolves with the status when it is ready or has failed. */
  async function run(code) {
    const templateHtml = await getTemplate();
    destroy();                                                                 // after the await: two quick runs never leave two frames
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
        if (d.event === 'ready') { onEvent(d); settle = null; resolve({ ...d.status, failed: undefined }); return; }
        if (d.event === 'failed') { onEvent(d); settle = null; resolve({ ...d.status, ready: false, failed: d.error }); return; }
        const p = pending.get(d.id);
        if (p) { pending.delete(d.id); d.ok ? p.resolve(d.result) : p.reject(new Error(d.error)); }
      };
      addEventListener('message', listener);
    });
    mine.srcdoc = html;
    container.appendChild(mine);
    return settled;
  }

  return { run, call, destroy };
}
