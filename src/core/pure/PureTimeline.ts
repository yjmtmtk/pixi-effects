import { pureEase, type EaseFn } from './ease';
import { lerpColor, parseColor, pixiAccessors, plainAccessor, type Accessor, type Target } from './props';

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
  pre: number;
  segs: Segment[];
  /** `segs` is sorted by (start, creation order) before it is read. */
  dirty: boolean;
}

interface Segment {
  channel: Channel;
  kind: 'set' | 'to' | 'from' | 'fromTo';
  /** What the property was when this segment was built (a `from` ends there unless a tween just before it ends elsewhere). */
  createCur: number;
  start: number;
  dur: number;
  ease: EaseFn;
  repeat: number;
  yoyo: boolean;
  repeatDelay: number;
  /** `null` for a `to` / `from` tween whose start is "where the property was": resolved on first use. */
  from: number | null;
  to: number;
  /** Relative values (`'+=36'`) are resolved against the start. */
  toRel: boolean;
  onUpdate?: () => void;
  lastReported: number;
  order: number;
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

  constructor(opts: { paused?: boolean; defaults?: { ease?: string | EaseFn } } = {}) {
    this.defaultEase = opts.defaults?.ease ?? 'none';
  }

  // --- building ------------------------------------------------------------------------------------------

  /** Adds a child timeline (played with its local time) or a spacer that lengthens this one. */
  add(child: PureTimeline | Spacer, at?: number): this {
    const start = at ?? this.spans;
    if ('spacer' in child) {
      this.spans = Math.max(this.spans, start + child.duration);
    } else {
      this.children.push({ child, start, order: this.order++, last: NaN });
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
        const acc = plainAccessor(t, key);
        out.set(acc.id, { acc, value: v[key] });
      }
      if (v.pixi) for (const key of Object.keys(v.pixi)) {
        const accs = pixiAccessors(t, key);
        if (!accs) { console.warn(`pixi-effects: the pure timeline has no "${key}" shorthand yet; it is ignored`); continue; }
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
        onUpdate: vars.onUpdate, lastReported: NaN, order: this.order++,
      };
      if (id === 'visible#auto') seg.partner = lastAlpha;
      else if (id === 'alpha') lastAlpha = seg;
      ch.segs.push(seg);
      ch.dirty = true;
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
      ch = { target, acc, pre: NaN, segs: [], dirty: false };
      m.set(acc.id, ch);
      this.channelList.push(ch);
    }
    return ch;
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
    for (const s of ch.segs) if (s.from !== null && (!latest || s.order > latest.order)) latest = s;
    let cur = latest ? latest.from! : ch.acc.get();
    let first = true;
    for (const s of ch.segs) {
      if (s.partner) { s.from = s.partner.from; s.to = s.partner.to; }
      if (s.from === null) s.from = cur;
      if (s.kind === 'from') s.to = first ? s.createCur : cur;
      if (s.toRel) { s.to = s.from + s.to; s.toRel = false; }
      if (first) ch.pre = s.from;
      cur = endValue(s);
      first = false;
    }
  }

  private evaluate(t: number): void {
    // every channel reads the property it starts from before any of them writes (autoAlpha's `visible` reads the alpha)
    for (const ch of this.channelList) this.prepare(ch);
    for (const ch of this.channelList) {
      const segs = ch.segs;
      // the last segment whose start is not after t
      let lo = 0, hi = segs.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid]!.start <= t + TINY) lo = mid + 1; else hi = mid; }
      let k = lo - 1;
      // a repeating tween is not yet on at the exact moment it starts (GSAP shows what was there before)
      while (k >= 0 && segs[k]!.repeat > 0 && t - segs[k]!.start <= TINY) k--;
      const seg = k >= 0 ? segs[k]! : null;
      if (!seg) { ch.acc.set(settle(ch.acc, ch.pre)); continue; }
      const v = mix(seg, ratioAt(seg, t), over);
      ch.acc.set(v);
      if (seg.onUpdate && v !== seg.lastReported) { seg.lastReported = v; seg.onUpdate(); }
    }
    for (const c of this.children) {
      const local = Math.min(Math.max(t - c.start, 0), c.child.duration());
      if (local !== c.last) { c.last = local; c.child.time(local); }
    }
  }
}

function endValue(s: Segment): number {
  if (s.dur === 0 && s.repeat === 0) return s.to;
  return s.yoyo && s.repeat % 2 === 1 ? s.from! : s.to;
}

/** The value a key gives, in the unit of the property; `rel` for `'+=36'`. */
function read(value: unknown, acc: Accessor): { rel: boolean; n: number } | null {
  if (acc.kind === 'color') {
    const c = parseColor(value);
    return c === null ? null : { rel: false, n: c };
  }
  const r = parseRel(value);
  return r ? { rel: r.rel, n: r.n * acc.unit } : null;
}

/** A start value as GSAP shows it before the tween begins: rendered at ratio 0, so rounded like the rest of the tween. */
function settle(acc: Accessor, v: number): number {
  return acc.kind === 'color' ? v : Math.round(v * acc.round) / acc.round;
}

/** Set by `ratioAt`: the tween is over (the exact end value is written), not merely at or past the end of its curve. */
let over = false;

function mix(s: Segment, r: number, ended: boolean): number {
  if (s.channel.acc.kind === 'color') return ended ? endValue(s) : lerpColor(s.from!, s.to, r);
  const acc = s.channel.acc;
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
