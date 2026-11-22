#!/usr/bin/env node
/**
 * pixi-effects view — look at a composition page WITH its timeline, and scrub the one with the other.
 *
 *   node ai/tools/view.mjs my-video.html            (or:  npx pixi-effects view my-video.html)
 *
 * It serves the page's folder on a private port and opens pixi-effects view ("view" for short) in your browser: the page itself on top (its own player
 * works as usual) and, under it, the timeline of every layer (`movie.timelineSvg()`) with a playhead that follows the movie.
 * Click or drag on the timeline to seek the movie; click a layer's name to jump to where it starts; Space plays / pauses,
 * ← / → step a frame (Shift: a second), Home / End jump to the ends. Stop it with Ctrl-C.
 *
 * It watches the page's folder (not `node_modules`, `out`, `reviews`, `check-out`, hidden files). When the work changes it shows "Updated hh:mm:ss — reload (R)"
 * and NOTHING else: the picture you are looking at never switches by itself. Reload (the button, or R) loads the page again and goes back to the frame you were on.
 * The switch "auto reload" (off by default, remembered) reloads for you, but only while the movie is paused and you are not dragging the timeline.
 *
 * Needs: Node >= 18. A browser (the default one is opened; --no-open prints the address instead). The page must follow
 * skills/pixi-effects/template.html (`window.movie`, `window.__ready = true`) and use a pixi-effects that has `movie.timelineSvg()` (0.7+).
 * Options: `pixi-effects view --help` lists every one (SPEC below).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findRoot, serve } from './check.mjs';
import { readArgs, helpText, missing, exitWith, UsageError } from './args.mjs';

export const VIEWER = '/__viewer';

export const SPEC = {
  name: 'view',
  usage: '<page.html> [options]',
  about: 'look at a page with its timeline in your browser: scrub, step, see what changed (Ctrl-C stops it)',
  options: [
    { flag: '--port', value: 'N', help: 'the port to serve on (default: a free one)' },
    { flag: '--no-open', help: 'print the address instead of opening the browser' },
    { flag: '--query', value: '"a=1&b=2"', help: 'added to the page address' },
    { flag: '--root', value: 'DIR', help: 'the folder served (default: the nearest folder above the page with dist/)' },
  ],
};
export const USAGE = helpText(SPEC);

export function parseViewArgs(argv) {
  const o = { page: null, port: 0, open: true, query: null, root: null };
  const r = readArgs(argv, SPEC);
  if (r.help) return { ...o, help: true };
  for (const { flag: a, value: v } of r.options) {
    if (a === '--port') o.port = Math.max(0, Math.round(Number(v)) || 0);
    else if (a === '--no-open') o.open = false;
    else if (a === '--query') o.query = v.replace(/^\?/, '');
    else if (a === '--root') o.root = v;
  }
  if (r.positional.length > 1) throw new UsageError(`view: unexpected argument ${r.positional[1]} (one page at a time; a path with spaces needs quotes)`);
  o.page = r.positional[0] ?? null;
  return o;
}

const IGNORED = new Set(['node_modules', 'out', 'reviews', 'check-out', '.git', 'dist']);

/** A short fingerprint of the work in a folder (file count, newest edit, total size): it changes when something is edited or added. Outputs, installs and hidden files are left out. */
export function folderSignature(dir, { ignore = IGNORED, maxFiles = 4000, maxDepth = 5 } = {}) {
  let count = 0, newest = 0, bytes = 0;
  const walk = (d, depth) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (count >= maxFiles) return;
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!ignore.has(e.name) && depth < maxDepth) walk(full, depth + 1); continue; }
      try { const st = fs.statSync(full); count++; newest = Math.max(newest, st.mtimeMs); bytes += st.size; } catch { /* removed while we looked */ }
    }
  };
  walk(dir, 0);
  return count + ':' + Math.round(newest) + ':' + bytes;
}

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The viewer page: the composition in an iframe, its timeline under it (zoomable), a playhead, click / drag / keys to seek. */
export function viewerHtml({ pageUrl, title }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)} — pixi-effects view</title>
<script>try { const t = localStorage.getItem('pe-view-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* storage may be blocked */ }</script>
<style>
  :root { --bg: #f7f5f1; --ink: #1d2433; --dim: #6b7587; --line: #d9d5cc; --head: #e0245e; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0e1320; --ink: #e8eefc; --dim: #8fa0bf; --line: #26304a; --head: #ff5c8a; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #0e1320; --ink: #e8eefc; --dim: #8fa0bf; --line: #26304a; --head: #ff5c8a; color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 13px system-ui, sans-serif; }
  body { display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  header b { font-size: 14px; font-weight: 600; }
  #time { font-family: ui-monospace, Menlo, monospace; color: var(--dim); }
  #status { color: var(--dim); }
  #status.failed { color: var(--head); font-weight: 600; }
  #update button { background: var(--head); color: #fff; border-color: var(--head); font-weight: 600; }
  #autolabel { color: var(--dim); user-select: none; }
  .tools { display: inline-flex; align-items: center; gap: 14px; margin-left: auto; }
  .zoom { display: inline-flex; align-items: center; gap: 4px; }
  #theme { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  #theme button { border: 0; border-radius: 0; padding: 3px 9px; color: var(--dim); }
  #theme button + button { border-left: 1px solid var(--line); }
  #theme button[aria-pressed="true"] { background: color-mix(in srgb, var(--ink) 12%, transparent); color: var(--ink); }
  #keys { padding: 3px 9px; color: var(--dim); }
  #keys[aria-expanded="true"] { color: var(--ink); background: color-mix(in srgb, var(--ink) 12%, transparent); }
  #help { padding: 6px 14px; border-bottom: 1px solid var(--line); color: var(--dim); font-size: 12px; }
  #zlabel { min-width: 44px; text-align: center; font-family: ui-monospace, Menlo, monospace; color: var(--dim); }
  button { font: inherit; background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 12px; cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  #stage { flex: none; overflow: hidden; background: #000; position: relative; }
  #stage.pending { height: min(560px, max(200px, calc(100vh - 300px))); }
  iframe.pending { visibility: hidden; }
  #wait { position: absolute; inset: 0; display: grid; place-items: center; color: #c4cde0; font: 12px system-ui, sans-serif; text-align: center; }
  #wait .wlabel { letter-spacing: .14em; font-weight: 600; }
  #wait .bar { width: 240px; height: 3px; margin: 10px auto 8px; background: rgba(255,255,255,.16); border-radius: 2px; overflow: hidden; }
  #wait .bar i { display: block; height: 100%; width: 0; background: #ff5c8a; transition: width .2s; }
  #wait[hidden] { display: none; }
  iframe { border: 0; display: block; transform-origin: 0 0; }
  #chart { flex: 1 1 0; min-height: 0; overflow: auto; border-top: 1px solid var(--line); display: flex; align-items: flex-start; }
  #names { position: sticky; left: 0; z-index: 2; flex: none; width: 250px; background: var(--bg); border-right: 1px solid var(--line); }
  #names .name { height: 22px; line-height: 22px; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 6px; font: 12px/22px ui-monospace, Menlo, monospace; cursor: pointer; }
  #names .name:nth-of-type(odd) { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  #names .name:hover { background: color-mix(in srgb, var(--ink) 12%, transparent); }
  #plot { flex: none; }
  #plot svg { display: block; touch-action: none; user-select: none; cursor: col-resize; }
  #plot svg .grid { stroke: var(--line); } #plot svg .tick { fill: var(--dim); font-size: 11px; }
  #plot svg .band { fill: var(--ink); } #plot svg .key { fill: var(--ink); opacity: .85; } #plot svg .transition { fill: #4cc9f0; opacity: .16; } #plot svg .bar { opacity: .88; }
  #plot svg .row:hover .band { fill-opacity: .1; }
  #head line { stroke: var(--head); stroke-width: 2; } #head path { fill: var(--head); }
  #warn { background: #f4a259; color: #1d2433; border-color: #f4a259; font-weight: 600; }
  #warnings { max-height: 30vh; overflow: auto; padding: 8px 14px; border-bottom: 1px solid var(--line); font: 12px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
  #warnings div { padding: 3px 0; border-bottom: 1px dashed var(--line); }
  #warnings .sound { color: #4895ef; }
  #plot svg .sound .bg { fill: color-mix(in srgb, var(--ink) 4%, transparent); }
  #plot svg .sound .wave { fill: #4895ef; opacity: .55; }
  #plot svg .sound .cue line { stroke: #4895ef; stroke-width: 1.5; } #plot svg .sound .cue path { fill: #4895ef; }
  #names .name.sound { color: #4895ef; }
</style></head>
<body>
<header><b>${escHtml(title)}</b><button id="play" type="button" disabled>▶</button><span id="time">0.00 / 0.00 s · frame 0</span><span id="status">loading the page…</span><button id="warn" type="button" hidden title="what the page warned about (and the sound's problems): click to show">⚠ 0</button><span id="update" hidden><button id="reload" type="button" title="load the page again, on the frame you are on (R)">Updated — reload (R)</button></span>
  <span class="tools"><span class="zoom"><button id="zout" type="button" title="zoom out (-)" disabled>−</button><span id="zlabel">1×</span><button id="zin" type="button" title="zoom in (+, or Ctrl/⌘ + wheel)" disabled>+</button><button id="zfit" type="button" title="fit the whole movie (0)" disabled>fit</button></span>
  <label id="autolabel" title="when the page is saved, reload it by itself (only while the movie is paused)"><input type="checkbox" id="auto"> auto reload</label>
  <span id="theme" role="group" aria-label="colours"><button type="button" data-theme="auto" aria-pressed="true" title="follow the system">Auto</button><button type="button" data-theme="light" aria-pressed="false">Light</button><button type="button" data-theme="dark" aria-pressed="false">Dark</button></span>
  <button id="keys" type="button" title="mouse and keys" aria-expanded="false" aria-controls="help">?</button></span></header>
<div id="help" hidden>click or drag the timeline · Space plays · ← → step a frame (Shift: a second) · + / − zoom (Ctrl/⌘ + wheel) · 0 fits · click a layer name to jump to its start · R reloads</div>
<div id="warnings" hidden></div>
<div id="stage" class="pending"><iframe id="page" class="pending" src="${escHtml(pageUrl)}" allow="autoplay; fullscreen"></iframe><div id="wait"><div><div class="wlabel">LOADING THE PAGE</div><div class="bar"><i></i></div></div></div></div>
<div id="chart"><div id="names"></div><div id="plot"></div></div>
<script>
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const frame = document.getElementById('page'), chart = document.getElementById('chart'), stage = document.getElementById('stage');
  const names = document.getElementById('names'), plot = document.getElementById('plot');
  const $time = document.getElementById('time'), $status = document.getElementById('status'), $play = document.getElementById('play');
  const $zin = document.getElementById('zin'), $zout = document.getElementById('zout'), $zfit = document.getElementById('zfit'), $zlabel = document.getElementById('zlabel');
  const NAMES_W = 250, MAX_PX = 60000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let movie = null, svg = null, head = null, geom = null, zoom = 1, scrubbing = false, bound = false;
  const $update = document.getElementById('update'), $reload = document.getElementById('reload'), $auto = document.getElementById('auto');
  let seen = null, pending = false;
  try { $auto.checked = localStorage.getItem('pe-view-auto') === '1'; } catch { /* storage may be blocked */ }

  /**
   * While the page builds its movie: how far it is, as its own loader shows it (the .pe-loader's data-stage / data-percent, which
   * movie.init writes), or from the movie's 'loadprogress' event for a page without that loader.
   */
  let progress = null, hooked = null;
  function showProgress() {
    let stage = '', pct = null;
    try {
      const w = frame.contentWindow, d = frame.contentDocument;
      if (w && w.movie && w.movie !== hooked && typeof w.movie.on === 'function') { hooked = w.movie; progress = null; try { w.movie.on('loadprogress', e => { progress = e; }); } catch { /* an old movie */ } }
      const l = d && d.querySelector('.pe-loader');
      if (l && l.getAttribute('data-stage')) { stage = l.getAttribute('data-stage'); pct = Number(l.getAttribute('data-percent')); }
      else if (progress) { stage = ({ assets: 'LOADING ASSETS', build: 'BUILDING LAYERS', sound: 'MIXING SOUND', frames: 'PREPARING' })[progress.stage] || String(progress.stage).toUpperCase(); pct = Math.round(progress.progress * 100); }
    } catch { /* still loading */ }
    const $w = document.getElementById('wait');
    $w.querySelector('.wlabel').textContent = stage ? stage + '  ' + pct + '%' : 'LOADING THE PAGE';
    $w.querySelector('.bar i').style.width = (stage && Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0) + '%';
  }

  /** The page is laid out (or will never be): show it. Until then it is hidden, so it never flashes at the iframe's default size in the corner. */
  function shown() { layout(); stage.classList.remove('pending'); frame.classList.remove('pending'); document.getElementById('wait').hidden = true; }

  /** Wait for the page inside to be a ready movie, then (re)build the timeline. \`restore\` = { frame, playing }: go back where the viewer was. */
  let gen = 0, stuck = false;                                       // gen: the latest attach (an older one stops); stuck: the page did not start
  async function attach(restore) {
    const mine = ++gen;
    movie = null; svg = null; head = null; geom = null; stuck = false;
    $status.classList.remove('failed'); $status.textContent = 'loading the page…';
    let strayAt = 0;
    for (let i = 0; i < 600 && !movie; i++) {
      if (mine !== gen) return;                                      // a newer reload took over
      showProgress();
      let failed = '';
      try {
        const w = frame.contentWindow;
        if (w && w.__ready === true && w.movie) movie = w.movie;
        else {
          const logs = ((w && w.__logs) || []).map(String);
          // the template's way of failing: init threw and said why in window.__logs (__ready never comes): say it now, not after two minutes
          failed = logs.find(l => /^(init failed|init:)/.test(l)) || '';
          // a stray error elsewhere on the page may not stop the movie: give it 5 s more to become ready before calling it a failure
          const stray = logs.find(l => /^(uncaught|unhandled)/.test(l));
          if (!failed && stray) { strayAt = strayAt || Date.now(); if (Date.now() - strayAt > 5000) failed = stray; }
        }
      } catch { /* still loading */ }
      if (failed) {
        stuck = true;
        shown();                                                     // the page as it is: it may show where it went wrong
        $status.classList.add('failed');
        $status.textContent = 'the movie could not start — ' + String(failed).replace(/^init( failed)?:\\s*/, '') + ' (fix it and save: view offers a reload)';
        return;
      }
      if (!movie) await sleep(200);
    }
    if (mine !== gen) return;
    if (!movie) {
      stuck = true;
      let logs = '';
      try { logs = (frame.contentWindow.__logs || []).slice(-3).join(' | '); } catch { /* unreadable */ }
      shown();
      $status.textContent = 'the page did not become ready (window.__ready === true and window.movie are needed)' + (logs ? ' — ' + logs : '');
      return;
    }
    if (typeof movie.timelineSvg !== 'function') { shown(); $status.textContent = 'this page loads a pixi-effects without movie.timelineSvg() (0.7+ needed)'; return; }
    layout();
    shown();
    mount();
    if (restore) { await seekFrame(restore.frame); if (restore.playing) movie.play(); }
  }
  attach(null);

  /** Load the page again and come back to the same frame (and playing, if it was). Only ever on a request. */
  async function reload() {
    const restore = movie ? { frame: movie.currentFrame, playing: movie.isPlaying } : null;
    pending = false; $update.hidden = true;
    movie = null; svg = null; head = null; geom = null; plot.innerHTML = ''; names.innerHTML = '';
    sound = null; soundIssues = []; warnShown = null; readWarnings();   // nothing of the old page's is shown for the new one
    const loaded = new Promise(r => frame.addEventListener('load', r, { once: true }));
    try { frame.contentWindow.location.reload(); } catch { frame.src = frame.src; }
    await loaded;
    await attach(restore);
  }
  $reload.addEventListener('click', reload);
  $auto.addEventListener('change', () => { try { localStorage.setItem('pe-view-auto', $auto.checked ? '1' : '0'); } catch { /* storage may be blocked */ } });

  /** Colours: Auto follows the system; Light / Dark hold whatever the system says. Kept for the next time (the head script applies it before the first paint). */
  const $theme = document.getElementById('theme');
  function setTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    for (const b of $theme.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.theme === (t || 'auto')));
  }
  setTheme(document.documentElement.dataset.theme || 'auto');
  $theme.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setTheme(b.dataset.theme);
    try { if (b.dataset.theme === 'auto') localStorage.removeItem('pe-view-theme'); else localStorage.setItem('pe-view-theme', b.dataset.theme); } catch { /* storage may be blocked */ }
  });
  const $keys = document.getElementById('keys'), $help = document.getElementById('help');
  $keys.addEventListener('click', () => { $help.hidden = !$help.hidden; $keys.setAttribute('aria-expanded', String(!$help.hidden)); layout(); });
  // auto only while the movie is paused and nobody is dragging: otherwise the notice waits
  const maybeAuto = () => { if (pending && $auto.checked && !scrubbing && (stuck || (movie && !movie.isPlaying))) reload(); };

  // does the work still look the same? (the server's number goes up when a file in the folder changes)
  // ---- what the page warned about: its window.__logs (the template collects every console warning there), and the sound's problems
  const $warn = document.getElementById('warn'), $warnings = document.getElementById('warnings');
  let soundIssues = [], warnShown = '';
  $warn.addEventListener('click', () => { $warnings.hidden = !$warnings.hidden; layout(); });
  function readWarnings() {
    let logs = [];
    try { logs = (frame.contentWindow.__logs || []).map(String).filter(l => /^(warn|error|uncaught|unhandled|init)/.test(l)); } catch { /* reloading */ }
    const all = [...logs.map(l => ({ text: l, sound: false })), ...soundIssues.map(t => ({ text: 'sound: ' + t, sound: true }))];
    const key = all.map(w => w.text).join('\\n');
    if (key === warnShown) return;
    warnShown = key;
    $warn.hidden = all.length === 0;
    $warn.textContent = '⚠ ' + all.length;
    $warnings.innerHTML = all.map(w => '<div' + (w.sound ? ' class="sound"' : '') + '>' + esc(w.text) + '</div>').join('');
    if (!all.length) $warnings.hidden = true;
  }
  setInterval(readWarnings, 1000);

  // ---- the sound: the mix's waveform (peaks in buckets, made once per page) and where each sound starts (movie.inspectAudio().cues)
  let sound = null;
  function readSound() {
    sound = null; soundIssues = [];
    try {
      const buf = movie.audioBuffer;
      if (!buf || !buf.length) return;
      const B = 8000, peaks = new Float32Array(B), per = buf.length / B;
      const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      for (let b = 0; b < B; b++) {
        let m = 0;
        for (const ch of chans) for (let i = Math.floor(b * per), e = Math.min(buf.length, Math.floor((b + 1) * per)); i < e; i++) { const v = ch[i] < 0 ? -ch[i] : ch[i]; if (v > m) m = v; }
        peaks[b] = m;
      }
      let top = 0; for (const v of peaks) if (v > top) top = v;
      const report = typeof movie.inspectAudio === 'function' ? movie.inspectAudio() : null;
      sound = { peaks, top: top || 1, seconds: buf.length / buf.sampleRate, cues: (report && report.cues) || [] };
      soundIssues = (report && report.issues) || [];
    } catch { sound = null; }
  }
  const SOUND_H = 52;
  /** The sound row at the bottom of the chart (aligned with a "sound" name), and the playhead reaching down through it. */
  function drawSound() {
    if (!sound || !svg) return;
    const y0 = geom.bottom + 4, h = SOUND_H - 10, mid = y0 + h / 2, vb = svg.viewBox.baseVal;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'sound'); g.setAttribute('data-bottom', String(y0 + h));
    const cols = Math.max(1, Math.round(geom.x1 - geom.x0)), step = Math.max(1, cols / 6000), B = sound.peaks.length;
    const amp = x => {                                             // the loudest bucket under this column, 0..1 of the loudest of all
      const t0 = ((x - geom.x0) / (geom.x1 - geom.x0)) * geom.dur, t1 = ((x + step - geom.x0) / (geom.x1 - geom.x0)) * geom.dur;
      let m = 0;
      for (let b = Math.floor((t0 / sound.seconds) * B), e = Math.min(B, Math.ceil((t1 / sound.seconds) * B)); b < e; b++) if (sound.peaks[b] > m) m = sound.peaks[b];
      return m / sound.top;
    };
    const up = [], down = [];
    for (let x = geom.x0; x <= geom.x1; x += step) { const a = amp(x) * (h / 2); up.push(x.toFixed(1) + ' ' + (mid - a).toFixed(1)); down.push(x.toFixed(1) + ' ' + (mid + a).toFixed(1)); }
    let inner = '<rect class="bg" x="' + geom.x0 + '" y="' + y0 + '" width="' + (geom.x1 - geom.x0) + '" height="' + h + '"/>';
    inner += '<path class="wave" d="M ' + up.join(' L ') + ' L ' + down.reverse().join(' L ') + ' Z"/>';
    for (const c of sound.cues) {
      const x = tToX(c.t);
      inner += '<g class="cue" data-x="' + x.toFixed(2) + '"><line x1="' + x + '" x2="' + x + '" y1="' + y0 + '" y2="' + (y0 + h) + '"/><path d="M ' + (x - 4) + ' ' + y0 + ' l 8 0 l -4 6 z"/><title>' + esc(c.name) + ' · ' + c.t.toFixed(2) + ' s</title></g>';
    }
    g.innerHTML = inner;
    svg.insertBefore(g, head);
    // what the chart draws under its rows (the legend of the layer types) moves down by the sound row's height
    for (const el of [...svg.children]) {
      if (el === g || el === head || !el.transform || !el.transform.baseVal || !el.transform.baseVal.numberOfItems) continue;
      const m = el.transform.baseVal.consolidate().matrix;          // read through the SVG DOM: no regular expression inside this template string
      if (m.f > geom.bottom) el.setAttribute('transform', 'translate(' + m.e + ',' + (m.f + SOUND_H) + ')');
    }
    const H = Math.max(vb.height + SOUND_H, y0 + h + 6);
    svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.width + ' ' + H); svg.setAttribute('height', String(H));
    const line = head.querySelector('line'); if (line) line.setAttribute('y2', String(y0 + h));
  }

  async function poll() {
    try {
      const v = await (await fetch('/__viewer/version', { cache: 'no-store' })).json();
      if (seen === null) seen = v.version;
      else if (v.version !== seen) {
        seen = v.version; pending = true;
        const d = new Date(v.at), p2 = n => String(n).padStart(2, '0');
        $reload.textContent = 'Updated ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + ' — reload (R)';
        $update.hidden = false;
      }
    } catch { /* the viewer is stopped */ }
  }
  poll(); setInterval(poll, 800);

  // The page is shown whole and in the MIDDLE: as tall as its picture, scaled down (never up) so the timeline stays in view under it. A page that
  // keeps its picture at the left edge (the template does) is still centred: the iframe is as wide as the page's own content, then centred.
  let layoutGen = 0;
  function layout() {
    const myLayout = ++layoutGen;
    const stageW = stage.clientWidth || innerWidth, headH = document.querySelector('header').offsetHeight;
    const listH = ($warnings.hidden ? 0 : $warnings.offsetHeight) + ($help.hidden ? 0 : $help.offsetHeight);   // the warnings list and the keys, when open, take their share
    const room = Math.max(160, innerHeight - headH - listH - 240);
    frame.style.transform = 'none'; frame.style.marginLeft = '0px'; frame.style.width = stageW + 'px';
    let c = null;
    try { c = frame.contentDocument.querySelector('canvas'); } catch { /* a page we cannot read */ }
    const place = (w, h, k) => {                                         // the frame w wide (its own pixels), h tall, scaled by k, centred
      frame.style.width = w + 'px'; frame.style.height = h + 'px';
      frame.style.transform = k === 1 ? 'none' : 'scale(' + k + ')';
      frame.style.marginLeft = Math.max(0, Math.round((stageW - w * k) / 2)) + 'px';
      stage.style.height = Math.round(h * k) + 'px';
    };
    if (!c) { const k = Math.min(1, room / 560); place(stageW, 560, k); return; }
    const look = w => {                                                  // at frame width w: where the canvas is and how tall the frame must be
      frame.style.width = w + 'px';
      const r = c.getBoundingClientRect();
      return { r, h: Math.round(Math.max(r.height + 40, r.bottom + 16)), cw: Math.round(r.right + Math.max(0, r.left)) };
    };
    const fits = m => m.r.left >= -1 && m.r.right <= parseFloat(frame.style.width) + 1 && m.h <= room;
    const full = look(stageW);
    if (fits(full)) { place(Math.min(stageW, full.cw), full.h, 1); return; }
    // too tall (or too wide): find the widest frame the page fits in when it lays itself out again (a canvas that follows its box,
    // as the template's does, even one capped and centred); the player bar then keeps its own size. Scaling would shrink it too.
    let lo = 120, hi = stageW, best = null;
    for (let i = 0; i < 14 && hi - lo > 2; i++) {
      const w = Math.floor((lo + hi) / 2), m = look(w);
      if (fits(m)) { best = { w, m }; lo = w; } else hi = w;
    }
    if (best) { place(best.w, best.m.h, 1); settleBar(myLayout, best.w, room, stageW, place, look); return; }
    // a page that cannot narrow (a fixed-size canvas): scaled to fit, as before
    const m = look(stageW), k = Math.min(1, room / m.h, stageW / Math.max(1, m.cw));
    place(Math.max(stageW, m.cw), m.h, k);
  }
  /**
   * The player bar follows its canvas a frame later (it is sized by script), so whether it fits is known only then. If it sticks out
   * (an older bar gives nothing way when narrow), the frame widens until it fits and the rest is scaled: its buttons stay as large as they can.
   */
  async function settleBar(myLayout, w, room, stageW, place, look) {
    let bar = null;
    try { bar = frame.contentDocument.querySelector('.mc-bar'); } catch { /* unreadable */ }
    if (!bar) return;
    let widened = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (myLayout !== layoutGen) return;                                // laid out again meanwhile
      if (!bar.offsetParent || bar.scrollWidth <= bar.clientWidth + 1) break;
      w = Math.min(stageW * 3, w + (bar.scrollWidth - bar.clientWidth) + 2); widened = true;
      frame.style.transform = 'none'; frame.style.width = w + 'px';
    }
    if (!widened || myLayout !== layoutGen) return;
    const m = look(w);
    place(w, m.h, Math.min(1, room / m.h, stageW / w));
  }
  frame.addEventListener('load', layout);
  addEventListener('resize', () => { layout(); if (svg) render(null); });

  const fitWidth = () => Math.max(300, chart.clientWidth - NAMES_W - 32);
  const maxZoom = () => Math.max(1, Math.min(MAX_PX, movie.totalFrames * 12) / fitWidth());   // at most ~12 px per frame
  const tToX = t => geom.x0 + (t / geom.dur) * (geom.x1 - geom.x0);
  const nowT = () => movie.currentFrame / movie.frameRate;
  function clientToTime(clientX) {
    const r = svg.getBoundingClientRect();
    const ux = ((clientX - r.left) / r.width) * geom.vbw;
    return clamp((ux - geom.x0) / (geom.x1 - geom.x0), 0, 1) * geom.dur;
  }

  // seek: only the latest wanted frame is rendered, so dragging never queues up
  let wanted = null, busy = false;
  async function seekFrame(f) {
    wanted = clamp(Math.round(f), 0, movie.totalFrames);
    if (busy) return;
    busy = true;
    try { while (wanted !== null) { const n = wanted; wanted = null; await movie.gotoFrame(n); } } finally { busy = false; }
  }
  const seekTime = t => seekFrame(t * movie.frameRate);

  /** Draw the chart at the current zoom. \`anchor\` = { t, x }: the time that must stay at x pixels from the left of the panel. */
  function render(anchor) {
    const keep = anchor ?? (geom ? { t: nowT(), x: tToX(nowT()) + NAMES_W - chart.scrollLeft } : null);
    plot.innerHTML = movie.timelineSvg({ chartWidth: Math.min(MAX_PX, Math.round(fitWidth() * zoom)), labels: false });
    svg = plot.querySelector('svg');
    const d = svg.dataset;
    geom = { dur: +d.duration, x0: +d.x0, x1: +d.x1, top: +d.top, bottom: +d.bottom, vbw: svg.viewBox.baseVal.width };
    head = document.createElementNS(NS, 'g'); head.id = 'head';
    head.innerHTML = '<line x1="0" x2="0" y1="' + (geom.top - 2) + '" y2="' + geom.bottom + '"/><path d="M -6 ' + (geom.top - 8) + ' l 12 0 l -6 9 z"/>';
    svg.appendChild(head);
    drawSound();
    svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onEnd); svg.addEventListener('pointercancel', onEnd);
    if (zoom <= 1) chart.scrollLeft = 0;
    else if (keep) chart.scrollLeft = Math.max(0, NAMES_W + tToX(keep.t) - keep.x);
    $zlabel.textContent = zoom <= 1.001 ? '1×' : zoom.toFixed(zoom < 10 ? 1 : 0) + '×';
    $zout.disabled = zoom <= 1.001; $zfit.disabled = zoom <= 1.001; $zin.disabled = zoom >= maxZoom() - 0.001;
  }
  function setZoom(z, anchor) {
    const next = clamp(z, 1, maxZoom());
    if (Math.abs(next - zoom) < 1e-6) return;
    zoom = next;
    render(anchor);
  }
  const playheadAnchor = () => {
    const x = tToX(nowT()) + NAMES_W - chart.scrollLeft;
    return { t: nowT(), x: clamp(x, NAMES_W + 20, chart.clientWidth - 20) };
  };

  function onDown(e) {
    const r = svg.getBoundingClientRect();
    scrubbing = true; wasPlaying = movie.isPlaying; if (wasPlaying) movie.pause();
    try { svg.setPointerCapture(e.pointerId); } catch { /* a synthetic event has no pointer */ }
    seekTime(clientToTime(e.clientX));
  }
  let wasPlaying = false;
  function onMove(e) { if (scrubbing) seekTime(clientToTime(e.clientX)); }
  function onEnd() { if (!scrubbing) return; scrubbing = false; if (wasPlaying) movie.play(); }

  /** The names column: one per row of the chart, and the sound row's name when there is sound. */
  function drawNames() {
    const data = movie.timelineData();
    names.innerHTML = '<div class="ruler" style="height:34px"></div>' + data.rows.map(r =>
      '<div class="name" data-start="' + r.start + '" style="padding-left:' + (8 + r.depth * 14) + 'px" title="' + esc(r.path + ' · ' + r.type) + '">' + esc(r.name) + '</div>').join('')
      + (sound ? '<div class="name sound" data-start="0" style="height:' + SOUND_H + 'px;line-height:' + SOUND_H + 'px;padding-left:8px" title="the mix: its waveform, and a mark where each sound starts">sound</div>' : '');
  }
  function mount() {
    document.body.dataset.mounts = String((+document.body.dataset.mounts || 0) + 1);
    readSound();
    warnShown = null; readWarnings();
    drawNames();
    render(null);
    // setVars / resize / rebuild built the movie again: its rows and its sound may have changed
    const m = movie;
    if (typeof m.on === 'function') m.on('rebuilt', () => { if (movie !== m) return; readSound(); warnShown = null; readWarnings(); drawNames(); render(null); });
    $status.textContent = '';
    $play.disabled = false; $zfit.disabled = true;
    if (bound) return;                                              // the controls below are bound once; a reload only rebuilds the timeline
    bound = true;
    names.addEventListener('click', e => { const n = e.target.closest('.name'); if (n && movie) seekTime(parseFloat(n.dataset.start) || 0); });

    $play.addEventListener('click', toggle);
    $zin.addEventListener('click', () => setZoom(zoom * 1.6, playheadAnchor()));
    $zout.addEventListener('click', () => setZoom(zoom / 1.6, playheadAnchor()));
    $zfit.addEventListener('click', () => setZoom(1, null));
    chart.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return;                       // a plain wheel scrolls as usual
      e.preventDefault();
      const r = chart.getBoundingClientRect(), overPlot = e.clientX - r.left > NAMES_W;
      const t = overPlot ? clientToTime(e.clientX) : nowT(), x = overPlot ? e.clientX - r.left : playheadAnchor().x;
      setZoom(zoom * Math.exp(-e.deltaY * 0.0025), { t, x });
    }, { passive: false });
  }
  const toggle = () => { if (!movie) return; if (movie.isPlaying) movie.pause(); else movie.play(); };

  // keys and the playhead's clock are bound once, before any page is ready: R reloads even a page that never started
  addEventListener('keydown', e => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); reload(); return; }
    if (!movie) return;
    const fps = movie.frameRate, f = movie.currentFrame;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekFrame(f - (e.shiftKey ? fps : 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seekFrame(f + (e.shiftKey ? fps : 1)); }
    else if (e.key === 'Home') { e.preventDefault(); seekFrame(0); }
    else if (e.key === 'End') { e.preventDefault(); seekFrame(movie.totalFrames); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom * 1.6, playheadAnchor()); }
    else if (e.key === '-') { e.preventDefault(); setZoom(zoom / 1.6, playheadAnchor()); }
    else if (e.key === '0') { e.preventDefault(); setZoom(1, null); }
  });
  requestAnimationFrame(tick);

  function tick() {
    if (!movie || !head || !geom) { maybeAuto(); requestAnimationFrame(tick); return; }
    maybeAuto();
    const t = nowT(), x = tToX(t);
    head.setAttribute('transform', 'translate(' + x.toFixed(2) + ',0)');
    $time.textContent = t.toFixed(2) + ' / ' + geom.dur.toFixed(2) + ' s · frame ' + movie.currentFrame;
    $play.textContent = movie.isPlaying ? '❚❚' : '▶';
    if (movie.isPlaying && !scrubbing && zoom > 1) {                // follow the playhead when it runs off the visible part
      const screenX = NAMES_W + x - chart.scrollLeft;
      if (screenX > chart.clientWidth - 40 || screenX < NAMES_W) chart.scrollLeft = Math.max(0, NAMES_W + x - NAMES_W - 120);
    }
    requestAnimationFrame(tick);
  }
})();
</script>
</body></html>
`;
}

/** Open an address in the default browser (macOS open, Windows start, otherwise xdg-open). */
function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* the address is printed anyway */ }
}

export async function startViewer(opts) {
  const pagePath = path.resolve(opts.page);
  if (!fs.existsSync(pagePath)) throw new Error(`page not found: ${opts.page}`);
  const root = path.resolve(opts.root ?? findRoot(path.dirname(pagePath)));
  if (!pagePath.startsWith(root)) throw new UsageError(`the page must be inside the server root (${root}); use --root`);
  const rel = path.relative(root, pagePath).split(path.sep).join('/');
  const pageUrl = '/' + rel + (opts.query ? '?' + opts.query : '');
  const title = path.basename(pagePath).replace(/\.[^.]+$/, '');
  const html = viewerHtml({ pageUrl, title });
  // The work's version: a number that goes up when a file in the page's folder changes. The viewer only SHOWS it; it never reloads by itself.
  const dir = path.dirname(pagePath);
  let version = 1, changedAt = Date.now(), signature = folderSignature(dir);
  const timer = setInterval(() => { const now = folderSignature(dir); if (now !== signature) { signature = now; version++; changedAt = Date.now(); } }, opts.watchEvery ?? 400);
  timer.unref();
  const { server, port } = await serve(root, (req, res) => {
    if (req.method !== 'GET') return false;
    const pathname = req.url.split('?')[0];
    if (pathname === VIEWER + '/version') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ version, at: changedAt }));
      return true;
    }
    if (pathname !== VIEWER) return false;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
    return true;
  }, opts.port);
  server.on('close', () => clearInterval(timer));
  return { server, url: `http://127.0.0.1:${port}${VIEWER}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {   // the real path: npm starts a bin through a symlink
  try {
    const opts = parseViewArgs(process.argv.slice(2));
    if (opts.help) { console.log(USAGE); process.exit(0); }
    if (!opts.page) throw missing(SPEC, 'the page to look at: pixi-effects view my-video.html');
    const { url } = await startViewer(opts);
    console.log(`pixi-effects view: ${url}   (Ctrl-C to stop)`);
    if (opts.open) openBrowser(url);
  } catch (e) {
    exitWith(e, 'view');
  }
}
