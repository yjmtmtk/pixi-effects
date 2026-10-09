#!/usr/bin/env node
/**
 * pixi-effects view — look at a composition page WITH its timeline, and scrub the one with the other.
 *
 *   node ai/tools/view.mjs my-video.html            (or:  npx pixi-effects view my-video.html)
 *
 * It serves the page's folder on a private port and opens your browser on a viewer: the page itself on top (its own player
 * works as usual) and, under it, the timeline of every layer (`movie.timelineSvg()`) with a playhead that follows the movie.
 * Click or drag on the timeline to seek the movie; click a layer's name to jump to where it starts; Space plays / pauses,
 * ← / → step a frame (Shift: a second), Home / End jump to the ends. Stop it with Ctrl-C.
 *
 * Needs: Node >= 18. A browser (the default one is opened; --no-open prints the address instead). The page must follow
 * skills/pixi-effects/template.html (`window.movie`, `window.__ready = true`) and use a pixi-effects that has `movie.timelineSvg()` (0.7+).
 * Options: --port N (default: a free one) · --no-open · --query "a=1" (added to the page URL) · --root DIR (default: the nearest folder above the page with dist/)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findRoot, serve } from './check.mjs';

export const VIEWER = '/__viewer';

export function parseViewArgs(argv) {
  const o = { page: null, port: 0, open: true, query: null, root: null };
  const need = (i, name) => { if (i + 1 >= argv.length) throw new Error(`${name} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Math.max(0, Math.round(Number(need(i++, a))) || 0);
    else if (a === '--no-open') o.open = false;
    else if (a === '--query') o.query = need(i++, a).replace(/^\?/, '');
    else if (a === '--root') o.root = need(i++, a);
    else if (a.startsWith('-')) throw new Error(`unknown option ${a} (see the header of view.mjs)`);
    else if (!o.page) o.page = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The viewer page: the composition in an iframe, its timeline under it (zoomable), a playhead, click / drag / keys to seek. */
export function viewerHtml({ pageUrl, title }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)} — timeline view</title>
<style>
  :root { --bg: #f7f5f1; --ink: #1d2433; --dim: #6b7587; --line: #d9d5cc; --head: #e0245e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0e1320; --ink: #e8eefc; --dim: #8fa0bf; --line: #26304a; --head: #ff5c8a; } }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 13px system-ui, sans-serif; }
  body { display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  header b { font-size: 14px; font-weight: 600; }
  #time { font-family: ui-monospace, Menlo, monospace; color: var(--dim); }
  #status { color: var(--dim); }
  .zoom { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
  #zlabel { min-width: 44px; text-align: center; font-family: ui-monospace, Menlo, monospace; color: var(--dim); }
  button { font: inherit; background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 12px; cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  #stage { flex: none; overflow: hidden; background: #000; }
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
</style></head>
<body>
<header><b>${escHtml(title)}</b><button id="play" type="button" disabled>▶</button><span id="time">0.00 / 0.00 s · frame 0</span><span id="status">loading the page…</span>
  <span class="zoom"><button id="zout" type="button" title="zoom out (-)" disabled>−</button><span id="zlabel">fit</span><button id="zin" type="button" title="zoom in (+, or Ctrl/⌘ + wheel)" disabled>+</button><button id="zfit" type="button" title="fit the whole movie (0)" disabled>fit</button></span></header>
<div id="stage"><iframe id="page" src="${escHtml(pageUrl)}" allow="autoplay; fullscreen"></iframe></div>
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
  let movie = null, svg = null, head = null, geom = null, zoom = 1, scrubbing = false;

  (async () => {
    for (let i = 0; i < 600 && !movie; i++) {
      try { const w = frame.contentWindow; if (w && w.__ready === true && w.movie) movie = w.movie; } catch { /* still loading */ }
      if (!movie) await sleep(200);
    }
    if (!movie) { $status.textContent = 'the page did not become ready (window.__ready === true and window.movie are needed)'; return; }
    if (typeof movie.timelineSvg !== 'function') { $status.textContent = 'this page loads a pixi-effects without movie.timelineSvg() (0.7+ needed)'; return; }
    layout();
    mount();
  })();

  // The page is shown whole: as tall as its picture, scaled down (never up) so the timeline stays in view under it.
  function layout() {
    const stageW = stage.clientWidth || innerWidth, headH = document.querySelector('header').offsetHeight;
    let h = 560;
    const fit = k => { frame.style.width = (stageW / k) + 'px'; frame.style.transform = 'scale(' + k + ')'; };
    fit(1);
    try {
      const c = frame.contentDocument.querySelector('canvas');
      if (c) h = Math.round(c.getBoundingClientRect().height + 40);
    } catch { /* a page we cannot read */ }
    const k = Math.min(1, Math.max(200, innerHeight - headH - 240) / h);
    fit(k);
    frame.style.height = h + 'px';
    stage.style.height = Math.round(h * k) + 'px';
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
    try { while (wanted !== null) { const n = wanted; wanted = null; await movie.gotoFrame(n, true); } } finally { busy = false; }
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
    svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onEnd); svg.addEventListener('pointercancel', onEnd);
    if (zoom <= 1) chart.scrollLeft = 0;
    else if (keep) chart.scrollLeft = Math.max(0, NAMES_W + tToX(keep.t) - keep.x);
    $zlabel.textContent = zoom <= 1.001 ? 'fit' : zoom.toFixed(zoom < 10 ? 1 : 0) + '×';
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

  function mount() {
    const data = movie.timelineData();
    names.innerHTML = '<div class="ruler" style="height:34px"></div>' + data.rows.map(r =>
      '<div class="name" data-start="' + r.start + '" style="padding-left:' + (8 + r.depth * 14) + 'px" title="' + esc(r.path + ' · ' + r.type) + '">' + esc(r.name) + '</div>').join('');
    names.addEventListener('click', e => { const n = e.target.closest('.name'); if (n) seekTime(parseFloat(n.dataset.start) || 0); });
    render(null);
    $status.textContent = 'click or drag the timeline · Space plays · ← → step a frame (Shift: a second) · + / − zoom (Ctrl/⌘ + wheel) · click a layer name to jump to its start';
    $play.disabled = false; $zfit.disabled = true;

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
    addEventListener('keydown', e => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
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
  }
  const toggle = () => { if (movie.isPlaying) movie.pause(); else movie.play(); };

  function tick() {
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
  if (!pagePath.startsWith(root)) throw new Error(`the page must be inside the server root (${root}); use --root`);
  const rel = path.relative(root, pagePath).split(path.sep).join('/');
  const pageUrl = '/' + rel + (opts.query ? '?' + opts.query : '');
  const title = path.basename(pagePath).replace(/\.[^.]+$/, '');
  const html = viewerHtml({ pageUrl, title });
  const { server, port } = await serve(root, (req, res) => {
    if (req.method !== 'GET' || !req.url.startsWith(VIEWER)) return false;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
    return true;
  }, opts.port);
  return { server, url: `http://127.0.0.1:${port}${VIEWER}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {   // the real path: npm starts a bin through a symlink
  try {
    const opts = parseViewArgs(process.argv.slice(2));
    if (!opts.page) {
      console.error('usage: node ai/tools/view.mjs <page.html> [--port N] [--no-open] [--query a=1] [--root DIR]');
      process.exit(2);
    }
    const { url } = await startViewer(opts);
    console.log(`timeline view: ${url}   (Ctrl-C to stop)`);
    if (opts.open) openBrowser(url);
  } catch (e) {
    console.error(`pixi-effects view failed: ${e.message}`);
    process.exit(2);
  }
}
