import { Text, FillGradient } from 'pixi.js';
import { gradStateFrom, bindGradientKeyframes, validateGradientKeyframes, type GradState } from './gradientAnim';
import { gradientOptions } from './gradient';
import { gsap } from 'gsap';
import { kfDuration } from '../core/spring';
import { Sequence } from './Base';
import { normalizeProps } from '../expr/normalizeProps';
import { applyKeyframes, applyInitial, resolveAt, loopVars } from '../core/Timeline';
import { revertibleSet } from '../core/revertibleSet';
import { tweenColor } from '../expr/colorTween';
import { describeLayer } from '../core/lint';
import type { ColorInput } from '../expr/colorInterp';
import type { TextSequenceSpec, Keyframe, Props, GradientSpec } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

// TextStyle fields whose string values are words or colours, never expressions. `join` / `cap` / `color`
// also live inside `stroke` and `dropShadow`, `stroke` itself may be a colour name.
const STYLE_OPAQUE_KEYS = [
  'fontFamily', 'fill', 'align', 'fontStyle', 'fontWeight', 'fontVariant', 'textBaseline', 'whiteSpace',
  'lineJoin', 'join', 'cap', 'color', 'stroke',
];

type CounterState = { value: number; visibleChars: number };

function formatValue(v: number, f: TextSequenceSpec['format']): string {
  const fixed = v.toFixed(Math.max(0, Math.floor(f?.decimals ?? 0)));
  const pad = Math.max(0, Math.floor(f?.pad ?? 0));
  if (!f?.grouping && !pad) return fixed;
  const [signed, frac] = fixed.split('.') as [string, string | undefined];
  const sign = signed.startsWith('-') ? '-' : '';
  let int = sign ? signed.slice(1) : signed;
  if (pad) int = int.padStart(pad, '0');
  if (f?.grouping) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + int + (frac !== undefined ? '.' + frac : '');
}

export class TextSequence extends Sequence {
  declare spec: TextSequenceSpec;
  /** `value`: the number for the `{value}` placeholder; `visibleChars`: how many characters show (typewriter). Both tweened by keyframes. */
  private _counters: CounterState = { value: 0, visibleChars: 0 };
  /** The string now on the layer (before `{value}` / `visibleChars`): `text`, or the last `set: { text }`. */
  private _template = '';
  /** `visibleChars` is in play (initial or animated): otherwise the whole text shows. */
  private _typed = false;
  private _lastText = '';
  /** A gradient fill for the text (`fillGradient`, static or animated): rebuilt as a FillGradient on each change (the text is re-rasterised). */
  private _grad: { grad: GradState } | null = null;
  private _fillGradient: FillGradient | null = null;
  private _applyGradient(): void {
    const g = this._grad!.grad;
    const next = new FillGradient(gradientOptions({ angle: g.angle, stops: g.stops.map(s => [s.offset, s.color] as [number, string]) }) as never);
    (this.target as Text).style.fill = next as never;
    this._fillGradient?.destroy();
    this._fillGradient = next;
  }
  override destroy(): void {
    super.destroy();
    this._fillGradient?.destroy();
    this._fillGradient = null;
  }

  /** A typewriter that has typed nothing yet: the layer is empty on purpose (inspect must not call that "no size"). */
  get showsNothingYet(): boolean { return this._typed && this._lastText === '' && this._template !== ''; }

  /** Rewrite the displayed string from the template, the current `value` and `visibleChars`. */
  private _refreshText(): void {
    let next = this._template.includes('{value}')
      ? this._template.split('{value}').join(formatValue(this._counters.value, this.spec.format))
      : this._template;
    if (this._typed) next = Array.from(next).slice(0, Math.max(0, Math.floor(this._counters.visibleChars))).join('');
    if (next === this._lastText) return;
    this._lastText = next;
    (this.target as Text).text = next;
  }

  async build(): Promise<void> {
    const baseStyle = {
      fontFamily: 'Arial',
      fontSize: 36,
      fill: '#ffffff',
      align: 'center' as const,
    };
    const initialProps = (this.spec.initial ?? {}) as Record<string, unknown>;
    this._template = String(initialProps.text ?? this.spec.text ?? '');
    const text = new Text({
      text: this._template,
      style: baseStyle,
      label: this.spec.name,
    });
    text.cullable = true;
    this.target = text;
    this.intrinsicWidth = text.width;
    this.intrinsicHeight = text.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    if (this.spec.style) {
      const scope = this.scope();
      const resolved = normalizeProps(
        this.spec.style as Record<string, unknown>,
        scope as unknown as Record<string, number>,
        { skipKeys: STYLE_OPAQUE_KEYS },
      );
      for (const k of Object.keys(resolved)) {
        (text.style as unknown as Record<string, unknown>)[k] = (resolved as Record<string, unknown>)[k];
      }
      // Re-measure: `w` / `h` in expressions must describe the STYLED text.
      this.intrinsicWidth = text.width;
      this.intrinsicHeight = text.height;
    }
    validateGradientKeyframes(this.spec as never, describeLayer(this.spec));              // once, here: a tween's onStart runs again at every seek
    const gradientSpec = this.spec.fillGradient ?? (initialProps.fillGradient as GradientSpec | undefined);
    if (gradientSpec) { this._grad = { grad: gradStateFrom(gradientSpec) }; this._applyGradient(); }
    // `{value}` counter / `visibleChars`: seed the numbers from initial and print.
    const scope = this.scope();
    if (initialProps.value !== undefined) this._counters.value = resolveNumber(initialProps.value, scope);
    this._typed = initialProps.visibleChars !== undefined || animates(this.spec.keyframes, 'visibleChars');
    if (initialProps.visibleChars !== undefined) this._counters.visibleChars = resolveNumber(initialProps.visibleChars, scope);
    // `w` / `h` describe the whole text, not the part typed so far: measure before slicing.
    const typed = this._typed;
    this._typed = false;
    this._refreshText();
    if (this._lastText !== '') {
      this.intrinsicWidth = text.width;
      this.intrinsicHeight = text.height;
    }
    this._typed = typed;
    this._refreshText();
    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const colorSpace = this.spec.colorSpace ?? 'rgb';
    // Run the standard pipeline with `fill` stripped — text doesn't have a
    // top-level `fill` property (it lives on `style`), so leaving it in
    // would make GSAP warn about an unknown prop. Then route fill through
    // our per-frame text.style.fill update, with optional perceptual
    // interpolation.
    // `value` (the counter) is likewise not a property of the Text object.
    // `text` (a string swap) and `visibleChars` (the typewriter count) are likewise ours, not the Text object's.
    const stripped = stripKeys(this.spec, ['fill', 'value', 'text', 'visibleChars', 'fillGradient']);
    runSuperWithStrippedSpec(this, stripped, timeline, offset);
    const keyframes = this.spec.keyframes ?? [];
    const origin = offset + this.at;
    bindFillKeyframes(timeline, this.target as Text, keyframes, this.duration!, origin, colorSpace);
    if (this._grad) bindGradientKeyframes(timeline, this._grad, keyframes, this.duration!, origin, colorSpace, () => this._applyGradient());
    const refresh = (): void => this._refreshText();
    bindCounterKeyframes(timeline, this._counters, 'value', refresh, keyframes, this.duration!, origin, this.scope());
    bindCounterKeyframes(timeline, this._counters, 'visibleChars', refresh, keyframes, this.duration!, origin, this.scope());
    bindTextKeyframes(timeline, keyframes, this.duration!, origin, () => this._template, t => { this._template = t; refresh(); }, describeLayer(this.spec));
  }
}

// Helper: temporarily swap in a fill-stripped spec, run the base
// bindTimeline, restore. Cheaper than reimplementing the entire base
// behaviour.
function runSuperWithStrippedSpec(
  inst: TextSequence,
  strippedSpec: TextSequenceSpec,
  timeline: Timeline,
  offset: number,
): void {
  const originalSpec = inst.spec;
  (inst as unknown as { spec: TextSequenceSpec }).spec = strippedSpec;
  try {
    Sequence.prototype.bindTimeline.call(inst, timeline, offset);
  } finally {
    (inst as unknown as { spec: TextSequenceSpec }).spec = originalSpec;
  }
}

function stripKeys(spec: TextSequenceSpec, keys: string[]): TextSequenceSpec {
  return {
    ...spec,
    initial: stripProps(spec.initial, keys),
    keyframes: spec.keyframes
      ? spec.keyframes.map(kf => ({
          ...kf,
          set: stripProps(kf.set, keys),
          to: stripProps(kf.to, keys),
          from: stripProps(kf.from, keys),
        }))
      : undefined,
  };
}

function stripProps(props: Props | undefined, keys: string[]): Props | undefined {
  if (!props) return props;
  if (!keys.some(k => k in props)) return props;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(props)) if (!keys.includes(k)) out[k] = (props as Record<string, unknown>)[k];
  return out as unknown as Props;
}

function resolveNumber(v: unknown, scope: unknown): number {
  if (typeof v === 'number') return v;
  const out = normalizeProps({ v }, scope as unknown as Record<string, number>).v;
  return typeof out === 'number' ? out : Number(out) || 0;
}

// Tween a number on the layer (`value` for the `{value}` counter, `visibleChars` for the typewriter). Mirrors the other
// keyframe kinds (set / to / from / from+to), honours ease and repeat/yoyo, and calls `refresh` after every update.
function bindCounterKeyframes(
  timeline: Timeline,
  state: CounterState,
  key: keyof CounterState,
  refresh: () => void,
  keyframes: Keyframe[],
  parentDuration: number,
  origin: number,
  scope: unknown,
): void {
  for (const kf of keyframes) {
    const setV = kf.set?.[key];
    const fromV = kf.from?.[key];
    const toV = kf.to?.[key];
    if (setV === undefined && fromV === undefined && toV === undefined) continue;
    const at = origin + resolveAt(kf.at, parentDuration);
    const duration = kfDuration(kf);
    const ease = kf.ease ?? 'none';
    const loop = loopVars(kf);
    if (setV !== undefined) {
      const v = resolveNumber(setV, scope);
      revertibleSet(timeline, at, () => state[key], n => { state[key] = n; refresh(); }, v);
    }
    if (toV !== undefined && fromV !== undefined) {
      timeline.fromTo(state, { [key]: resolveNumber(fromV, scope) },
        { [key]: resolveNumber(toV, scope), duration, ease, ...loop, onUpdate: refresh }, at);
    } else if (toV !== undefined) {
      timeline.to(state, { [key]: resolveNumber(toV, scope), duration, ease, ...loop, onUpdate: refresh }, at);
    } else if (fromV !== undefined) {
      timeline.from(state, { [key]: resolveNumber(fromV, scope), duration, ease, ...loop, onUpdate: refresh }, at);
    }
  }
}

/** `set: { text }` swaps the string at that time (and back when you seek back). A string cannot be tweened. */
function bindTextKeyframes(
  timeline: Timeline,
  keyframes: Keyframe[],
  parentDuration: number,
  origin: number,
  read: () => string,
  write: (t: string) => void,
  who: string,
): void {
  for (const kf of keyframes) {
    for (const [what, props] of [['to', kf.to], ['from', kf.from]] as const) {
      if (props && (props as Record<string, unknown>).text !== undefined) {
        console.warn(`pixi-effects: ${who}: a keyframe's ${what}: { text } cannot tween a string: use set: { text: '…' } at the time it should change`);
      }
    }
    const t = (kf.set as Record<string, unknown> | undefined)?.text;
    if (t === undefined) continue;
    revertibleSet(timeline, origin + resolveAt(kf.at, parentDuration), read, write, String(t));
  }
}

function animates(keyframes: Keyframe[] | undefined, key: string): boolean {
  return (keyframes ?? []).some(kf => [kf.set, kf.to, kf.from].some(p => p && (p as Record<string, unknown>)[key] !== undefined));
}

// Walk the keyframes and emit colour tweens for any `fill` mutation.
// Updates `text.style.fill` directly; PIXI v8 marks the text dirty on
// style mutation, so the fill change is rendered on the next frame.
function bindFillKeyframes(
  timeline: Timeline,
  text: Text,
  keyframes: Keyframe[],
  parentDuration: number,
  offset: number,
  colorSpace: 'rgb' | 'oklab' | 'oklch',
): void {
  // Mirror state object so tweenColor has somewhere consistent to write.
  // We then mirror back to text.style.fill in the onUpdate callback.
  const state: { fill?: ColorInput } = { fill: text.style.fill as ColorInput | undefined };
  const writeFill = (): void => { text.style.fill = state.fill as never; };

  for (const kf of keyframes) {
    const at = offset + resolveAt(kf.at, parentDuration);
    const duration = kfDuration(kf);
    const ease = kf.ease ?? 'none';
    const setFill  = pickFill(kf.set);
    const fromFill = pickFill(kf.from);
    const toFill   = pickFill(kf.to);

    if (setFill !== undefined) {
      revertibleSet(timeline, at, () => state.fill, c => { state.fill = c; writeFill(); }, setFill);
    }
    if (toFill !== undefined) {
      tweenColor(
        timeline,
        state as unknown as Record<string, unknown>,
        'fill',
        fromFill,
        toFill,
        duration, ease, at, colorSpace,
        writeFill, loopVars(kf),
      );
    }
  }
}

function pickFill(props: Props | undefined): ColorInput | undefined {
  if (!props) return undefined;
  const v = (props as Record<string, unknown>).fill;
  if (typeof v === 'string' || typeof v === 'number') return v as ColorInput;
  return undefined;
}
