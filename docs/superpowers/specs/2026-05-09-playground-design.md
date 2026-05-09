# Playground design

> Status: spec — 2026-05-09

A live, in-browser editor for `pixi-effects` compositions. Lets users edit a `movie.init({ ... })` argument in TypeScript and re-run it against a live `<canvas>` next to the editor, with a preset dropdown to bootstrap from existing examples.

## Goals

- One-file demo at `examples/playground.html`, parallel to the other examples.
- "Write TS, press Run, see it" loop. No build step, no server beyond static files.
- Preset dropdown surfaces existing example compositions as starting points.
- Same dependency style as other examples (esm.sh importmap, `../dist/...`).

## Non-goals

- Auto-reload on type. Run is explicit (button or `Cmd/Ctrl+Enter`).
- URL sharing, `localStorage` autosave.
- A separate "Export MP4" button — the Controller already does this.
- GUI property panels / timeline scrubber UI beyond what `Controller` already provides.
- Type checking, autocomplete, or `node_modules` resolution. Sucrase strips types only.

## File layout

New files only; no edits under `src/`:

```
examples/
  playground.html           # single entry
  _presets/
    index.js                # { id, label, code }[] — array of preset descriptors
    basic.js                # template-literal source for "basic"
    chromakey.js            #            ...
    shapes.js
    transitions.js
    nested.js
```

`_presets/` is leading-underscore so it stays out of any future `examples/` index page logic. Each preset module default-exports a string containing the body of `movie.init({...})` — copied from the corresponding `examples/<name>.html`.

`index.js` shape:

```js
import basic from './basic.js';
import chromakey from './chromakey.js';
// ...
export default [
  { id: 'basic',       label: 'Basic — text + keyframes', code: basic },
  { id: 'chromakey',   label: 'Chromakey video',          code: chromakey },
  { id: 'shapes',      label: 'Shapes',                   code: shapes },
  { id: 'transitions', label: 'Transitions',              code: transitions },
  { id: 'nested',      label: 'Nested composition',       code: nested },
];
```

## Execution model

The editor's text is a snippet that uses three injected globals:

- `movie` — a fresh `Movie` instance (created per Run)
- `Controller` — the `Controller` class (constructed inside the snippet)
- `canvas` — the `<canvas>` DOM element

A typical preset body looks like:

```ts
new Controller(movie, { canvas });
await movie.init({
  canvas,
  width: 1280, height: 720, duration: 5, frameRate: 30,
  composition: { sequences: [ /* ... */ ] },
});
```

Run flow:

1. If a previous `movie` exists, call `movie.destroy?.()` (or whatever cleanup the public API exposes — see "Cleanup" below) and clear the canvas's 2D/WebGL surface by replacing the `<canvas>` element with a fresh clone.
2. Read `editor.state.doc.toString()`.
3. Transform via Sucrase: `Sucrase.transform(src, { transforms: ['typescript'] }).code`.
4. Wrap the transformed JS in an `AsyncFunction`:
   ```js
   const fn = new (async function(){}).constructor('movie', 'Controller', 'canvas', code);
   await fn(movie, Controller, canvas);
   ```
   Using `AsyncFunction` (not dynamic `import`) so we don't need to mint blob URLs and so top-level `await` works.
5. On exception: render to the error pane (see "Error display") and `console.error`.

`Cmd/Ctrl+Enter` keybinding triggers the same Run handler.

### Cleanup

`Movie` already needs a teardown path for re-running. Audit `src/core/Movie.ts` for an existing `destroy`/`dispose` method:

- If one exists, call it.
- If not, the playground will perform a minimal cleanup: stop playback (`movie.pause?.()`), detach the `Controller` DOM (the controller mounts an overlay — re-running needs that overlay torn down), and replace the canvas node with a clone so any retained PixiJS context is dropped to GC.

The plan phase will resolve this — implementation must read `Movie` and `Controller` to confirm the public surface.

## Dependencies (importmap)

Existing entries (kept as-is, matching other examples):

```json
{
  "pixi.js":          "https://esm.sh/pixi.js@8.10.0?bundle-deps",
  "gsap":             "https://esm.sh/gsap@3.12.5",
  "gsap/PixiPlugin":  "https://esm.sh/gsap@3.12.5/PixiPlugin",
  "mediabunny":       "https://esm.sh/mediabunny"
}
```

New entries:

```json
{
  "sucrase":                       "https://esm.sh/sucrase@3.35.0",
  "codemirror":                    "https://esm.sh/codemirror@6.0.1",
  "@codemirror/state":             "https://esm.sh/@codemirror/state@6.4.1",
  "@codemirror/view":              "https://esm.sh/@codemirror/view@6.26.3",
  "@codemirror/lang-javascript":   "https://esm.sh/@codemirror/lang-javascript@6.2.2",
  "@codemirror/theme-one-dark":    "https://esm.sh/@codemirror/theme-one-dark@6.1.2"
}
```

The CodeMirror language pack `lang-javascript` covers TypeScript syntax via its `typescript: true` option — that's what the editor uses.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [Preset ▾]   [▶ Run (⌘↵)]              pixi-effects · play │  ← 36px toolbar
├──────────────────────────────┬───────────────────────────────┤
│                              │                               │
│   CodeMirror editor          │   <canvas id="stage">         │
│   (TS, one-dark theme)       │   + Controller overlay        │
│                              │                               │
│                              │                               │
├──────────────────────────────┴───────────────────────────────┤
│  err pane (hidden until error) — red bg, monospace           │
└──────────────────────────────────────────────────────────────┘
```

- Page is full-viewport (`html, body { height: 100% }`).
- Body is CSS grid: rows `36px 1fr auto`, the middle row split as columns `1fr 1fr`.
- Below ~720px viewport width: rows become `36px auto auto auto`, panels stack vertically.
- Background `#0d1220` (matching basic.html).

## Toolbar

- `<select id="preset">` — populated from `_presets/index.js`. Default `basic`. Changing it replaces the editor doc via `editor.dispatch({ changes: { from: 0, to: state.doc.length, insert: preset.code } })`.
- `<button id="run">▶ Run (⌘↵)</button>` — wired to the Run handler.
- Right-aligned title "pixi-effects · playground" — purely decorative.

No "save", "share", "format" buttons. YAGNI.

## Error display

- A `<pre id="err">` below the grid, `display: none` by default.
- On exception: set `textContent` to `String(err.stack ?? err)`, `display: block`. Style: `#3a0d12` bg, `#ffaaaa` fg, `padding: 8px`, monospace.
- On successful Run: hide it again.
- Always also `console.error(err)` so devtools traces are intact.

## Initial state

On `DOMContentLoaded`:

1. Build the importmap (declared statically in HTML, not built at runtime).
2. Module script:
   - Import `Movie`, `Controller` from `../dist/...`.
   - Import CodeMirror pieces, `Sucrase`, presets index.
   - Build the editor with the `basic` preset's `code` as initial content.
   - Wire toolbar.
   - Trigger one auto-Run on load so the page isn't blank.

## Out of scope / explicit YAGNI

- No type checking. Sucrase only strips types.
- No `<script>` injection from the editor — `AsyncFunction` runs in the page's module-script realm; we accept that this is roughly equivalent to "evaling user input on your own page" since the page is local-static and the user pasted the code themselves.
- No download, upload, share, fork, multi-tab, or history.
- No theme switch — one-dark only.
- No formatter (Prettier).

## Open questions for the plan phase

- Confirm `Movie`'s teardown API; the plan must list the exact method calls used in the Run cleanup step.
- Confirm `Controller` mounts an overlay element that we need to detach (or if it auto-detaches when the canvas is replaced).
- Pick exact pinned versions for the new esm.sh entries; the versions above are best-known-current and need a single sanity check via esm.sh before commit.
