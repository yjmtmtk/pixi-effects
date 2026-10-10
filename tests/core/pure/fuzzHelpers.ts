import { gsap } from 'gsap';
import { PureTimeline, spacer } from '../../../src/core/pure/PureTimeline';

/**
 * Differential test: the same random keyframe script is built with `gsap.timeline` and with `PureTimeline` on
 * separate plain objects, and both are read at the same times in the same order. GSAP is the oracle.
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export type Kind = 'set' | 'to' | 'from' | 'fromTo';
interface Op {
  kind: Kind; obj: number; props: string[]; a: number[]; b: number[]; rel: boolean;
  at: number; dur: number; ease: string; repeat: number; yoyo: boolean; repeatDelay: number;
}
interface Script { init: Record<string, number>[]; ops: Op[]; total: number }

const EASES = ['none', 'power1.out', 'power2.in', 'power3.inOut', 'sine.inOut', 'back.out', 'elastic.out', 'bounce.out', 'expo.inOut', 'steps(4)', 'circ.in'];
const PROPS = ['x', 'y'];

export function makeScript(seed: number, opts: { overlap: boolean; ascending?: boolean; loops: boolean; kinds: Kind[]; rel: boolean; eases?: string[] }): Script {
  const r = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const frame = (n: number) => n / 30;
  const nobj = 2;
  const init = Array.from({ length: nobj }, () => ({ x: Math.round(r() * 200 - 100), y: Math.round(r() * 200 - 100) }));
  const ops: Op[] = [];
  const cursor: number[] = [];
  const touched = new Set<number>();   // per (obj, prop): where the next non-overlapping segment may start
  const n = 3 + Math.floor(r() * 7);
  for (let k = 0; k < n; k++) {
    const obj = Math.floor(r() * nobj);
    const props = r() < 0.3 ? [...PROPS] : [pick(PROPS)];
    let kind = pick(opts.kinds);
    // A `from` that has a segment before it on the same property ends where GSAP happens to have left the property (after another
    // `from` it is that one's start value, after a `set` it is the value before the set): pure ends it where the segment before it ended.
    if (kind === 'from' && props.some(pr => touched.has(obj * 2 + PROPS.indexOf(pr)))) kind = 'to';
    for (const pr of props) touched.add(obj * 2 + PROPS.indexOf(pr));
    const dur = kind === 'set' ? 0 : frame(1 + Math.floor(r() * 45));   // a zero-length fromTo / from is `set` by another name; GSAP does not treat it like one
    const repeat = opts.loops && kind !== 'set' && r() < 0.5 ? 1 + Math.floor(r() * 3) : 0;
    const yoyo = repeat > 0 && r() < 0.6;
    const repeatDelay = repeat > 0 && r() < 0.4 ? frame(1 + Math.floor(r() * 10)) : 0;
    const span = dur * (repeat + 1) + repeatDelay * repeat;
    let at: number;
    if (opts.overlap) at = frame(Math.floor(r() * 150));
    else {
      const ci = props.map(p => obj * 2 + PROPS.indexOf(p));
      const free = Math.max(...ci.map(i => cursor[i] ?? 0));
      const touch = opts.ascending && span > 0;   // a `set` right where a tween ends is lost by GSAP when the tween's end rounds up past it (it writes its end value over the set at the next frame): pure is right there, so it is not compared
      at = free + (touch ? (r() < 0.4 ? 0 : frame(Math.floor(r() * 20))) : frame(1 + Math.floor(r() * 20)));   // GSAP answers an exact hand-over between two tweens by the direction it came from, so any order needs a gap
      for (const i of ci) cursor[i] = at + span + (span === 0 ? 1 / 30 : 0);   // two items with the same start on one property are history-dependent in GSAP
    }
    const rel = opts.rel && kind !== 'set' && kind !== 'fromTo' && r() < 0.3;
    ops.push({
      kind, obj, props, rel,
      a: props.map(() => Math.round(r() * 200 - 100)),
      b: props.map(() => Math.round(r() * 200 - 100)),
      at, dur, ease: pick(opts.eases ?? EASES), repeat, yoyo, repeatDelay,
    });
  }
  const total = Math.max(...ops.map(o => o.at + o.dur * (o.repeat + 1) + o.repeatDelay * o.repeat), 1) + 1;
  return { init, ops, total };
}

type AnyTl = { set: Function; to: Function; from: Function; fromTo: Function; add: Function; time: Function; progress: Function };

function build(tl: AnyTl, objs: Record<string, number>[], s: Script, mkSpacer: (d: number) => unknown): void {
  for (const o of s.ops) {
    const vars = (vals: number[]) => Object.fromEntries(o.props.map((p, i) => [p, o.rel ? `${vals[i]! < 0 ? '-=' : '+='}${Math.abs(vals[i]!)}` : vals[i]]));
    const tween = { duration: o.dur, ease: o.ease, ...(o.repeat ? { repeat: o.repeat, yoyo: o.yoyo, repeatDelay: o.repeatDelay } : {}) };
    const target = objs[o.obj]!;
    if (o.kind === 'set') tl.set(target, vars(o.b), o.at);
    else if (o.kind === 'to') tl.to(target, { ...vars(o.b), ...tween }, o.at);
    else if (o.kind === 'from') tl.from(target, { ...vars(o.a), ...tween }, o.at);
    else tl.fromTo(target, vars(o.a), { ...vars(o.b), ...tween }, o.at);
  }
  tl.add(mkSpacer(s.total), 0);
  tl.progress(1).progress(0);
}

function times(r: () => number, total: number): number[] {
  const out: number[] = [];
  const grid = (n: number) => Math.min(total, Math.max(0, n / 30));
  for (let i = 0; i < 40; i++) {
    const k = r();
    out.push(k < 0.6 ? grid(Math.floor(r() * (total * 30 + 1))) : k < 0.8 ? r() * total : k < 0.9 ? 0 : total);
  }
  // each time also read twice in a row, once from each direction
  const seq: number[] = [];
  for (const t of out) { seq.push(t); if (r() < 0.2) seq.push(t); }
  return seq;
}

/**
 * GSAP keeps start times and durations to seven decimals and decides a hand-over between two tweens by float noise at that
 * scale (a tween that "ends" 3e-8 after its successor starts, a cycle boundary 3e-8 off): a time that is not exactly on a
 * boundary but within 3e-7 of one is not compared. Exactly on one (the common case: frame times are multiples of 1/30) is.
 */
function nearBoundary(s: Script, obj: number, prop: string, t: number): boolean {
  for (const o of s.ops) {
    if (o.obj !== obj || !o.props.includes(prop)) continue;
    const period = o.dur + o.repeatDelay;
    const bounds = [o.at, o.at + o.dur * (o.repeat + 1) + o.repeatDelay * o.repeat];
    for (let k = 1; k <= o.repeat; k++) bounds.push(o.at + k * period, o.at + k * period - o.repeatDelay);
    // GSAP's own period is the rounded duration plus the raw pause
    const gp = Math.round(o.dur * 1e7) / 1e7 + o.repeatDelay;
    for (let k = 1; k <= o.repeat; k++) bounds.push(Math.round(o.at * 1e7) / 1e7 + k * gp, Math.round(o.at * 1e7) / 1e7 + k * gp - o.repeatDelay);
    for (const b of bounds) for (const c of [b, Math.round(b * 1e7) / 1e7]) { const d = Math.abs(t - c); if (d > 1e-12 && d < 3e-7) return true; }
  }
  return false;
}

export function run(seed: number, opts: Parameters<typeof makeScript>[1], verbose = false): string[] {
  const s = makeScript(seed, opts);
  const gObjs = s.init.map(o => ({ ...o }));
  const pObjs = s.init.map(o => ({ ...o }));
  const g = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  const p = new PureTimeline({ paused: true, defaults: { ease: 'none' } });
  build(g as unknown as AnyTl, gObjs, s, d => gsap.to({}, { duration: d }));
  build(p as unknown as AnyTl, pObjs, s, d => spacer(d));
  const r = rng(seed ^ 0x9e3779b9);
  const bad: string[] = [];
  const seq = times(r, s.total);
  if (opts.ascending) seq.sort((a, b) => a - b);
  for (const t of seq) {
    g.time(t); p.time(t);
    if (verbose) console.log(t.toFixed(7), 'gsap', gObjs.map(o => `${o.x},${o.y}`).join(' '), 'pure', pObjs.map(o => `${o.x},${o.y}`).join(' '));
    for (let i = 0; i < gObjs.length; i++) for (const k of PROPS) {
      const a = gObjs[i]![k]!, b = pObjs[i]![k]!;
      if (nearBoundary(s, i, k, t)) continue;
      if (!(Math.abs(a - b) < 3e-6)) {   // GSAP writes numbers rounded to six decimals, from times rounded to seven: its last digit can differ
        bad.push(`seed ${seed} t=${t.toFixed(4)} obj${i}.${k}: gsap ${a} vs pure ${b}`);
        const mine = s.ops.filter(o => o.obj === i && o.props.includes(k));
        bad.push(`init ${s.init[i]![k]}; ` + mine.map(o => {
          const j = o.props.indexOf(k);
          const loop = o.repeat ? ` x${o.repeat + 1}${o.yoyo ? 'yoyo' : ''}${o.repeatDelay ? ` rd${o.repeatDelay.toFixed(3)}` : ''}` : '';
          return `${o.kind}${o.rel ? '(rel)' : ''}@${o.at.toFixed(3)}+${o.dur.toFixed(3)} ${o.ease} ${o.kind === 'from' ? o.a[j] : o.kind === 'fromTo' ? `${o.a[j]}->${o.b[j]}` : o.b[j]}${loop}`;
        }).join(' | '));
        bad.push('gsap children: ' + (g.getChildren(false, true, false) as any[]).filter(c => c.targets && c.targets()[0] === gObjs[i]).map(c => `${c.startTime()}+${c.duration()}`).join(' '));
        break;
      }
    }
    if (bad.length) break;
  }
  g.kill();
  return bad;
}

