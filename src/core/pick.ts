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
  three?: {
    object: unknown; point: [number, number, number]; distance: number; object3d?: unknown;
    /**
     * Drag what the ray met: `grab(plane)` fixes a plane through the hit point (`'screen'` facing the camera, the default; `'floor'`; `'wall'`; or a normal `[x, y, z]`), and `move(x, y)` takes the pointer
     * in canvas pixels and gives where its ray meets that plane (`point`) and how far that is from the hit point (`delta`): move the object by it. null where the ray never meets the plane.
     */
    grab?: (plane?: 'screen' | 'floor' | 'wall' | [number, number, number]) => { move: (x: number, y: number) => { point: [number, number, number]; delta: [number, number, number] } | null };
  };
}

/** How opaque a picture's resource (an image, a canvas, a video frame) is at a pixel of its own, 0..1, or null when it cannot be read (a picture from another origin). */
export type AlphaReader = (resource: unknown, x: number, y: number) => number | null;

let scratch: CanvasRenderingContext2D | null | undefined;
/** The layers whose picture could not be read, said once each. */
const saidBlind = new Set<string>();
/** A drawn picture and where a layer's own pixels are in it: what `{ alpha }` reads. */
export interface PictureOf { frame: { x: number; y: number; width: number; height: number }; source?: { resolution?: number; resource?: unknown } }

/** The browser's reader: draw the one pixel into a 1 x 1 canvas and look at its alpha. */
const readResourceAlpha: AlphaReader = (resource, x, y) => {
  try {
    if (scratch === undefined) {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      scratch = c.getContext('2d', { willReadFrequently: true });
    }
    if (!scratch) return null;
    scratch.clearRect(0, 0, 1, 1);
    scratch.drawImage(resource as CanvasImageSource, x, y, 1, 1, 0, 0, 1, 1);
    return scratch.getImageData(0, 0, 1, 1).data[3]! / 255;
  } catch { return null; }                                              // a picture from another origin taints the canvas: it cannot be read
};

export interface PickOptions {
  /**
   * Look at the picture, not the box: a pixel of an image, a video, a `canvas` layer or the letters of a text layer whose alpha is at or below this (0..1; `0.1` leaves out what is nearly clear) is not a hit.
   * Off by default (the box is the picture, and nothing is read). Shapes are always hit by their outline, a `shader` layer by its box (and text by its box too unless `alpha` is given); a picture that cannot be read (from another origin) stays a hit.
   */
  alpha?: number;
  /** Only these layers can be hit (by `name` or by `path`; a group's name stands for everything in it). */
  only?: string[];
  /** These layers cannot be hit (by `name` or by `path`; a group's name stands for everything in it). */
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
export function pickScene(root: CompositionSequence, x: number, y: number, opts: PickOptions = {}, deps: { readAlpha?: AlphaReader; /** The picture a text layer is drawn from (PixiJS keeps it in a canvas): its glyphs are looked at for `{ alpha }`. */ textureOf?: (display: unknown) => PictureOf | null | undefined } = {}): PickHit[] {
  if (opts.alpha !== undefined && !(opts.alpha >= 0 && opts.alpha <= 1)) throw new Error(`pixi-effects: pick: alpha must be a number from 0 to 1 (a pixel at or below it is not a hit), got ${opts.alpha}`);
  const readAlpha = deps.readAlpha ?? readResourceAlpha;
  const found: Array<{ hit: PickHit; order: Array<[number, number]> }> = [];
  // an entry names a layer (its name or its whole path) or a group: everything inside a nested composition of that name or path
  const names = (list: string[], name: string | undefined, path: string): boolean => list.some((e) => e === path || (name !== undefined && e === name) || path.startsWith(e + '/') || path.split('/').slice(0, -1).includes(e));
  const wanted = (name: string | undefined, path: string): boolean => {
    if (opts.ignore && names(opts.ignore, name, path)) return false;
    if (opts.only && !names(opts.only, name, path)) return false;
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
          if (three) {
            const planeOf = (seq as unknown as { dragPlane?: (p: [number, number, number], plane?: unknown) => (u: number, v: number) => { point: [number, number, number]; delta: [number, number, number] } | null }).dragPlane;
            if (planeOf) {
              three.grab = (plane = 'screen') => {
                const along = planeOf.call(seq, three.point, plane);
                return { move: (cx: number, cy: number) => { const lp = d.toLocal({ x: cx, y: cy }); const b = d.getLocalBounds(); return along((lp.x - b.x) / b.width, (lp.y - b.y) / b.height); } };
              };
            }
            hit = { name, path, type: seq.spec.type, kind: 'three', point, three };
          }
          else if (three === undefined && (typeof d.containsPoint !== 'function' || d.containsPoint(local))) {
            let opaque = true;
            // a shader layer's picture lives in a WebGL canvas whose drawing buffer is not kept: reading it back would call a lit pixel clear, so its box stays its picture
            const tex: PictureOf | null | undefined = opts.alpha !== undefined && seq.spec.type !== 'shader' ? ((d as unknown as { texture?: PictureOf }).texture ?? deps.textureOf?.(d)) : undefined;
            if (tex?.source?.resource) {
              const res = tex.source.resolution ?? 1;
              const a = readAlpha(tex.source.resource, (tex.frame.x + ((local.x - lb.x) / lb.width) * tex.frame.width) * res, (tex.frame.y + ((local.y - lb.y) / lb.height) * tex.frame.height) * res);
              if (a === null) {
                if (!saidBlind.has(path)) { saidBlind.add(path); console.warn(`pixi-effects: pick: the picture of layer "${path}" cannot be read for { alpha } (a picture from another origin: load it with crossorigin="anonymous" or from the same site), so the box counts as the picture`); }
              } else opaque = a > opts.alpha!;
            }
            if (opaque) hit = { name, path, type: seq.spec.type, kind: 'flat', point, local: { x: local.x - lb.x, y: local.y - lb.y } };
          }
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
