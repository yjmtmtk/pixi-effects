import { pureEase, type EaseFn } from './ease';
import { PIXI_INERT, lerpColor, parseColor, pixiAccessors, plainAccessor, rawAccessor, type Accessor, type Target } from './props';

/**
 * A timeline that is a pure function of time (spike: see docs/superpowers/specs/2026-10-10-pure-timeline-design.md).
 *
 * For every (target, property) it keeps the segments that write it, ordered by start time. The value at `t`
 * is the value of the last segment that has started, computed from `t` alone; nothing is remembered between
 * two calls except the start values captured when the segment was built. GSAP is the oracle: the rules below
 * were taken from black-box probes of `gsap.timeline` and are checked against it by tests/core/pure/timelineParity.test.ts.
 */

export interface PureVars {
  duration?: number;
  ease?: string | EaseFn;
  repeat?: number;
  yoyo?: boolean;
  repeatDelay?: number;
  onUpdate?: () => void;
  /** The Pixi plugin's shorthands: `scale`, `anchor`, `rotation` (degrees), `tint`, `autoAlpha` ... */
  pixi?: Record<string, unknown>;
  [prop: string]: unknown;
}

/** A property of a target that a segment writes; the unit the value is computed for. */
interface Channel {
  target: Target;
  acc: Accessor;
  /** The value shown before the first segment starts (see `prepare`). */
  pre: any;
  /** What the channel wrote last: a segment's `onUpdate` runs when it changes (two segments on one property share it). */
  last: unknown;
  segs: Segment[];
  /** `segs` is sorted by (start, creation order) before it is read. */
  dirty: boolean;
}

interface Segment {
  channel: Channel;
  kind: 'set' | 'to' | 'from' | 'fromTo';
  /** What the property was when this segment was built (a `from` ends there unless a tween just before it ends elsewhere). */
  createCur: any;
  start: number;
  dur: number;
  ease: EaseFn;
  repeat: number;
  yoyo: boolean;
  repeatDelay: number;
  /** `null` for a `to` / `from` tween whose start is "where the property was": resolved on first use. */
  from: any;
  to: any;
  /** Relative values (`'+=36'`) are resolved against the start. */
  toRel: boolean;
  onUpdate?: () => void;
  order: number;
  /** `'fn'` channels: where it starts and ends, from the value before it (`start`) and the value the channel had at the beginning (`base`). */
  fnFrom?: (prev: any) => any;
  fnTo?: (start: any, prev: any, base: any) => any;
  fnMake?: (a: any, b: any) => (p: number) => any;
  /** A write that switches when the segment starts (revertible sets): `to` is the value, whatever the channel is. */
  step?: boolean;
  /** How this segment writes the property, when it is not the way the channel's first segment did (a tween and a set can share a property). */
  write?: (v: any) => void;
  interp?: (p: number) => any;
  /** The segment of the same call on another channel whose numbers this one copies (autoAlpha's `visible` follows its `alpha`). */
  partner?: Segment;
}

interface ChildItem {
  child: PureTimeline;
  start: number;
  order: number;
  last: number;
}

/** GSAP keeps start times and durations to seven decimals, and tweened numbers to six; matching both keeps the pictures identical. */
export const quantize = (x: number): number => Math.round(x * 1e7) / 1e7 || 0;
const TINY = 1e-8;

/** A marker that only lengthens a timeline (what `gsap.to({}, { duration })` is used for). */
export interface Spacer { readonly spacer: true; readonly duration: number }
export const spacer = (duration: number): Spacer => ({ spacer: true, duration });

const parseRel = (v: unknown): { rel: boolean; n: number } | null => {
  if (typeof v === 'number') return { rel: false, n: v };
  if (typeof v === 'string') {
    const m = /^([+-])=\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)$/i.exec(v.trim());
    if (m) return { rel: true, n: (m[1] === '-' ? -1 : 1) * parseFloat(m[2]!) };
    const n = parseFloat(v);
    if (Number.isFinite(n) && String(n) === v.trim()) return { rel: false, n };
  }
  return null;
};

const RESERVED = new Set(['duration', 'ease', 'repeat', 'yoyo', 'repeatDelay', 'onUpdate', 'delay']);

export class PureTimeline {
  private readonly defaultEase: string | EaseFn;
  private readonly channels = new Map<Target, Map<string, Channel>>();
  private readonly channelList: Channel[] = [];
  private readonly children: ChildItem[] = [];
  private spans = 0;
  private now = 0;
  private order = 0;
  private killed = false;
  private prepared = false;

  constructor(opts: { paused?: boolean; defaults?: { ease?: string | EaseFn } } = {}) {
    this.defaultEase = opts.defaults?.ease ?? 'none';
  }

  // --- building ------------------------------------------------------------------------------------------

  /** Adds a child timeline (played with its local time) or a spacer that lengthens this one. */
  add(child: PureTimeline | Spacer, at?: number): this {
    const start = at ?? this.spans;
    if ('spacer' in child) {
      this.spans = Math.max(this.spans, start + child.duration);
    } else if (!(child instanceof PureTimeline)) {
      // a tween of another engine (`gsap.to({}, { duration })`): only its length matters
      this.spans = Math.max(this.spans, start + (child as { duration(): number }).duration());
    } else {
      this.children.push({ child, start, order: this.order++, last: NaN });
      this.prepared = false;
      this.spans = Math.max(this.spans, start + child.duration());
    }
    return this;
  }

  set(target: object, vars: PureVars, at?: number): this {
    return this.build(target, null, { ...vars, duration: 0 }, at, 'set');
  }

  to(target: object, vars: PureVars, at?: number): this {
    return this.build(target, null, vars, at, 'to');
  }

  from(target: object, vars: PureVars, at?: number): this {
    return this.build(target, null, vars, at, 'from');
  }

  fromTo(target: object, fromVars: PureVars, toVars: PureVars, at?: number): this {
    return this.build(target, fromVars, toVars, at, 'fromTo');
  }

  private build(target: object, fromVars: PureVars | null, vars: PureVars, at: number | undefined, kind: 'set' | 'to' | 'from' | 'fromTo'): this {
    const t = target as Target;
    const start = quantize(at ?? this.spans);
    const dur = quantize(Math.max(0, vars.duration ?? 0));
    const repeat = Math.max(0, Math.floor(vars.repeat ?? 0));
    const yoyo = !!vars.yoyo;
    const repeatDelay = Math.max(0, vars.repeatDelay ?? 0);
    const easeName = vars.ease ?? this.defaultEase;
    const ease = typeof easeName === 'function' ? easeName : pureEase(easeName);
    const given = (v: PureVars): Map<string, { acc: Accessor; value: unknown }> => {
      const out = new Map<string, { acc: Accessor; value: unknown }>();
      for (const key of Object.keys(v)) {
        if (RESERVED.has(key) || key === 'pixi') continue;
        const value = v[key];
        const acc = parseRel(value) ? plainAccessor(t, key) : rawAccessor(t, key);   // a boolean or a word switches when its segment starts
        out.set(acc.id, { acc, value });
      }
      if (v.pixi) for (const key of Object.keys(v.pixi)) {
        const accs = pixiAccessors(t, key);
        if (!accs) { if (!PIXI_INERT.has(key)) console.warn(`pixi-effects: the pure timeline has no "${key}" shorthand yet; it is ignored`); continue; }
        for (const acc of accs) out.set(acc.id, { acc, value: v.pixi[key] });
      }
      return out;
    };
    const ends = given(vars);
    const starts = fromVars ? given(fromVars) : new Map<string, { acc: Accessor; value: unknown }>();
    const ids = kind === 'fromTo' ? [...new Set([...starts.keys(), ...ends.keys()])] : [...ends.keys()];
    let lastAlpha: Segment | undefined;
    for (const id of ids) {
      const e = ends.get(id), f = starts.get(id);
      const acc = (e ?? f)!.acc;
      const ch = this.channel(t, acc);
      const cur = acc.get();
      const color = acc.kind === 'color';
      const endSpec = e ? read(e.value, acc) : null;
      if (e && !endSpec && acc.kind === 'color') console.warn(`pixi-effects: the pure timeline cannot read the colour ${JSON.stringify(e.value)} (use #rgb, #rrggbb, rgb(...) or a number); this tween is skipped`);
      const fromSpec = f ? read(f.value, acc) : null;
      let from: number | null = null, to: number, toRel = false;
      if (kind === 'from') {
        // `from`: the value given is where it starts; where it ends is where the property is now (captured now,
        // after any earlier `from` already wrote its start: that is GSAP's immediateRender).
        const g = endSpec ?? { rel: false, n: cur };
        from = g.rel ? cur + g.n : g.n;
        to = cur;
        // immediateRender: the start value is shown from the moment the tween exists.
        acc.set(from);
      } else if (kind === 'fromTo') {
        if (fromSpec) from = fromSpec.rel ? cur + fromSpec.n : fromSpec.n;
        if (endSpec) { to = endSpec.n; toRel = endSpec.rel; } else to = cur;
        if (from !== null) acc.set(from);
      } else {
        if (!endSpec) continue;
        to = endSpec.n; toRel = endSpec.rel;
      }
      if (color && toRel) toRel = false;
      const seg: Segment = {
        channel: ch, kind, createCur: cur, start, dur, ease, repeat, yoyo, repeatDelay, from, to, toRel,
        onUpdate: vars.onUpdate, order: this.order++,
      };
      if (id === 'visible#auto') seg.partner = lastAlpha;
      else if (id === 'alpha') lastAlpha = seg;
      ch.segs.push(seg);
      ch.dirty = true;
      this.prepared = false;
    }
    const total = dur * (repeat + 1) + repeatDelay * repeat;
    this.spans = Math.max(this.spans, start + total);
    return this;
  }

  private channel(target: Target, acc: Accessor): Channel {
    let m = this.channels.get(target);
    if (!m) this.channels.set(target, (m = new Map()));
    let ch = m.get(acc.id);
    if (!ch) {
      ch = { target, acc, pre: NaN, last: NaN, segs: [], dirty: false };
      m.set(acc.id, ch);
      this.channelList.push(ch);
    }
    return ch;
  }

  /**
   * A property moved by a function of the caller (a colour in OKLab, a gradient): `to` and `from` say how to get the two ends from
   * the value before the segment, `make` the interpolator between them. The value is only written while the segment is the last
   * one that has started, so nothing is read or kept between two frames.
   */
  tweenValue<T>(spec: {
    holder: object; id: string; get(): T; set(v: T): void;
    from?: (prev: T) => T; to: (start: T, prev: T, base: T) => T; make: (a: T, b: T) => (p: number) => T;
    duration: number; ease: string | EaseFn; at: number; repeat?: number; yoyo?: boolean; repeatDelay?: number;
  }): this {
    const acc: Accessor = { id: spec.id, kind: 'fn', unit: 1, round: 1, get: spec.get, set: spec.set, make: spec.make };
    const ch = this.channel(spec.holder as Target, acc);
    const start = quantize(spec.at);
    const dur = quantize(Math.max(0, spec.duration));
    const repeat = Math.max(0, Math.floor(spec.repeat ?? 0));
    const repeatDelay = Math.max(0, spec.repeatDelay ?? 0);
    const ease = typeof spec.ease === 'function' ? spec.ease : pureEase(spec.ease);
    ch.segs.push({
      channel: ch, kind: 'to', createCur: null, start, dur, ease, repeat, yoyo: !!spec.yoyo, repeatDelay, from: null, to: null, toRel: false,
      order: this.order++, fnFrom: spec.from as never, fnTo: spec.to as never, fnMake: spec.make as never, write: spec.set as never,
    });
    ch.dirty = true;
    this.prepared = false;
    this.spans = Math.max(this.spans, start + dur * (repeat + 1) + repeatDelay * repeat);
    return this;
  }

  /**
   * A write that is undone when time goes back before it: the property is `value` from `at` on, and what it was before otherwise.
   * `holder` and `id` name the property, so a set and the tweens of the same property are one channel; `write` is the way the caller
   * writes it (it may do more than assign: redraw), and runs again whenever this set is what the property shows.
   */
  setValue<T>(holder: object, id: string, at: number, read: () => T, write: (v: T) => void, value: T): this {
    const acc: Accessor = { id, kind: typeof value === 'number' ? 'num' : 'raw', unit: 1, round: 1e6, get: read, set: write };
    const ch = this.channel(holder as Target, acc);
    ch.segs.push({
      channel: ch, kind: 'set', createCur: null, start: quantize(at), dur: 0, ease: pureEase('none'), repeat: 0, yoyo: false, repeatDelay: 0,
      from: null, to: value, toRel: false, order: this.order++, step: true, write: write as never,
      onUpdate: () => write(read()),
    });
    ch.dirty = true;
    this.prepared = false;
    this.spans = Math.max(this.spans, quantize(at));
    return this;
  }

  // --- reading -------------------------------------------------------------------------------------------

  duration(): number { return this.spans; }

  time(): number;
  time(value: number): this;
  time(value?: number): number | this {
    if (value === undefined) return this.now;
    if (this.killed) return this;
    this.now = value;
    this.evaluate(quantize(value));
    return this;
  }

  /** GSAP's name for `time(t)`. */
  seek(t: number): this { return this.time(t); }

  progress(): number;
  progress(p: number): this;
  progress(p?: number): number | this {
    if (p === undefined) return this.spans > 0 ? this.now / this.spans : 0;
    return this.time(p * this.spans);
  }

  kill(): void {
    this.killed = true;
    this.channels.clear();
    this.channelList.length = 0;
    this.children.length = 0;
  }

  // --- evaluation ----------------------------------------------------------------------------------------

  /**
   * What GSAP ends up with once it has been played to the end and back (Movie does that once at build), as rules that depend
   * on the segments of a property only:
   * - a `from` / `fromTo` shows its start from the moment it is built, so a `to` that comes first starts at the start of the
   *   `from` built last, else at the property's own value;
   * - a `to` (and a `set`) starts where the segment before it ended;
   * - a `from` ends where the segment before it ended, or, with none before, where the property was when it was built;
   * - before the first segment the property shows that segment's start.
   */
  private prepare(ch: Channel): void {
    if (!ch.dirty) return;
    ch.segs.sort((a, b) => a.start - b.start || a.order - b.order);
    ch.dirty = false;
    let latest: Segment | null = null;
    for (const s of ch.segs) if ((s.kind === 'from' || s.kind === 'fromTo') && s.from !== null && (!latest || s.order > latest.order)) latest = s;
    let cur = latest ? latest.from! : ch.acc.get();
    const base = cur;
    let first = true;
    for (const s of ch.segs) {
      const before = cur;
      if (s.fnTo) {
        s.from = s.fnFrom ? s.fnFrom(cur) : cur;
        s.to = s.fnTo(s.from, before, base);
        s.interp = undefined;
      } else {
        if (s.partner) { s.from = s.partner.from; s.to = s.partner.to; }
        if (s.from === null) s.from = cur;
        if (s.kind === 'from') s.to = first ? s.createCur : cur;
        if (s.toRel) { s.to = s.from + s.to; s.toRel = false; }
      }
      if (first) ch.pre = s.fnTo ? before : s.from;
      cur = endValue(s);
      first = false;
    }
  }

  /** Every channel of this timeline and of its children reads the property it starts from before any of them writes. */
  private prepareDeep(): void {
    if (this.prepared) return;
    this.prepared = true;
    for (const ch of this.channelList) this.prepare(ch);
    for (const c of this.children) c.child.prepareDeep();
  }

  private evaluate(t: number): void {
    this.prepareDeep();
    for (const ch of this.channelList) {
      const segs = ch.segs;
      // the last segment whose start is not after t
      let lo = 0, hi = segs.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid]!.start <= t + TINY) lo = mid + 1; else hi = mid; }
      let k = lo - 1;
      // a repeating tween is not yet on at the exact moment it starts (GSAP shows what was there before)
      while (k >= 0 && segs[k]!.repeat > 0 && t - segs[k]!.start <= TINY) k--;
      const seg = k >= 0 ? segs[k]! : null;
      if (!seg) {
        const pre = settle(ch.acc, ch.pre);
        write(ch, segs[0], pre);
        const head = segs[0];
        if (pre !== ch.last) { ch.last = pre; head?.onUpdate?.(); }
        continue;
      }
      const v = mix(seg, ratioAt(seg, t), over);
      write(ch, seg, v);
      if (v !== ch.last) { ch.last = v; seg.onUpdate?.(); }
    }
    for (const c of this.children) {
      const local = Math.min(Math.max(t - c.start, 0), c.child.duration());
      if (local !== c.last) { c.last = local; c.child.time(local); }
    }
  }
}

/** Writes a value unless the property already holds it: a setter that decodes a frame or redraws a text runs when the value changes. */
function write(ch: Channel, seg: Segment | undefined, v: any): void {
  if (!ch.acc.always && ch.acc.get() === v) return;
  (seg?.write ?? ch.acc.set)(v);
}

function endValue(s: Segment): any {
  if (s.dur === 0 && s.repeat === 0) return s.to;
  return s.yoyo && s.repeat % 2 === 1 ? s.from! : s.to;
}

/** The value a key gives, in the unit of the property; `rel` for `'+=36'`. */
function read(value: unknown, acc: Accessor): { rel: boolean; n: any } | null {
  if (acc.kind === 'raw') return { rel: false, n: value };
  if (acc.kind === 'color') {
    const c = parseColor(value);
    return c === null ? null : { rel: false, n: c };
  }
  const r = parseRel(value);
  return r ? { rel: r.rel, n: r.n * acc.unit } : null;
}

/** A start value as GSAP shows it before the tween begins: rendered at ratio 0, so rounded like the rest of the tween. */
function settle(acc: Accessor, v: any): any {
  return acc.kind !== 'num' ? v : Math.round(v * acc.round) / acc.round;
}

/** Set by `ratioAt`: the tween is over (the exact end value is written), not merely at or past the end of its curve. */
let over = false;

function mix(s: Segment, r: number, ended: boolean): any {
  const acc = s.channel.acc;
  if (s.step) return s.to;
  if (s.fnMake) {                                            // before `raw`: a channel made by a set can carry a tween
    const interp = (s.interp ??= s.fnMake(s.from, s.to));
    return interp(Math.round(r * 1e6) / 1e6);              // a number tweened from 0 to 1, as GSAP writes it
  }
  if (acc.kind === 'raw') return s.to;
  if (acc.kind === 'color') return ended ? endValue(s) : lerpColor(s.from!, s.to, r);
  if ((ended || r === 1) && acc.exactEnd) return endValue(s);
  const k = acc.round;
  return Math.round((s.from! + (s.to - s.from!) * r) * k) / k;
}

/** How far along the tween is (the ease applied, repeats and yoyo folded in); 1 when it is over. */
function ratioAt(s: Segment, t: number): number {
  const lt = t - s.start;
  over = true;
  if (s.dur === 0) return 1;
  const total = s.dur * (s.repeat + 1) + s.repeatDelay * s.repeat;
  if (quantize(lt) >= quantize(total) - TINY) return endRatio(s);
  over = false;
  let i = 0;
  let within = lt;
  if (s.repeat > 0) {
    const period = s.dur + s.repeatDelay;
    // an exact hand-over between two cycles belongs to the cycle that ends there; GSAP compares them at seven decimals
    const q = quantize(lt);
    i = Math.min(s.repeat, Math.max(0, Math.floor(lt / period)));
    while (i > 0 && q <= quantize(i * period)) i--;
    while (i < s.repeat && q > quantize((i + 1) * period)) i++;
    within = quantize(lt - i * period);
  }
  let p = within >= s.dur ? 1 : within <= 0 ? 0 : within / s.dur;
  if (s.yoyo && i % 2 === 1) p = 1 - p;
  return s.ease(p);
}

/** At the end the value is exact: where a yoyo that repeats an odd number of times ends up, or the `to`. */
function endRatio(s: Segment): number {
  return s.yoyo && s.repeat % 2 === 1 ? 0 : 1;
}
