import { CompositionSequence } from '../sequences/Composition';
import type { Sequence } from '../sequences/Base';
import { transitionWindowsOf } from './Transitions';
import { resolveAt } from './Timeline';

/** One layer (or a run of similar layers) on the timeline. Times are in seconds, absolute (from the start of the movie). */
export interface TimelineRow {
  /** `parent/child` for a layer inside a composition. */
  path: string;
  name: string;
  type: string;
  /** 0 for a top-level layer, 1 inside a composition, … */
  depth: number;
  start: number;
  end: number;
  /** When each keyframe starts (absolute seconds, sorted). */
  keys: number[];
  /** A grouped run: one span per layer it stands for. */
  parts?: Array<{ start: number; end: number }>;
  /** A short text for the tooltip (a text layer's words, an asset name). */
  detail?: string;
}
export interface TimelineTransition { from: string; to: string; start: number; end: number }
export interface TimelineData {
  duration: number;
  rows: TimelineRow[];
  transitions: TimelineTransition[];
}

const GROUP_MIN = 4;
const MAX_KEYS = 200;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** `pop-12`, `ring9-1`, `text#9` → `pop-#`, `ring#-#`, `text#`: the part that makes similar layers one family. */
const family = (name: string): string => name.replace(/\d+/g, '#');

function detailOf(seq: Sequence): string | undefined {
  const s = seq.spec as { text?: unknown; asset?: unknown; sfx?: unknown };
  if (typeof s.text === 'string') return s.text.length > 60 ? s.text.slice(0, 57) + '…' : s.text;
  if (typeof s.asset === 'string') return `asset “${s.asset}”`;
  if (typeof s.sfx === 'string') return `sfx “${s.sfx}”`;
  if (s.sfx && typeof s.sfx === 'object') return 'sfx (custom)';
  return undefined;
}

function walk(comp: CompositionSequence, parentStart: number, parentEnd: number, depth: number, prefix: string, rows: TimelineRow[], transitions: TimelineTransition[]): void {
  const entries: Array<{ row: TimelineRow; inner: TimelineRow[]; groupable: boolean }> = [];
  comp._children.forEach((seq, i) => {
    const name = seq.spec.name ?? `${seq.spec.type}#${i}`;
    const start = parentStart + (seq.at ?? 0);
    // a layer without its own duration lasts as long as its parent: from its start, so it can run past the end; the end is the end
    const end = Math.min(parentEnd, seq.duration !== undefined ? start + seq.duration : parentEnd);
    const span = end - start;
    const keys = (seq.spec.keyframes ?? []).map(kf => round(start + resolveAt(kf.at, span))).sort((a, b) => a - b).slice(0, MAX_KEYS);
    const row: TimelineRow = { path: prefix + name, name, type: seq.spec.type, depth, start: round(start), end: round(end), keys, detail: detailOf(seq) };
    const inner: TimelineRow[] = [];
    const isComp = seq instanceof CompositionSequence;
    if (isComp) walk(seq, start, end, depth + 1, prefix + name + '/', inner, transitions);
    entries.push({ row, inner, groupable: !isComp });
  });
  rows.push(...groupFamilies(entries));
  for (const w of transitionWindowsOf(comp.spec)) {
    transitions.push({ from: prefix + w.from, to: prefix + w.to, start: round(parentStart + w.start), end: round(parentStart + w.end) });
  }
}

/**
 * Siblings of the same type whose names differ only by numbers (`ring10-0`, `ring9-1`, `pop-3` …), four or more, become ONE row
 * at the place of the first, with a part per layer: a movie with hundreds of generated layers stays readable. A composition is never grouped.
 */
function groupFamilies(entries: Array<{ row: TimelineRow; inner: TimelineRow[]; groupable: boolean }>): TimelineRow[] {
  const buckets = new Map<string, TimelineRow[]>();
  for (const e of entries) {
    if (!e.groupable) continue;
    const key = e.row.type + '|' + family(e.row.name);
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(e.row);
  }
  const out: TimelineRow[] = [];
  const done = new Set<string>();
  for (const e of entries) {
    const key = e.row.type + '|' + family(e.row.name);
    const members = e.groupable ? buckets.get(key)! : null;
    if (members && members.length >= GROUP_MIN) {
      if (done.has(key)) continue;                                  // already drawn at the first member's place
      done.add(key);
      const label = `${family(e.row.name)} ×${members.length}`;
      out.push({
        path: e.row.path.slice(0, e.row.path.length - e.row.name.length) + label, name: label, type: e.row.type, depth: e.row.depth,
        start: Math.min(...members.map(x => x.start)), end: Math.max(...members.map(x => x.end)),
        keys: members.flatMap(x => x.keys).sort((a, b) => a - b).slice(0, MAX_KEYS),
        parts: members.map(x => ({ start: x.start, end: x.end })),
      });
    } else {
      out.push(e.row, ...e.inner);
      continue;
    }
    out.push(...e.inner);
  }
  return out;
}

/** Every layer of the movie as rows with absolute times, plus the transition windows. Pure data: read it, or draw it with `timelineHtml`. */
export function collectTimeline(root: CompositionSequence, duration: number): TimelineData {
  const rows: TimelineRow[] = [];
  const transitions: TimelineTransition[] = [];
  walk(root, 0, duration, 0, '', rows, transitions);
  return { duration, rows, transitions };
}

// ───────────────────────────── the chart ─────────────────────────────

const COLORS: Record<string, string> = {
  text: '#4cc9f0', shape: '#ffd166', image: '#7bd88f', video: '#c77dff', audio: '#ff7aa8',
  composition: '#8ea4c8', three: '#ff9f68', camera: '#b0b0b0',
};
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number): string => String(Math.round(n * 100) / 100);

/** The smallest tick spacing (seconds) that is at least ~70 px apart on a chart `chartWidth` px wide. */
function tickStep(duration: number, chartWidth: number): number {
  for (const s of [0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3600]) if ((s / duration) * chartWidth >= 70) return s;
  return 7200;
}

export interface TimelineHtmlOptions { title?: string }
export interface TimelineSvgOptions {
  /** How many pixels the whole duration takes (default 950). A viewer re-draws at a wider width to zoom; the ticks get finer with it. */
  chartWidth?: number;
  /** Draw the layer names in a column on the left (default true). A viewer that scrolls sideways keeps its own, fixed column. */
  labels?: boolean;
}

/**
 * The chart alone: one `<svg>` (inline, no scripts). Its geometry is in data attributes (`data-duration`, `data-x0` / `data-x1`:
 * where 0 s and the end are in the viewBox, `data-top` / `data-bottom`, `data-row`), and every row is `<g class="row" data-start>`,
 * so a viewer can turn a click into a time, draw a playhead, and seek to a row.
 */
export function timelineSvg(data: TimelineData, opts: TimelineSvgOptions = {}): string {
  const CHART = Math.max(100, opts.chartWidth ?? 950), withLabels = opts.labels !== false;
  const LABEL = withLabels ? 250 : 0, ROW = 22, TOP = 34, PAD = 16;
  const W = LABEL + CHART + PAD * 2, H = TOP + data.rows.length * ROW + PAD;
  const x = (t: number): number => PAD + LABEL + (Math.max(0, Math.min(data.duration, t)) / data.duration) * CHART;
  const step = tickStep(data.duration, CHART);
  const out: string[] = [];

  // ruler and grid
  for (let t = 0; t <= data.duration + 1e-9; t += step) {
    out.push(`<line class="grid" x1="${num(x(t))}" y1="${TOP - 6}" x2="${num(x(t))}" y2="${H - PAD}"/>`);
    out.push(`<text class="tick" x="${num(x(t))}" y="${TOP - 12}" text-anchor="middle">${num(t)}${t === 0 || Math.abs(t - data.duration) < 1e-9 ? ' s' : ''}</text>`);
  }
  if (Math.abs(data.duration % step) > 1e-9) out.push(`<text class="tick" x="${num(x(data.duration))}" y="${TOP - 12}" text-anchor="middle">${num(data.duration)} s</text>`);

  // transitions: a band across every row, drawn under the bars
  for (const t of data.transitions) {
    out.push(`<g><title>transition ${esc(t.from)} → ${esc(t.to)} (${num(t.start)}–${num(t.end)} s)</title><rect class="transition" x="${num(x(t.start))}" y="${TOP - 4}" width="${num(Math.max(2, x(t.end) - x(t.start)))}" height="${H - TOP - PAD + 4}"/></g>`);
  }

  data.rows.forEach((r, i) => {
    const y = TOP + i * ROW;
    const color = COLORS[r.type] ?? '#9aa7b8';
    const tip = `${r.path} · ${r.type} · ${num(r.start)}–${num(r.end)} s (${num(r.end - r.start)} s)${r.keys.length ? ` · ${r.keys.length} keyframe${r.keys.length > 1 ? 's' : ''}` : ''}${r.detail ? ` · ${r.detail}` : ''}`;
    out.push(`<g class="row" data-start="${num(r.start)}"><title>${esc(tip)}</title>`);
    out.push(`<rect class="band" x="${PAD}" y="${y}" width="${LABEL + CHART}" height="${ROW}" ${i % 2 ? 'fill-opacity=".05"' : 'fill-opacity="0"'}/>`);
    if (withLabels) out.push(`<text class="label" x="${PAD + 6 + r.depth * 14}" y="${y + 15}">${esc(r.name)}</text>`);
    for (const p of r.parts ?? [{ start: r.start, end: r.end }]) {
      out.push(`<rect class="bar" x="${num(x(p.start))}" y="${y + 4}" width="${num(Math.max(2, x(p.end) - x(p.start)))}" height="${ROW - 8}" rx="3" fill="${color}"/>`);
    }
    for (const k of r.keys) out.push(`<path class="key" d="M ${num(x(k))} ${y + 7} l 3 4 l -3 4 l -3 -4 z"/>`);
    out.push('</g>');
  });

  const legend = Object.entries(COLORS).map(([type, c], i) => `<g transform="translate(${PAD + i * 108},${H + 10})"><rect width="12" height="12" rx="3" fill="${c}"/><text x="18" y="10" class="tick">${type}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 32}" viewBox="0 0 ${W} ${H + 32}" role="img" aria-label="Timeline of ${data.rows.length} rows" data-duration="${num(data.duration)}" data-x0="${num(x(0))}" data-x1="${num(x(data.duration))}" data-top="${TOP - 6}" data-bottom="${H - PAD}" data-row="${ROW}">
${out.join('\n')}
${legend}
</svg>`;
}

/** One self-contained HTML page (an inline SVG, no scripts): the layers as bars on a time axis. */
export function timelineHtml(data: TimelineData, opts: TimelineHtmlOptions = {}): string {
  const W = 250 + 950 + 32;
  const title = esc(opts.title ?? 'Timeline');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — timeline</title>
<style>
  :root { --bg: #f7f5f1; --ink: #1d2433; --dim: #6b7587; --grid: #d9d5cc; --key: #1d2433; --trans: #4cc9f0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0e1320; --ink: #e8eefc; --dim: #8fa0bf; --grid: #26304a; --key: #ffffff; --trans: #4cc9f0; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px system-ui, sans-serif; }
  main { padding: 20px 16px 32px; max-width: ${W + 32}px; margin: 0 auto; overflow-x: auto; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  p { margin: 0 0 14px; color: var(--dim); font-size: 13px; }
  svg { display: block; }
  .grid { stroke: var(--grid); stroke-width: 1; }
  .tick { fill: var(--dim); font-size: 11px; }
  .label { fill: var(--ink); font-size: 12px; font-family: ui-monospace, Menlo, monospace; }
  .band { fill: var(--ink); }
  .key { fill: var(--key); opacity: .85; }
  .transition { fill: var(--trans); opacity: .16; }
  .bar { opacity: .88; }
  .row:hover .bar { opacity: 1; }
</style></head>
<body><main>
<h1>${title}</h1>
<p>${data.rows.length} row${data.rows.length === 1 ? '' : 's'} · ${num(data.duration)} s · ◆ keyframe start · shaded band: a transition · hover a bar for details</p>
${timelineSvg(data)}
</main></body></html>
`;
}
