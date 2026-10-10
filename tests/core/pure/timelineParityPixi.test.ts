import { describe, it, expect } from 'vitest';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import * as PIXI from 'pixi.js';
import { PureTimeline, spacer } from '../../../src/core/pure/PureTimeline';

gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

/**
 * The Pixi plugin's shorthands (`scale`, `anchor`, `rotation` in degrees, `tint`, `autoAlpha` ...) and child timelines, again
 * against GSAP on objects shaped like display objects: random keyframes built through the same call shapes as `applyKeyframes`.
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const mkObj = () => ({ x: 0, y: 0, alpha: 1, rotation: 0, visible: true, tint: 0xffffff, scale: { x: 1, y: 1 }, anchor: { x: 0, y: 0 }, pivot: { x: 0, y: 0 }, skew: { x: 0, y: 0 } });
type Obj = ReturnType<typeof mkObj>;
const snap = (o: Obj): number[] => [o.x, o.y, o.alpha, o.rotation, +o.visible, o.tint, o.scale.x, o.scale.y, o.anchor.x, o.anchor.y, o.pivot.x, o.pivot.y, o.skew.x, o.skew.y];
const NAMES = ['x', 'y', 'alpha', 'rotation', 'visible', 'tint', 'scale.x', 'scale.y', 'anchor.x', 'anchor.y', 'pivot.x', 'pivot.y', 'skew.x', 'skew.y'];

const SHORT: { key: string; make: (r: () => number) => unknown }[] = [
  { key: 'scale', make: r => +(0.2 + r() * 3).toFixed(2) },
  { key: 'scaleX', make: r => +(0.2 + r() * 3).toFixed(2) },
  { key: 'scaleY', make: r => +(0.2 + r() * 3).toFixed(2) },
  { key: 'rotation', make: r => Math.round(r() * 360 - 180) },
  { key: 'skewX', make: r => Math.round(r() * 60 - 30) },
  { key: 'skewY', make: r => Math.round(r() * 60 - 30) },
  { key: 'anchor', make: r => +r().toFixed(2) },
  { key: 'anchorX', make: r => +r().toFixed(2) },
  { key: 'pivot', make: r => Math.round(r() * 100) },
  { key: 'pivotY', make: r => Math.round(r() * 100) },
  { key: 'tint', make: r => (r() < 0.5 ? Math.floor(r() * 0xffffff) : '#' + Math.floor(r() * 0xffffff).toString(16).padStart(6, '0')) },
  { key: 'autoAlpha', make: r => (r() < 0.3 ? 0 : +r().toFixed(2)) },
];
const EASES = ['none', 'power2.out', 'sine.inOut', 'back.out', 'steps(3)'];

interface Op { kind: 'set' | 'to' | 'from' | 'fromTo'; short: boolean; key: string; a: unknown; b: unknown; at: number; dur: number; ease: string; layer: number }

function script(seed: number, kinds: Op['kind'][]): { ops: Op[]; total: number } {
  const r = rng(seed);
  const ops: Op[] = [];
  const cursor = new Map<string, number>();
  const n = 3 + Math.floor(r() * 6);
  for (let k = 0; k < n; k++) {
    const kind = kinds[Math.floor(r() * kinds.length)]!;
    const short = r() < 0.8;
    const sh = SHORT[Math.floor(r() * SHORT.length)]!;
    const key = short ? sh.key : (['x', 'y', 'alpha'] as const)[Math.floor(r() * 3)]!;
    const make = short ? sh.make : (rr: () => number) => Math.round(rr() * 200 - 100) / (key === 'alpha' ? 100 : 1);
    const dur = kind === 'set' ? 0 : (1 + Math.floor(r() * 30)) / 30;
    const gate = key.replace(/[XY]$/, '').replace(/^autoAlpha$/, 'alpha');
    // two keys can meet in one channel (scale / scaleX): keep the segments of one family in sequence
    const free = cursor.get(gate) ?? 0;
    const at = free + (1 + Math.floor(r() * 12)) / 30;
    cursor.set(gate, at + dur);
    ops.push({ kind, short, key, a: make(r), b: make(r), at, dur, ease: EASES[Math.floor(r() * EASES.length)]!, layer: 0 });
  }
  return { ops, total: Math.max(...ops.map(o => o.at + o.dur)) + 1 };
}

type Tl = { set: Function; to: Function; from: Function; fromTo: Function; add: Function; progress: Function; time: Function };
function build(tl: Tl, o: Obj, ops: Op[], total: number, mkSpacer: (d: number) => unknown): void {
  for (const op of ops) {
    const wrap = (v: unknown) => (op.short ? { pixi: { [op.key]: v } } : { [op.key]: v });
    const tween = { duration: op.dur, ease: op.ease };
    if (op.kind === 'set') tl.set(o, wrap(op.b), op.at);
    else if (op.kind === 'to') tl.to(o, { ...wrap(op.b), ...tween }, op.at);
    else if (op.kind === 'from') tl.from(o, { ...wrap(op.a), ...tween }, op.at);
    else tl.fromTo(o, wrap(op.a), { ...wrap(op.b), ...tween }, op.at);
  }
  tl.add(mkSpacer(total), 0);
  tl.progress(1).progress(0);
}

function compare(seed: number, kinds: Op['kind'][], nested: boolean): string[] {
  const s = script(seed, kinds);
  const gO = mkObj(), pO = mkObj();
  const g = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  const p = new PureTimeline({ paused: true, defaults: { ease: 'none' } });
  if (nested) {
    // the ops live in a child timeline that starts later; the parent only plays it
    const gc = gsap.timeline({ defaults: { ease: 'none' } });
    const pc = new PureTimeline({ defaults: { ease: 'none' } });
    build(gc as unknown as Tl, gO, s.ops, s.total, d => gsap.to({}, { duration: d }));
    build(pc as unknown as Tl, pO, s.ops, s.total, d => spacer(d));
    g.add(gc, 0.5); p.add(pc, 0.5);
    g.add(gsap.to({}, { duration: s.total + 1 }), 0); p.add(spacer(s.total + 1), 0);
    g.progress(1).progress(0);
  } else {
    build(g as unknown as Tl, gO, s.ops, s.total, d => gsap.to({}, { duration: d }));
    build(p as unknown as Tl, pO, s.ops, s.total, d => spacer(d));
  }
  const r = rng(seed ^ 0xabcdef);
  const end = s.total + (nested ? 1.5 : 0);
  const times = Array.from({ length: 50 }, () => Math.floor(r() * (end * 30 + 1)) / 30).sort((a, b) => a - b);
  const bad: string[] = [];
  for (const t of times) {
    g.time(t); p.time(t);
    const a = snap(gO), b = snap(pO);
    for (let i = 0; i < a.length; i++) {
      const tol = NAMES[i] === 'tint' || NAMES[i] === 'visible' ? 0 : 3e-6;
      if (!(Math.abs(a[i]! - b[i]!) <= tol)) { bad.push(`seed ${seed} t=${t.toFixed(4)} ${NAMES[i]}: gsap ${a[i]} vs pure ${b[i]}\n` + s.ops.map(o => `${o.kind}@${o.at.toFixed(3)}+${o.dur.toFixed(3)} ${o.short ? 'pixi.' : ''}${o.key} ${JSON.stringify(o.a)}->${JSON.stringify(o.b)} ${o.ease}`).join('\n')); return bad; }
    }
  }
  g.kill();
  return bad;
}

function sweep(name: string, kinds: Op['kind'][], nested = false, n = 200) {
  it(name, () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= n; seed++) { const bad = compare(seed, kinds, nested); if (bad.length) failures.push(bad[0]!); }
    expect(failures.length, failures.slice(0, 2).join('\n---\n')).toBe(0);
  });
}

describe('PureTimeline equals gsap.timeline with the Pixi plugin shorthands', () => {
  sweep('to', ['to']);
  sweep('set and to', ['set', 'to']);
  sweep('from and fromTo come first on their property', ['to', 'fromTo']);
  sweep('inside a child timeline that starts later', ['set', 'to', 'fromTo'], true);
});
