# Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `examples/playground.html` — a CodeMirror-backed in-browser editor where users write a `movie.init({...})` call in TypeScript, hit Run (or `Cmd/Ctrl+Enter`), and see the result on a live canvas. A preset dropdown loads code copied from existing examples.

**Architecture:** Single static HTML file under `examples/`. Loads `pixi-effects` from `../dist/...` (matches the other examples) plus `sucrase` and CodeMirror 6 packages from esm.sh. The editor's text is a snippet that uses three injected variables — `movie`, `Controller`, `canvas`. Run cleans up the previous run via `Movie.destroy()` / `Controller.destroy()`, replaces the `<canvas>` with a fresh clone for a guaranteed-clean GL context, transforms the snippet via Sucrase (`transforms: ['typescript']`), wraps in `AsyncFunction` with the three injected args, and awaits it. Presets live in `examples/_presets/*.js` as default-exported template-literal source strings; `_presets/index.js` exposes a labeled list.

**Tech Stack:** Static HTML + ESM. CodeMirror 6 (`codemirror` meta + `@codemirror/lang-javascript` + `@codemirror/theme-one-dark`), Sucrase 3, `pixi-effects` `dist` bundle. No build, no tests — examples are manually verified in the browser, matching project convention (`vitest.config.ts` only runs `tests/**/*.test.ts`).

---

## File Structure

New files only:

| File | Responsibility |
| --- | --- |
| `examples/_presets/basic.js` | Default-export string: `Controller` + `movie.init({...})` body for basic example |
| `examples/_presets/shapes.js` | Same shape, copied from `examples/shapes.html` |
| `examples/_presets/transitions.js` | Same shape, copied from `examples/transitions.html` |
| `examples/_presets/chromakey.js` | Same shape, copied from `examples/chromakey.html` |
| `examples/_presets/nested.js` | Same shape, copied from `examples/nested.html` |
| `examples/_presets/index.js` | Imports the five preset strings, exports an array `{ id, label, code }[]` |
| `examples/playground.html` | The page: importmap, layout/CSS, toolbar markup, module script wiring CodeMirror + Run flow + preset dropdown |

No edits to `src/`, `dist/`, or other examples.

---

## Task 1: Add preset source modules

**Files:**
- Create: `examples/_presets/basic.js`
- Create: `examples/_presets/shapes.js`
- Create: `examples/_presets/transitions.js`
- Create: `examples/_presets/chromakey.js`
- Create: `examples/_presets/nested.js`
- Create: `examples/_presets/index.js`

Each preset module default-exports a backtick template literal whose body is the JS users would type into the editor. The body always:
- creates a `Controller` against the injected `canvas` (no `document.getElementById`),
- calls `await movie.init({ canvas, width, height, duration, frameRate, background?, composition: { sequences: [...] } })`,
- references `canvas` (not a DOM lookup) so it works under the injected scope.

- [ ] **Step 1: Create `examples/_presets/basic.js`**

Copy the body of the `<script type="module">` block from `examples/basic.html` (lines ~24–142 of that file), wrap it in a `export default \`...\`;` template literal, and replace `document.getElementById('stage')` with `canvas`. Drop the `window.__movie = movie;` line — irrelevant in the playground.

```js
// examples/_presets/basic.js
export default `new Controller(movie, { canvas });
await movie.init({
  canvas,
  width: 1280, height: 720, duration: 8, frameRate: 30,
  background: '#0d1220',
  composition: {
    sequences: [

      // ── Title: scale-pop in, late punch, fade out ──
      {
        type: 'text',
        text: 'pixi-effects',
        initial: { x: 'GW/2', y: 'GH * 0.32', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0,    from: { alpha: 0, scale: 0 },
                      to:   { alpha: 1, scale: 1 },
                      duration: 0.6, ease: 'back.out(1.7)' },
          { at: 4,    to: { scale: 1.15 }, duration: 0.25, ease: 'power2.out' },
          { at: 4.25, to: { scale: 1    }, duration: 0.25, ease: 'power2.in' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.085', fill: '#ffffff', fontWeight: 'bold' },
      },

      // ── Subtitle: slide up from below ──
      {
        type: 'text',
        text: 'declarative composition for the web',
        initial: { x: 'GW/2', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0.5, from: { y: 'GH', alpha: 0 },
                     to:   { y: 'GH * 0.46', alpha: 1 },
                     duration: 0.7, ease: 'power3.out' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.026', fill: '#88ccff', fontStyle: 'italic' },
      },

      // ── Three feature pills ──
      {
        type: 'text', text: '✦ keyframes',
        initial: { x: 'GW * 0.2', y: 'GH * 0.7', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 1.4, from: { alpha: 0, scale: 0 },
                     to:   { alpha: 1, scale: 1 },
                     duration: 0.45, ease: 'back.out(2.2)' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.022', fill: '#ffaa55' },
      },
      {
        type: 'text', text: '✦ filters',
        initial: { x: 'GW * 0.5', y: 'GH * 0.7', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 1.6, from: { alpha: 0, scale: 0 },
                     to:   { alpha: 1, scale: 1 },
                     duration: 0.45, ease: 'back.out(2.2)' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.022', fill: '#55ddaa' },
      },
      {
        type: 'text', text: '✦ rendering',
        initial: { x: 'GW * 0.8', y: 'GH * 0.7', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 1.8, from: { alpha: 0, scale: 0 },
                     to:   { alpha: 1, scale: 1 },
                     duration: 0.45, ease: 'back.out(2.2)' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.022', fill: '#ff77cc' },
      },

      // ── Nested rotating sub-composition with hint ──
      {
        type: 'composition',
        width: 600, height: 120,
        initial: { x: 'GW/2 - 300', y: 'GH * 0.86' },
        keyframes: [
          { at: 2.4, from: { alpha: 0, rotation: -0.2 },
                     to:   { alpha: 1, rotation: 0 },
                     duration: 0.7, ease: 'elastic.out(1, 0.5)' },
          { at: 5.0, to: { rotation:  0.04 }, duration: 0.5, ease: 'sine.inOut' },
          { at: 5.5, to: { rotation: -0.04 }, duration: 0.5, ease: 'sine.inOut' },
          { at: 6.0, to: { rotation:  0    }, duration: 0.3, ease: 'sine.out' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        sequences: [
          {
            type: 'text',
            text: 'press play to scrub the timeline',
            initial: { x: 300, y: 60, anchorX: 0.5, anchorY: 0.5 },
            style: { fontSize: 28, fill: '#888899', fontStyle: 'italic' },
          },
        ],
      },

      // ── Corner badge ──
      {
        type: 'text',
        text: 'v0.1.0',
        initial: { x: 'GW * 0.97', y: 'GH * 0.05', anchorX: 1, anchorY: 0, alpha: 0 },
        keyframes: [
          { at: 0.4, to: { alpha: 1 }, duration: 0.5 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.018', fill: '#666688', fontFamily: 'Menlo, monospace' },
      },

    ],
  },
});
`;
```

- [ ] **Step 2: Create `examples/_presets/shapes.js`**

Read `examples/shapes.html`. Copy the JS inside `<script type="module">` (everything after the `import` lines, starting with the `const movie = new Movie();` line — but exclude that line, exclude `window.__movie = movie;`, and exclude `new Controller(...)` style that uses `document.getElementById`). Wrap in template literal. Replace any `document.getElementById('stage')` with `canvas`. Keep all `const ROW1 = ...` style helper variables.

The output file shape:

```js
// examples/_presets/shapes.js
export default `new Controller(movie, { canvas });

// Layout — single source of truth so rows / columns stay aligned.
const ROW1 = 'H * 0.50';
const ROW2 = 'H * 0.78';
const COL  = [ 'W * 0.3', 'W * 0.5', 'W * 0.7' ];
const FADE_OUT = { at: -0.5, to: { alpha: 0 }, duration: 0.5 };

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 9, frameRate: 30,
  background: '#0a0a0f',
  composition: {
    sequences: [
      // ... copy verbatim from examples/shapes.html ...
    ],
  },
});
`;
```

When copying, watch for backticks inside the source. If any are present (e.g. inline template literals in the example), escape them as `` \` ``. If the source uses `${...}` interpolation that should stay literal in the editor text, escape the dollar as `\${`.

- [ ] **Step 3: Create `examples/_presets/transitions.js`**

Read `examples/transitions.html`. Copy everything inside `<script type="module">` after the `import` lines, but exclude `const movie = new Movie();`, exclude `window.__movie = movie;`, and exclude `new Controller(...)` (you'll add a fresh `new Controller(movie, { canvas })` at the top of the template literal). Wrap in a `export default \`...\`;` template literal. Replace any `document.getElementById('stage')` with `canvas`. Escape any backticks as `` \` `` and any literal `${` as `\${`.

Result shape:

```js
// examples/_presets/transitions.js
export default `new Controller(movie, { canvas });

// ... helpers and constants from examples/transitions.html ...

await movie.init({
  canvas,
  // ... rest copied verbatim ...
});
`;
```

- [ ] **Step 4: Create `examples/_presets/chromakey.js`**

Read `examples/chromakey.html`. Apply the same procedure as Step 3: drop `new Movie()`, `window.__movie`, and the original `new Controller(...)`; prepend `new Controller(movie, { canvas });`; replace `document.getElementById('stage')` with `canvas`; escape backticks and `${`. The composition references `/examples/_assets/green.mp4` — leave the path as-is, since the playground page is served from the same root.

- [ ] **Step 5: Create `examples/_presets/nested.js`**

Read `examples/nested.html`. Apply the same procedure as Step 3: drop `new Movie()`, `window.__movie`, and the original `new Controller(...)`; prepend `new Controller(movie, { canvas });`; replace `document.getElementById('stage')` with `canvas`; escape backticks and `${`. The composition references `/examples/_assets/bgm.mp3` — leave the path as-is.

- [ ] **Step 6: Create `examples/_presets/index.js`**

```js
// examples/_presets/index.js
import basic from './basic.js';
import shapes from './shapes.js';
import transitions from './transitions.js';
import chromakey from './chromakey.js';
import nested from './nested.js';

export default [
  { id: 'basic',       label: 'Basic — text + keyframes', code: basic },
  { id: 'shapes',      label: 'Shape primitives',         code: shapes },
  { id: 'transitions', label: 'Transitions',              code: transitions },
  { id: 'chromakey',   label: 'Chromakey video',          code: chromakey },
  { id: 'nested',      label: 'Nested composition',       code: nested },
];
```

- [ ] **Step 7: Verify presets load as ESM**

Run a one-shot HTTP server from the project root (any one of these works — pick whichever the engineer has):

```bash
python3 -m http.server 8000
# or: npx --yes serve -p 8000 .
```

In a browser console, navigate to `http://localhost:8000/` and run:

```js
const presets = (await import('/examples/_presets/index.js')).default;
console.log(presets.map(p => [p.id, p.code.length]));
```

Expected: an array of 5 `[id, codeLength]` pairs, each `codeLength > 0`. If any module errors, fix the escaping in that preset file (most likely cause: an unescaped backtick or `${` in the copied source).

- [ ] **Step 8: Commit**

```bash
git add examples/_presets/
git commit -m "$(cat <<'EOF'
feat(examples): preset source modules for playground

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `playground.html` shell (HTML + CSS only, no behavior yet)

**Files:**
- Create: `examples/playground.html`

This task creates a static page with the toolbar and grid layout in place but no editor behavior. After this task the page should render: a 36px toolbar (preset select, run button, title), an empty left panel where the editor will mount, an empty right panel containing the `<canvas>`, and a hidden error pane. Running it should not throw.

- [ ] **Step 1: Create `examples/playground.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>pixi-effects — playground</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      background: #0d1220;
      color: #ccc;
      font-family: system-ui, -apple-system, sans-serif;
      display: grid;
      grid-template-rows: 36px 1fr auto;
      grid-template-columns: 1fr 1fr;
    }
    #toolbar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      background: #11162a;
      border-bottom: 1px solid #1d2440;
      font-size: 13px;
    }
    #toolbar .spacer { flex: 1; }
    #toolbar .title  { color: #8899bb; font-size: 12px; }
    #toolbar select, #toolbar button {
      background: #1a2140;
      color: #ddd;
      border: 1px solid #2a3563;
      border-radius: 4px;
      padding: 4px 10px;
      font: inherit;
      cursor: pointer;
    }
    #toolbar button:hover, #toolbar select:hover { background: #243069; }
    #editor {
      overflow: auto;
      border-right: 1px solid #1d2440;
    }
    #editor .cm-editor { height: 100%; }
    #stageWrap {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      overflow: hidden;
    }
    #stage {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      border-radius: 8px;
      background: #000;
    }
    #err {
      grid-column: 1 / -1;
      display: none;
      margin: 0;
      padding: 8px 12px;
      background: #3a0d12;
      color: #ffaaaa;
      font: 12px/1.4 Menlo, monospace;
      white-space: pre-wrap;
      max-height: 30vh;
      overflow: auto;
    }
    @media (max-width: 720px) {
      body { grid-template-columns: 1fr; grid-template-rows: 36px auto auto auto; }
      #editor { border-right: none; border-bottom: 1px solid #1d2440; min-height: 240px; }
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <select id="preset" aria-label="Preset"></select>
    <button id="run" type="button">▶ Run (⌘↵)</button>
    <span class="spacer"></span>
    <span class="title">pixi-effects · playground</span>
  </div>
  <div id="editor"></div>
  <div id="stageWrap">
    <canvas id="stage" width="1280" height="720"></canvas>
  </div>
  <pre id="err"></pre>

  <script type="importmap">
  {
    "imports": {
      "pixi.js":                     "https://esm.sh/pixi.js@8.10.0?bundle-deps",
      "gsap":                        "https://esm.sh/gsap@3.12.5",
      "gsap/PixiPlugin":             "https://esm.sh/gsap@3.12.5/PixiPlugin",
      "mediabunny":                  "https://esm.sh/mediabunny",
      "sucrase":                     "https://esm.sh/sucrase@3.35.0",
      "codemirror":                  "https://esm.sh/codemirror@6.0.1",
      "@codemirror/state":           "https://esm.sh/@codemirror/state@6.4.1",
      "@codemirror/view":            "https://esm.sh/@codemirror/view@6.26.3",
      "@codemirror/lang-javascript": "https://esm.sh/@codemirror/lang-javascript@6.2.2",
      "@codemirror/theme-one-dark":  "https://esm.sh/@codemirror/theme-one-dark@6.1.2"
    }
  }
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify the page renders**

With the local server still running from Task 1 Step 7, open `http://localhost:8000/examples/playground.html`.

Expected:
- Toolbar visible at top with a (currently empty) `<select>`, a "▶ Run (⌘↵)" button, and "pixi-effects · playground" right-aligned.
- Left panel empty (where the editor will mount).
- Right panel shows a black `<canvas>` in the centre.
- No console errors.

If the canvas overflows or the toolbar wraps, adjust the CSS in Step 1 — typical fix is `min-width: 0` on `#editor` or `#stageWrap` since CSS grid defaults to `auto` minimum.

- [ ] **Step 3: Commit**

```bash
git add examples/playground.html
git commit -m "$(cat <<'EOF'
feat(examples): playground HTML shell

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire the editor, preset dropdown, and Run pipeline

**Files:**
- Modify: `examples/playground.html` (append a `<script type="module">` block before `</body>`)

This task fills in all behavior: CodeMirror 6 with TS highlighting, populate the `<select>` from the presets list, Run handler that tears down the previous run, transforms the editor source via Sucrase, and executes it via `AsyncFunction(movie, Controller, canvas, code)`. Errors render in the `#err` pane.

- [ ] **Step 1: Append the module script**

Insert this block immediately before `</body>` in `examples/playground.html`:

```html
  <script type="module">
    import { Movie } from '../dist/index.js';
    import { Controller } from '../dist/Controller.js';
    import { EditorView, basicSetup } from 'codemirror';
    import { keymap } from '@codemirror/view';
    import { javascript } from '@codemirror/lang-javascript';
    import { oneDark } from '@codemirror/theme-one-dark';
    import { transform } from 'sucrase';
    import presets from './_presets/index.js';

    const stageWrap = document.getElementById('stageWrap');
    const presetSel = document.getElementById('preset');
    const runBtn    = document.getElementById('run');
    const errEl     = document.getElementById('err');

    // Populate preset dropdown.
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      presetSel.appendChild(opt);
    }
    presetSel.value = presets[0].id;

    // Build the editor with the first preset as initial content.
    const view = new EditorView({
      doc: presets[0].code,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        keymap.of([
          { key: 'Mod-Enter', preventDefault: true, run: () => { run(); return true; } },
        ]),
        EditorView.theme({ '&': { height: '100%', fontSize: '13px' } }),
      ],
      parent: document.getElementById('editor'),
    });

    let currentMovie = null;
    let currentController = null;

    function showError(err) {
      console.error(err);
      errEl.textContent = String(err && (err.stack || err.message) || err);
      errEl.style.display = 'block';
    }

    function clearError() {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }

    async function teardown() {
      try { currentController?.destroy?.(); } catch (e) { console.warn('controller teardown', e); }
      try { await currentMovie?.destroy?.(); } catch (e) { console.warn('movie teardown', e); }
      currentController = null;
      currentMovie = null;

      // Replace the canvas with a fresh clone so any retained Pixi/GL context is dropped.
      // Controller.destroy() restores the canvas to its original parent, so the canvas in the
      // DOM is whichever node we last inserted; replace it.
      const old = document.getElementById('stage');
      const fresh = old.cloneNode(false);
      old.replaceWith(fresh);
    }

    async function run() {
      clearError();
      runBtn.disabled = true;
      try {
        await teardown();
        const src = view.state.doc.toString();
        const out = transform(src, { transforms: ['typescript'] }).code;
        const canvas = document.getElementById('stage');
        const movie = new Movie();
        currentMovie = movie;
        // Capture controller as it's constructed so teardown can find it.
        // The snippet itself runs `new Controller(movie, { canvas })`; we
        // intercept the assignment by monkey-patching Controller for this call.
        const TrackedController = function (m, opts) {
          const c = new Controller(m, opts);
          currentController = c;
          return c;
        };
        TrackedController.prototype = Controller.prototype;
        const fn = new (async function(){}).constructor('movie', 'Controller', 'canvas', out);
        await fn(movie, TrackedController, canvas);
      } catch (err) {
        showError(err);
      } finally {
        runBtn.disabled = false;
      }
    }

    // Preset change → replace doc → run.
    presetSel.addEventListener('change', () => {
      const p = presets.find(x => x.id === presetSel.value);
      if (!p) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: p.code } });
      run();
    });

    runBtn.addEventListener('click', run);

    // Initial Run so the page isn't blank on load.
    run();
  </script>
```

A note on the `TrackedController` helper: the snippet calls `new Controller(...)`. We pass a wrapper that captures the constructed instance into `currentController` so `teardown()` can call `destroy()` on it. The `.prototype` line keeps `instanceof` checks working if the snippet uses them.

- [ ] **Step 2: Run the page end-to-end**

With the local server still running, hard-reload `http://localhost:8000/examples/playground.html`.

Expected:
- The editor mounts on the left with the basic preset code, syntax-highlighted in one-dark.
- The right canvas shows the basic example animation playing (auto-Run on load).
- Pressing the Run button restarts playback from the start.
- Pressing `Cmd+Enter` (Mac) or `Ctrl+Enter` (Linux/Windows) inside the editor restarts playback.
- Switching preset to "Shape primitives" replaces the editor doc and the canvas shows the shapes example.
- Switching back to "Basic" restores the basic example.
- Introducing a typo (delete a closing brace) and pressing Run shows a red error pane below; fixing the typo and pressing Run again hides the error pane and restarts playback.

If "Chromakey video" or "Nested composition" presets fail, check that `examples/_assets/green.mp4` and `examples/_assets/bgm.mp3` exist (they should — confirmed in the spec phase) and that the URL bar is `http://localhost:8000/...` not `file://`.

If switching presets repeatedly leaks audio (e.g. previous BGM still playing), the teardown order is wrong. The fix: ensure `currentController?.destroy?.()` runs before `await currentMovie?.destroy?.()` (Controller listens to `pause` events from Movie), and that `Movie.destroy()` actually completes before constructing the next one — `await` is critical.

- [ ] **Step 3: Commit**

```bash
git add examples/playground.html
git commit -m "$(cat <<'EOF'
feat(examples): wire playground editor + run pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: README cross-link

**Files:**
- Modify: `README.md` (the "Examples" bullet list, around line 60–65)

- [ ] **Step 1: Add a `playground.html` bullet under "Examples"**

Open `README.md`. Find the "Examples" section that already lists `basic.html`, `chromakey.html`, etc. Add a leading bullet for the playground:

```diff
 - [**Examples**](./examples/) — runnable HTML files:
+  - `playground.html` — in-browser editor with preset dropdown
   - `basic.html` — text + keyframes
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): link playground example

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification checklist (manual, post-implementation)

After all tasks land, confirm in a fresh browser tab on `http://localhost:8000/examples/playground.html`:

- [ ] Page loads with no console errors.
- [ ] Editor mounts on the left with `basic` content, one-dark theme, line numbers.
- [ ] Canvas on the right plays the basic example automatically.
- [ ] Run button restarts playback.
- [ ] `Cmd/Ctrl+Enter` restarts playback (test from inside the editor).
- [ ] Each of the 5 presets loads and plays when selected.
- [ ] Editing the source and re-running picks up the change.
- [ ] Syntax error → error pane shows red message; fix → pane hides and playback resumes.
- [ ] Switching presets doesn't accumulate audio or leak the canvas (page memory should not grow without bound across 10+ swaps — eyeball via DevTools Memory if uncertain).
- [ ] Mobile/narrow viewport (≤720px) stacks editor + canvas vertically.
