// examples/playground/app.js — the Playground: an editor on the chat template's edit block, the movie in a sandboxed iframe, a problems panel.
import presets, { extraImportsFor } from './presets/index.js';
import { createRunner } from './host.js';
import { createEditor } from './editor.js';
import { renderProblems } from './problems.js';

const $ = (id) => document.getElementById(id);
const toolbar = { preset: $('preset'), run: $('run'), state: $('state') };
const problemsBox = $('problems'), host = $('host');

const here = (rel) => new URL(rel, import.meta.url).href;
const runner = createRunner({
  container: host,
  templateUrl: here('../../ai/chat-template.html'),
  distBase: here('../../dist/'),
  assetBase: here('../'),                                   // examples/: presets name their files as _assets/…
  extraImportsFor,
});

const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
toolbar.run.textContent = `▶ Run (${mac ? '⌘↵' : 'Ctrl+↵'})`;
for (const p of presets) toolbar.preset.append(Object.assign(document.createElement('option'), { value: p.id, textContent: p.label }));

function setState(text, kind = '') { toolbar.state.textContent = text; toolbar.state.dataset.kind = kind; }

let editor = null, runId = 0, last = { status: null, review: null };

async function run() {
  if (!editor) return null;
  const id = ++runId;
  toolbar.run.disabled = true;
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
  last = { status, review };
  const logs = review?.logs ?? status.logs ?? [];
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

toolbar.run.addEventListener('click', run);
toolbar.preset.addEventListener('change', () => { if (load(toolbar.preset.value)) run(); });

editor = await createEditor({ parent: $('editor'), doc: presets[0].code, onRun: run });
// what the tests (and, later, the page's tools) use
window.__playground = { runner, editor, presets, run, load, get last() { return last; } };
run();
