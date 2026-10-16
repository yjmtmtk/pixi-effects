/**
 * `movie.pick(x, y)`: what is under a point of the canvas, at the frame that is on screen. The layers are asked in the way each is drawn: a flat layer by its own shape (a rotated one by its
 * rotated rectangle, a round one by its circle), a `threeD` card by its projected quad, a `three` layer by a ray through its camera. No clock: it reads the display tree as the last render left it.
 */
import type { Container } from 'pixi.js';
import type { Sequence } from '../sequences/Base';
import { CompositionSequence } from '../sequences/Composition';
import { maskSourceOf } from './matte';

export interface PickHit {
  /** The layer's `name` (when it has one). */
  name?: string;
  /** Names (or `type#index`) from the root, joined by `/`: the same as `movie.inspect()`'s `path`. */
  path: string;
  type: string;
  /** `'flat'`: a 2D layer; `'card'`: a `threeD` layer (its projected card); `'three'`: a `three` layer, and `three` says what the ray met. */
  kind: 'flat' | 'card' | 'three';
  /** The point asked about, in canvas pixels. */
  point: { x: number; y: number };
  /** A flat layer: the point in the layer's own pixels (the top-left of its picture is 0, 0). */
  local?: { x: number; y: number };
  /** A `three` layer: what the ray through that point met first: the object (its name, or `''`), where (three's own units), and how far from the camera. */
  three?: { object: unknown; point: [number, number, number]; distance: number; object3d?: unknown };
}

export interface PickOptions {
  /** Only these layers can be hit (by `name` or by `path`). */
  only?: string[];
  /** These layers cannot be hit (by `name` or by `path`). */
  ignore?: string[];
}

/** Is the point inside the quad given as 8 numbers (x0, y0 … x3, y3), whichever way round its corners go? */
export function pointInQuad(q: readonly number[], x: number, y: number): boolean {
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const ax = q[i * 2]!, ay = q[i * 2 + 1]!, bx = q[((i + 1) % 4) * 2]!, by = q[((i + 1) % 4) * 2 + 1]!;
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross > 0) pos++; else if (cross < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

type Display = Container & { toLocal(p: { x: number; y: number }): { x: number; y: number }; containsPoint?: (p: { x: number; y: number }) => boolean };

/** Where a display object is in the display tree, from the stage down: (zIndex, index) per level. What is drawn later is on top. */
function orderOf(node: unknown): Array<[number, number]> {
  const key: Array<[number, number]> = [];
  for (let n = node as { parent?: { children?: unknown[] } | null; zIndex?: number } | null; n && n.parent; n = n.parent as typeof n) {
    key.unshift([n!.zIndex ?? 0, Math.max(0, n!.parent!.children?.indexOf(n) ?? 0)]);
  }
  return key;
}
const above = (a: Array<[number, number]>, b: Array<[number, number]>): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]![0] !== b[i]![0]) return b[i]![0] - a[i]![0];
    if (a[i]![1] !== b[i]![1]) return b[i]![1] - a[i]![1];
  }
  return b.length - a.length;
};

/** Every layer under the canvas point (x, y), the one on top first. */
export function pickScene(root: CompositionSequence, x: number, y: number, opts: PickOptions = {}): PickHit[] {
  const found: Array<{ hit: PickHit; order: Array<[number, number]> }> = [];
  const wanted = (name: string | undefined, path: string): boolean => {
    if (opts.ignore && (opts.ignore.includes(path) || (name !== undefined && opts.ignore.includes(name)))) return false;
    if (opts.only && !(opts.only.includes(path) || (name !== undefined && opts.only.includes(name)))) return false;
    return true;
  };
  const inside = (b: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

  const walk = (comp: CompositionSequence, prefix: string, parentVisible: boolean): void => {
    comp.layers().forEach(({ seq, display, threeD, carriers, quad }, i) => {
      const d = display as unknown as Display | null;
      if (!d) return;                                                     // a layer with no picture (a sound)
      const t = seq.target as (Container & { renderable: boolean; alpha: number }) | null;
      const name = seq.spec.name;
      const path = prefix + (name ?? `${seq.spec.type}#${i}`);
      const alpha = (t?.alpha ?? 1) * carriers.reduce((a, c) => a * ((c.target as { alpha?: number } | null)?.alpha ?? 1), 1);
      const alive = (threeD ? d.visible : (t?.renderable ?? true)) && carriers.every((c) => c.target?.renderable ?? true);
      const visible = parentVisible && alive && alpha > 0;
      if (!visible) return;
      const isComposition = seq instanceof CompositionSequence;
      if (isComposition && !threeD) { walk(seq as CompositionSequence, path + '/', visible); return; }   // a group is not a target: what is in it is
      if (!wanted(name, path)) return;
      const point = { x, y };
      let hit: PickHit | null = null;
      if (threeD) {
        if (quad && pointInQuad(quad, d.toLocal(point).x, d.toLocal(point).y)) hit = { name, path, type: seq.spec.type, kind: 'card', point };
      } else {
        const local = d.toLocal(point);
        const lb = d.getLocalBounds();
        if (inside(lb, local)) {
          const three = typeof (seq as unknown as { pickAt?: unknown }).pickAt === 'function'
            ? (seq as unknown as { pickAt(u: number, v: number): PickHit['three'] | null }).pickAt((local.x - lb.x) / lb.width, (local.y - lb.y) / lb.height) : undefined;
          if (three) hit = { name, path, type: seq.spec.type, kind: 'three', point, three };
          else if (three === undefined && (typeof d.containsPoint !== 'function' || d.containsPoint(local))) hit = { name, path, type: seq.spec.type, kind: 'flat', point, local: { x: local.x - lb.x, y: local.y - lb.y } };
        }
      }
      if (!hit) return;
      // a mask cuts the layer: what is outside it is not under the point (an inverted mask cuts a hole, which is not looked at here)
      const maskTarget = seq.maskSequence?.target as Container | null | undefined;
      const maskSrc = maskSourceOf((seq.spec as { mask?: unknown }).mask);
      if (maskTarget && !(maskSrc.kind === 'inline' && maskSrc.invert) && !inside(maskTarget.getBounds(), point)) return;
      found.push({ hit, order: orderOf(d) });
    });
  };
  walk(root, '', true);
  return found.sort((a, b) => above(a.order, b.order)).map((f) => f.hit);
}

export type { Sequence };
