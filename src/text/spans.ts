// `spans`: colour and style inside one text layer. A text layer with `spans: [...]` is expanded, when it is built, into a group (a composition) of
// ordinary text layers, one per piece (the part of a span that sits on one line), each at the x it has when the pieces are measured one after
// the other: the same technique as `splitText()`. Nothing new is drawn, so it stays plain data, every filter / mask / keyframe of the layer
// works on the group, and `inspect` and the timeline view show the pieces.
import { CanvasTextMetrics, TextStyle } from 'pixi.js';
import { suggestName } from '../core/options';
import { describeLayer } from '../core/lint';
import type { SequenceSpec, TextSequenceSpec } from '../types';
export type { TextSpan } from '../types';

type Warn = (message: string) => void;
const defaultWarn: Warn = m => console.warn(m);

/** What a span may change without moving the baseline or the width of the line's grid: colours, weight, slant, spacing, a shadow. */
export const SPAN_STYLE_KEYS = ['fill', 'stroke', 'fontWeight', 'fontStyle', 'fontVariant', 'letterSpacing', 'dropShadow'] as const;
/** What moves the baseline or the line: said once, ignored. */
const LINE_KEYS = ['fontSize', 'fontFamily', 'lineHeight', 'wordWrap', 'wordWrapWidth', 'align', 'leading', 'textBaseline', 'whiteSpace'];


export interface SpanPiece {
  text: string;
  /** Left edge and top, in the group's own pixels. */
  x: number; y: number; width: number;
  line: number;
  /** Which span it came from. */
  span: number;
  /** Characters before it in the whole text (newlines count, as in a text layer) and its own length. */
  start: number; length: number;
  /** The span's own style overrides (what differs from the layer's style). */
  style: Record<string, unknown>;
  /** Only whitespace: it takes room and counts characters, but nothing is drawn for it. */
  blank: boolean;
}

export interface SpansLayout { pieces: SpanPiece[]; width: number; height: number; lineHeight: number; chars: number }

/** What the group needs to know about its pieces (the typewriter counts over them): kept beside the spec, not in it. */
export interface SpansMeta { typed: boolean; pieces: Array<{ start: number; length: number }>; /** The text, for a label (the timeline view). */ preview: string }
export const spansMeta = new WeakMap<object, SpansMeta>();

const widthOf = (text: string, style: TextStyle): number => CanvasTextMetrics.measureText(text, style).width;

/** Each span as `{ text, overrides }`, with what a span may not do said once. */
function normalize(spans: unknown, who: string, warn: Warn): Array<{ text: string; overrides: Record<string, unknown> }> {
  if (!Array.isArray(spans) || spans.length === 0) { warn(`pixi-effects: ${who}: spans is empty: write an array of strings and { text, fill … } objects (nothing is drawn)`); return []; }
  const out: Array<{ text: string; overrides: Record<string, unknown> }> = [];
  const lineKeys = new Set<string>();
  spans.forEach((sp, i) => {
    if (typeof sp === 'string') { out.push({ text: sp, overrides: {} }); return; }
    if (!sp || typeof sp !== 'object' || typeof (sp as { text?: unknown }).text !== 'string') {
      warn(`pixi-effects: ${who}: spans[${i}] must be a string or { text: '…', fill: '#…' }, got ${JSON.stringify(sp)}; skipped`);
      return;
    }
    const { text, ...rest } = sp as unknown as Record<string, unknown>;
    const overrides: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      if ((SPAN_STYLE_KEYS as readonly string[]).includes(k)) overrides[k] = v;
      else if (LINE_KEYS.includes(k)) lineKeys.add(k);
      else {
        const guess = suggestName(k, [...SPAN_STYLE_KEYS]);
        warn(`pixi-effects: ${who}: spans[${i}]: "${k}" is not a span key${guess ? ` — did you mean "${guess}"?` : ''} (it is ignored). A span takes text and ${SPAN_STYLE_KEYS.join(', ')}`);
      }
    }
    out.push({ text: text as string, overrides });
  });
  if (lineKeys.size) warn(`pixi-effects: ${who}: a span cannot set ${[...lineKeys].join(', ')}: they move the baseline or the line; put them in the style of the layer (one size and one font per layer). They are ignored`);
  return out;
}

/**
 * Where every piece of `spans` goes: pieces of a line follow each other by their measured widths (a trailing or leading space keeps its room),
 * `\n` starts the next line, and `align` moves each line on the width of the block. Needs the fonts loaded, like `splitText`.
 */
export function layoutSpans(spans: unknown, style: Record<string, unknown>, align: 'left' | 'center' | 'right', who: string, warn: Warn = defaultWarn): SpansLayout {
  const clean = normalize(spans, who, warn);
  const base = new TextStyle(style as never);
  const m = CanvasTextMetrics.measureText('M', base);
  const lineHeight = m.lineHeight ?? m.height;
  const sentinel = (ts: TextStyle): number => widthOf('|', ts);
  const measure = (text: string, ts: TextStyle): number => widthOf(text + '|', ts) - sentinel(ts);          // "text|" − "|" keeps trailing spaces
  const pieces: SpanPiece[] = [];
  let line = 0, chars = 0, x = 0;
  clean.forEach((sp, spanIdx) => {
    const ts = Object.keys(sp.overrides).length ? new TextStyle({ ...style, ...sp.overrides } as never) : base;
    sp.text.split('\n').forEach((part, k) => {
      if (k > 0) { line++; x = 0; chars += 1; }                                       // the newline is a character of the text
      if (part === '') return;
      const width = measure(part, ts);
      const length = Array.from(part).length;
      pieces.push({ text: part, x, y: line * lineHeight, width, line, span: spanIdx, start: chars, length, style: sp.overrides, blank: part.trim() === '' });
      x += width; chars += length;
    });
  });
  const lineWidth = new Map<number, number>();
  for (const p of pieces) lineWidth.set(p.line, Math.max(lineWidth.get(p.line) ?? 0, p.x + p.width));
  const width = Math.max(0, ...lineWidth.values());
  for (const p of pieces) {
    const room = width - (lineWidth.get(p.line) ?? 0);
    p.x += align === 'center' ? room / 2 : align === 'right' ? room : 0;
  }
  return { pieces, width, height: pieces.length ? (line + 1) * lineHeight : 0, lineHeight, chars };
}

/** Keys a text layer has and a group does not (the pieces carry the style; the string is the spans). */
const TEXT_ONLY = ['type', 'spans', 'text', 'style', 'format', 'colorSpace', 'fillGradient', 'initial', 'keyframes'];
/** Properties of one text that cannot be one number for a group of pieces. */
const NOT_FOR_A_GROUP = ['fill', 'text', 'value', 'fillGradient'];

/**
 * The composition that a text layer with `spans` stands for. Its size is the measured block; the layer's `name`, time, `initial`, `keyframes` and
 * picture keys move to it; `anchorX` / `anchorY` become its pivot. Pieces are named `<name>.0`, `<name>.1` … and a typewriter (`visibleChars`) is
 * remembered in `spansMeta` for the sequence that counts over the pieces.
 */
export function expandSpans(spec: TextSequenceSpec, warn: Warn = defaultWarn): SequenceSpec {
  const who = describeLayer(spec as SequenceSpec);
  const s = spec as unknown as Record<string, unknown> & TextSequenceSpec;
  if (s.text !== undefined) warn(`pixi-effects: ${who}: "text" is ignored when the layer has spans: write the text as spans`);
  const style = (s.style ?? {}) as Record<string, unknown>;
  const align = (['left', 'center', 'right'].includes(String(style.align)) ? style.align : 'center') as 'left' | 'center' | 'right';
  const layout = layoutSpans(s.spans, style, align, who, warn);

  const dropped = new Set<string>();
  const clean = (bag: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    if (!bag) return bag;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bag)) { if (NOT_FOR_A_GROUP.includes(k)) dropped.add(k); else out[k] = v; }
    return out;
  };
  const initial = clean(s.initial as Record<string, unknown> | undefined) ?? {};
  const keyframes = (s.keyframes ?? []).map(kf => ({ ...kf, set: clean(kf.set as never), to: clean(kf.to as never), from: clean(kf.from as never) }));
  if (dropped.size) warn(`pixi-effects: ${who}: ${[...dropped].join(', ')} do not apply to a spans layer (it is a group of text layers): use a separate text layer, or put the colour in a span`);

  const typed = initial.visibleChars !== undefined || keyframes.some(kf => [kf.set, kf.to, kf.from].some(p => p && (p as Record<string, unknown>).visibleChars !== undefined));
  const width = Math.max(1, layout.width), height = Math.max(1, layout.height);
  if (typeof initial.anchorX === 'number') { initial.pivotX = initial.anchorX * width; delete initial.anchorX; }
  if (typeof initial.anchorY === 'number') { initial.pivotY = initial.anchorY * height; delete initial.anchorY; }

  const baseName = typeof s.name === 'string' && s.name ? s.name : 'spans';
  const drawn = layout.pieces.filter(p => !p.blank);
  const sequences = drawn.map((p, i) => ({
    type: 'text' as const, name: `${baseName}.${i}`, text: p.text,
    style: { ...style, ...p.style },
    initial: { x: p.x, y: p.y, ...(typed ? { visibleChars: p.length } : {}) },
  }));
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) if (!TEXT_ONLY.includes(k)) rest[k] = v;
  const group = { type: 'composition', ...rest, width, height, initial, keyframes, sequences } as unknown as SequenceSpec;
  spansMeta.set(group, { typed, pieces: drawn.map(p => ({ start: p.start, length: p.length })), preview: layout.pieces.map((p, i) => (i > 0 && p.line !== layout.pieces[i - 1]!.line ? ' ' : '') + p.text).join('') });
  return group;
}
