// examples/playground/app.js — the Playground: an editor on the chat template's edit block, the movie in a sandboxed iframe, a problems panel.
import presets, { extraImportsFor } from './presets/index.js';
import { createRunner } from './host.js';
import { createEditor } from './editor.js';
import { renderProblems } from './problems.js';
import { shareUrl, codeFromHash } from './share.js';
import { standalone } from './doc.js';
import { registerTools } from './mcp.js';

const $ = (id) => document.getElementById(id);
const toolbar = { preset: $('preset'), run: $('run'), state: $('state') };
const problemsBox = $('problems'), host = $('host');

const here = (rel) => new URL(rel, import.meta.url).href;
const templateUrl = here('../../ai/chat-template.html');
const runner = createRunner({
  container: host,
  templateUrl,
  distBase: here('../../dist/'),
  assetBase: here('../'),                                   // examples/: presets name their files as _assets/…
  extraImportsFor,
});

const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
toolbar.run.textContent = `▶ Run (${mac ? '⌘↵' : 'Ctrl+↵'})`;
for (const p of presets) toolbar.preset.append(Object.assign(document.createElement('option'), { value: p.id, textContent: p.label }));

function setState(text, kind = '') { toolbar.state.textContent = text; toolbar.state.dataset.kind = kind; }

const hostNote = $('hostNote');
let editor = null, runId = 0, last = { status: null, review: null }, notices = [];

async function run() {
  if (!editor) return null;
  const id = ++runId;
  toolbar.run.disabled = true;
  hostNote.hidden = true;
  setState('Running…');
  renderProblems(problemsBox, { running: true });
  let status, review = null, failed = null;
  try {
    status = await runner.run(editor.get());
    if (id !== runId) return null;                              // a newer run took over
    if (status.ready) {
      if (status.width && status.height) host.style.setProperty('--ar', `${status.width} / ${status.height}`);
      try { review = await runner.call('review'); } catch (e) { if (id !== runId) return null; failed = 'review failed: ' + (e && e.message || e); }
    } else failed = status.failed || 'the movie did not start';
  } catch (e) {
    if (id !== runId) return null;
    status = { ready: false, logs: [] }; failed = String((e && e.message) || e);
  }
  if (id !== runId) return null;
  last = { status, review, logs: null, failed };
  const logs = [...notices.splice(0), ...(review?.logs ?? status.logs ?? [])];
  last.logs = logs;
  const count = renderProblems(problemsBox, { logs, review, failed, onSeek: (frame) => runner.call('seek', { frame }).catch(() => {}) });
  if (status.ready) setState(`Ready · ${status.duration} s · ${status.width}×${status.height} · ${status.frameRate} fps${count ? ` · ${count} problem${count === 1 ? '' : 's'}` : ''}`, count ? 'bad' : '');
  else setState('The movie did not start', 'bad');
  toolbar.run.disabled = false;
  return last;
}

function load(id) {
  const p = presets.find((x) => x.id === id);
  if (!p || !editor) return null;
  toolbar.preset.value = p.id;
  editor.set(p.code);
  return p;
}

// ── share, save, copy ──
let flashTimer = 0;
function flash(text) {
  const el = $('flash'); el.textContent = text;
  clearTimeout(flashTimer); flashTimer = setTimeout(() => { el.textContent = ''; }, 1400);
}
/** Puts `text` on the clipboard; where that is not allowed it is shown in a box, selected, to copy by hand. */
async function copyText(text, what) {
  const out = $('shareOut');
  try { await navigator.clipboard.writeText(text); out.hidden = true; flash(`${what} copied`); }
  catch { out.hidden = false; out.value = text; out.focus(); out.select(); flash('Copy it from the box'); }
}
let templateText = null;
const getTemplate = async () => (templateText ??= await (await fetch(templateUrl)).text());

$('share').addEventListener('click', async () => {
  const url = await shareUrl(editor.get(), location.origin + location.pathname);
  window.__lastShare = url;
  await copyText(url, 'Link');
});
$('save').addEventListener('click', async () => {
  const code = editor.get();
  const html = standalone(await getTemplate(), code, { extraImports: extraImportsFor(code), assetBase: /\b_assets\//.test(code) ? here('../') : undefined });
  window.__lastSave = html;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: 'video.html' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  flash('Saved video.html');
});
$('copyAi').addEventListener('click', async () => {
  const text = 'Here is a pixi-effects video (the edit block of https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/chat-template.html). Change it as I ask, and keep the block\'s shape.\n\n```js\n' + editor.get() + '\n```';
  window.__lastCopy = text;
  await copyText(text, 'Text');
});

toolbar.run.addEventListener('click', run);
toolbar.preset.addEventListener('change', () => { if (load(toolbar.preset.value)) run(); });

// A shared link is opened but never run: someone else's code runs only when the person presses Run.
function showShared() {
  hostNote.textContent = 'A shared link was opened: read the code, then press Run.';
  hostNote.hidden = false;
  setState('Not running');
  renderProblems(problemsBox, {});
}
let shared = null;
if (location.hash.startsWith('#code=')) {
  try { shared = await codeFromHash(location.hash); } catch (e) { notices.push(String((e && e.message) || e)); }
}
editor = await createEditor({ parent: $('editor'), doc: shared ?? presets[0].code, onRun: run });
// what the tests (and, later, the page's tools) use
window.__playground = { runner, editor, presets, run, load, get last() { return last; } };
// ── tools for an AI agent in the browser (WebMCP), where the browser has it ──
const api = {
  getCode: () => editor.get(),
  setCode: (code) => editor.set(code),
  run: async () => {
    const r = await run();
    if (!r) return { ready: false, logs: [], failed: 'replaced by a newer run' };
    return { ...r.status, logs: r.logs, failed: r.failed || r.status.failed };
  },
  call: (cmd, args) => runner.call(cmd, args),
  examples: () => presets.map(({ id, label }) => ({ id, label })),
  loadExample: async (id) => load(id),
  docsUrl: (part) => here(`../../ai/reference/${part}.md`),
  fetchText: async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`could not read ${url} (${r.status})`); return r.text(); },
};
const agentNote = $('agent');
let tools = { count: 0, abort() {} };
try {
  tools = await registerTools(api, document.modelContext);
  agentNote.textContent = tools.count ? `AI agent tools: ${tools.count} (this page offers them to an AI agent in your browser)` : 'AI agent tools: this browser has no WebMCP';
} catch (e) {
  agentNote.textContent = `AI agent tools: could not register (${(e && e.message) || e})`; agentNote.dataset.kind = 'bad';
}
addEventListener('pagehide', () => tools.abort());

if (shared !== null) showShared(); else run();
// a link pasted into this tab later (only the #code= part changes, so the page is not reloaded): same rule, read first
addEventListener('hashchange', async () => {
  if (!location.hash.startsWith('#code=')) return;
  try { editor.set(await codeFromHash(location.hash)); runner.destroy(); showShared(); }
  catch (e) { renderProblems(problemsBox, { logs: [String((e && e.message) || e)] }); }
});
