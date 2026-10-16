import type { Container } from 'pixi.js';
import type { Sequence } from '../sequences/Base';
import { CompositionSequence } from '../sequences/Composition';
import type { Keyframe } from '../types';
import { parseSpring, springDuration } from './spring';
import { transitionWindowsOf } from './Transitions';
import { maskSourceOf } from './matte';

export interface Rect { x: number; y: number; width: number; height: number }

export interface LayerInfo {
  /** Names (or `type#index`) from the root, joined by `/`. */
  path: string;
  name?: string;
  type: string;
  threeD: boolean;
  /** Alive at this frame, not hidden by an ancestor, and alpha > 0. */
  visible: boolean;
  alpha: number;
  /** Its `x` or `y` is animated: text that moves across the canvas on purpose (a ticker) is not reported as cut off. */
  moving: boolean;
  /** Where it is drawn, in canvas pixels. `null` inside a `threeD` layer (it is rendered into that layer's texture). */
  bounds: Rect | null;
  onCanvas: 'full' | 'partial' | 'none' | null;
  /** Depth of field (threeD layers only): the blur radius in canvas pixels this frame, from the layer's depth and the camera's focus; 0 = sharp. */
  depthBlur?: number;
  /** Light (threeD layers that receive lights): how lit the layer is this frame, 0..1+ (the brightness of the light falling on its middle; 1 = as with no light, 0 = black). Left out when there is no light. */
  light?: number;
  /** A `three` layer: the renderer it draws with (`'webgl'` / `'webgpu'`) and the backend under it (`'webgl2'`: three's WebGPURenderer found no WebGPU and used its own WebGL2 backend: the same picture). */
  renderer?: 'webgl' | 'webgpu';
  backend?: 'webgl' | 'webgpu' | 'webgl2';
  /** A `three` layer with `renderer: 'webgpu'`: true when it draws on PixiJS's own GPU device (no canvas of its own); false when it has a canvas of its own (`shareGpu: false`, or PixiJS is on WebGL). */
  sharedGpu?: boolean;
}

export interface InspectReport {
  frame: number;
  time: number;
  canvas: { width: number; height: number };
  /** Layer counts (of the whole tree) — present even when `layers` is filtered out. */
  summary: { layers: number; visible: number };
  /** Human-readable problems worth a look: text off-canvas / cut off / empty / overlapping text. Read this first. */
  issues: string[];
  layers: LayerInfo[];
}

export interface InspectOptions {
  /** Which layers to list: every layer, only those drawn at this frame, or none (just `issues` + `summary`). Default `'all'`. */
  layers?: 'all' | 'visible' | 'none';
}

/** The child indices from the stage down to `node` (null when the tree cannot be read): what is drawn later is drawn over. */
function chainOf(node: unknown): number[] | null {
  const chain: number[] = [];
  for (let n = node as { parent?: { children?: unknown[] } | null } | null; n && n.parent; n = n.parent as typeof n) {
    const i = n.parent!.children?.indexOf(n);
    if (i === undefined || i < 0) return null;
    chain.unshift(i);
  }
  return chain.length ? chain : null;
}
/** Is the layer with chain `a` drawn after (over) the one with chain `b`? null: cannot tell. */
function drawnAfter(a: number[] | null, b: number[] | null): boolean | null {
  if (!a || !b) return null;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return null;
}

/** Layers below this alpha are ignored by the layout checks. */
const FAINT = 0.3;

const intersection = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const clip = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x, h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
};

/** What a keyframe can move on the canvas: a layer whose own or whose parent's geometry is animated crosses the edge on purpose (a ticker, a zoom-through, a fly-through). */
const GEOMETRY = new Set(['x', 'y', 'z', 'scale', 'scaleX', 'scaleY', 'rotation', 'rotationX', 'rotationY', 'skewX', 'skewY', 'positionX', 'positionY', 'pivotX', 'pivotY', 'anchorX', 'anchorY']);
interface Motion { running: boolean; ever: boolean }
const NO_MOTION: Motion = { running: false, ever: false };
const either = (a: Motion, b: Motion): Motion => ({ running: a.running || b.running, ever: a.ever || b.ever });

/** The keys that put a layer on or off the canvas (an entrance, an exit, a fly-through): a layer waiting off the canvas for one of these tweens is not lost. */
const TRANSLATION = new Set(['x', 'y', 'z', 'positionX', 'positionY']);

/**
 * Is a keyframe of this layer that animates `keys` running at `local` (seconds since the layer started), and does the layer ever have one? A tween runs from its `at` for its
 * `duration` (repeats included; a spring for the time it takes to settle); a `set` is instant, so it is no motion; a fade (alpha only) is no motion.
 * `ever`: a TRANSLATION tween exists at some time. A text that waits outside the canvas for its entrance, or slid out and stays parked there (an exit), is not called
 * "entirely outside"; a layer put off the canvas whose only motion is a scale pop is, and one that stops half cut off is reported.
 */
function motionOf(keyframes: Keyframe[] | undefined, local: number, lives: number, keys: (k: string) => boolean = k => GEOMETRY.has(k)): Motion {
  let running = false, ever = false;
  for (const kf of keyframes ?? []) {
    const names = [kf.set, kf.to, kf.from].flatMap(bag => (bag ? Object.keys(bag) : []));
    if (!names.some(keys)) continue;
    let length = 0;
    if (typeof kf.duration === 'number') length = kf.duration;
    else if (kf.duration === 'auto') { const sp = parseSpring(kf.ease); length = sp ? Math.round(springDuration(sp) * 1000) / 1000 : 0.5; }   // what the timeline does with 'auto'
    if (!(length > 0)) continue;
    const kat = kf.at ?? 0;
    const start = kat < 0 ? lives + kat : kat;
    const repeats = kf.repeat ?? 0;
    const end = start + length * (repeats + 1) + (kf.repeatDelay ?? 0) * repeats;
    if (names.some(k => TRANSLATION.has(k))) ever = true;
    if (local >= start - 1e-6 && local <= end + 1e-6) running = true;
  }
  return { running, ever };
}

/**
 * Describe where every layer is drawn at the CURRENT timeline position, and flag layout problems an AI
 * cannot see without looking: text that is off the canvas or cut by an edge, empty text, and text layers
 * that overlap each other. Call after seeking (Movie.inspect does).
 */
export function inspectScene(
  root: CompositionSequence, frame: number, time: number, canvas: { width: number; height: number }, opts: InspectOptions = {},
): InspectReport {
  const layers: LayerInfo[] = [];
  const view: Rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };

  // What can actually be seen of a layer: its bounds cut to the canvas and to its mask (an inverted mask
  // cuts a hole instead, so it does not clip). Overlaps are judged on this, not on raw bounds.
  const seen = new Map<LayerInfo, Rect | null>();
  // Scenes that a running transition is blending: they overlap and move off the canvas by design.
  const scene = new Map<LayerInfo, string>();
  // Layers whose own or an ancestor's scale is 0, or a typewriter that has not typed yet: no size is expected.
  const scaledToNothing = new Set<LayerInfo>();
  // Layers with a geometry tween at some time: waiting outside the canvas for an entrance, or parked there after an exit, is on purpose.
  const hasMotion = new Set<LayerInfo>();
  // What each layer is (a shape's kind, or its type): only boxes are compared with text for crossings.
  const kinds = new Map<LayerInfo, string>();
  const specs = new Map<LayerInfo, Record<string, unknown>>();
  // Where each layer is in the display tree (child indices from the stage) and its alpha with every group above it: what is drawn over what, and how opaque, is a fact of the tree.
  const chains = new Map<LayerInfo, number[] | null>();
  const chainAlpha = new Map<LayerInfo, number>();

  const walk = (comp: CompositionSequence, prefix: string, insideThreeD: boolean, parentVisible: boolean, parentScene?: string, parentMotion: Motion = NO_MOTION, parentZero = false, parentAlpha = 1): void => {
    const blending = new Set<string>();
    const now = comp.childTime(time);                                   // the time its children live in (local when it is remapped)
    // a camera with a tween running now carries every threeD layer of the composition with it (a pan is not "cut off"); one at rest, or one that only `set`s values, carries nothing
    const cameraMotion = (comp.spec.sequences ?? []).filter(q => q.type === 'camera').reduce((m: Motion, q) =>
      either(m, motionOf(q.keyframes, now - comp.childBase - (q.at ?? 0), q.duration ?? comp.duration ?? Infinity, () => true)), NO_MOTION);
    for (const w of transitionWindowsOf(comp.spec)) {
      const start = comp.childBase + w.start, end = comp.childBase + w.end;
      if (now >= start - 1e-9 && now <= end + 1e-9) { blending.add(w.from); blending.add(w.to); }
    }
    comp.layers().forEach(({ seq, display, threeD, carriers, depthBlur, light }, i) => {
      const t = seq.target as (Container & { renderable: boolean; alpha: number }) | null;
      const name = seq.spec.name;
      const label = name ?? `${seq.spec.type}#${i}`;
      // a null layer that carries this layer hides it, fades it and moves it too
      const alpha = (t?.alpha ?? 1) * carriers.reduce((a, c) => a * ((c.target as { alpha?: number } | null)?.alpha ?? 1), 1);
      const alive = (threeD ? display.visible : (t?.renderable ?? true)) && carriers.every(c => c.target?.renderable ?? true);
      const visible = parentVisible && alive && alpha > 0;
      let bounds: Rect | null = null;
      if (!insideThreeD) {
        const b = display.getBounds();
        bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      }
      let onCanvas: LayerInfo['onCanvas'] = null;
      if (bounds) {
        const inter = intersection(bounds, view);
        const area = bounds.width * bounds.height;
        onCanvas = inter === 0 && area > 0 ? 'none' : inter >= area - 1e-6 ? 'full' : 'partial';
        if (area === 0) onCanvas = 'none';
      }
      // Moving: a geometry keyframe of its own, of a null parent, of the composition that holds it, or a moving camera for a threeD layer, is running at this frame.
      // An x in `initial` plus a fade is a still layer, and a cut-off one must be reported.
      const localOf = (q: Sequence): number => now - comp.childBase - q.at;
      let motion = either(parentMotion, motionOf(seq.spec.keyframes, localOf(seq), seq.duration ?? Infinity));
      for (const c of carriers) motion = either(motion, motionOf(c.spec.keyframes, localOf(c), c.duration ?? Infinity));
      if (threeD) motion = either(motion, cameraMotion);
      const moving = motion.running;
      const zeroScale = (o: unknown): boolean => { const s = (o as { scale?: { x: number; y: number } } | null)?.scale; return !!s && (s.x === 0 || s.y === 0); };
      const zero = parentZero || zeroScale(t) || carriers.some(c => zeroScale(c.target));
      const info: LayerInfo = { path: prefix + label, name, type: seq.spec.type, threeD, visible, alpha, moving, bounds, onCanvas };
      if (threeD) info.depthBlur = Number(depthBlur.toFixed(2));
      if (threeD && light !== undefined) info.light = Number(light.toFixed(2));
      const drawn = seq as unknown as { renderer?: unknown; backend?: unknown; sharedGpu?: unknown };
      if (typeof drawn.renderer === 'string') { info.renderer = drawn.renderer as LayerInfo['renderer']; if (typeof drawn.backend === 'string') info.backend = drawn.backend as LayerInfo['backend']; if (info.renderer === 'webgpu') info.sharedGpu = drawn.sharedGpu === true; }
      layers.push(info);
      chainAlpha.set(info, parentAlpha * alpha);
      chains.set(info, chainOf(display));
      specs.set(info, seq.spec as unknown as Record<string, unknown>);
      kinds.set(info, seq.spec.type === 'shape' ? String((seq.spec as { shape?: string }).shape) : seq.spec.type);
      if (motion.ever) hasMotion.add(info);
      let shown = bounds ? clip(bounds, view) : null;
      const maskTarget = seq.maskSequence?.target as Container | null | undefined;
      const maskSrc = maskSourceOf((seq.spec as { mask?: unknown }).mask);
      if (shown && maskTarget && !(maskSrc.kind === 'inline' && maskSrc.invert)) {
        const m = maskTarget.getBounds();
        shown = clip(shown, { x: m.x, y: m.y, width: m.width, height: m.height });
      }
      seen.set(info, shown);
      const group = parentScene ?? (name !== undefined && blending.has(name) ? name : undefined);
      if (group) scene.set(info, group);
      if (zero || (seq as { showsNothingYet?: boolean }).showsNothingYet) scaledToNothing.add(info);
      if (seq instanceof CompositionSequence) walk(seq, prefix + label + '/', insideThreeD || threeD, visible, group, motion, zero, parentAlpha * alpha);
    });
  };
  walk(root, '', false, true);

  const issues: string[] = [];
  // Faint layers (mid-fade) are not worth flagging.
  const texts = layers.filter(l => l.type === 'text' && l.visible && l.alpha >= FAINT && l.bounds);
  for (const l of texts) {
    const b = l.bounds!;
    const who = `text layer "${l.path}"`;
    if (b.width < 1 || b.height < 1) {
      if (scaledToNothing.has(l)) continue;
      issues.push(`${who} has no size (empty text, or not drawn yet)`);
    } else if (l.moving || scene.has(l)) {
      // on purpose crossing the canvas edge (marquee, slide-in, a slide / zoom transition): not a layout problem
    } else if (l.onCanvas === 'none') {
      if (hasMotion.has(l)) continue;                                    // waiting for an entrance, or parked after an exit
      issues.push(`${who} is entirely outside the canvas (at ${Math.round(b.x)},${Math.round(b.y)}, ${Math.round(b.width)}×${Math.round(b.height)})`);
    } else if (l.onCanvas === 'partial') {
      const over: string[] = [];
      if (b.x < 0) over.push(`${Math.round(-b.x)}px beyond the left edge`);
      if (b.x + b.width > canvas.width) over.push(`${Math.round(b.x + b.width - canvas.width)}px beyond the right edge`);
      if (b.y < 0) over.push(`${Math.round(-b.y)}px beyond the top edge`);
      if (b.y + b.height > canvas.height) over.push(`${Math.round(b.y + b.height - canvas.height)}px beyond the bottom edge`);
      issues.push(`${who} is cut off by the canvas edge: ${over.join(', ')}`);
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = seen.get(texts[i]!), b = seen.get(texts[j]!);
      if (!a || !b) continue;                                            // nothing of one of them is on screen
      const sa = scene.get(texts[i]!), sb = scene.get(texts[j]!);
      if (sa && sb && sa !== sb) continue;                               // the two scenes of a running transition
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (smaller <= 0) continue;
      const share = intersection(a, b) / smaller;
      if (share > 0.25) issues.push(`text layers "${texts[i]!.path}" and "${texts[j]!.path}" overlap by ${Math.round(share * 100)}% of the smaller one`);
    }
  }
  // Pictures that hide or cut through text, judged on boxes, and only the clear cases (most overlaps of a picture with text are on purpose: a shadow, a glow, a ripple, a card
  // behind a word, so a general "this overlaps that" would be noise). (1) An opaque box drawn OVER the text and covering part of it: the text is hidden there. (2) A hairline (a
  // line, or a rule a few pixels thick) drawn OVER the body of the text. Not text-on-card (a box that holds the whole text), not a soft or blended
  // layer, not a stroke-only ring. An "overlap" kind: it goes to the review list, never fails the check.
  const FILLED = new Set(['rect', 'circle', 'ellipse', 'image', 'video']);
  for (const t of texts) {
    const tb = seen.get(t);
    if (!tb) continue;
    const area = tb.width * tb.height;
    if (!(area > 0)) continue;
    for (const o of layers) {
      if (o === t || o.type === 'text' || !o.visible || !o.bounds) continue;
      if (o.path.startsWith(t.path + '/') || t.path.startsWith(o.path + '/')) continue;
      const kind = kinds.get(o) ?? o.type, spec = specs.get(o) ?? {};
      const initial = (spec.initial ?? {}) as Record<string, unknown>;
      const hairline = (kind === 'line' || kind === 'rect') && Math.min(o.bounds.width, o.bounds.height) < 12 && Math.max(o.bounds.width, o.bounds.height) >= 40;
      const soft = (spec.blendMode !== undefined && spec.blendMode !== 'normal') || (Array.isArray(spec.filters) && spec.filters.length > 0);
      const filled = kind === 'image' || kind === 'video' || initial.fillColor !== undefined || spec.fillGradient !== undefined || initial.fillGradient !== undefined;
      if (o.threeD || t.threeD) continue;                                // a threeD layer is sorted by depth: the tree does not say what is over what
      const over = drawnAfter(chains.get(o) ?? null, chains.get(t) ?? null) ?? layers.indexOf(o) > layers.indexOf(t);
      const opacity = chainAlpha.get(o) ?? o.alpha;
      const hides = FILLED.has(kind) && !hairline && filled && !soft && over && opacity >= 0.8;
      const cuts = hairline && !soft && over && opacity >= FAINT;                    // a grid line or a rule BEHIND the text is a design; one drawn over it is not
      if (!hides && !cuts) continue;
      const st = scene.get(t), so = scene.get(o);
      if (st && so && st !== so) continue;                                // the two scenes of a running transition
      const ob = seen.get(o);
      if (!ob) continue;
      const covered = intersection(tb, ob) / area;
      if (cuts) {
        // a hairline counts when it runs through the BODY of the text (the middle 60% across, over at least 30% along): a rule just under or above the box is a rule
        const horizontal = ob.width >= ob.height;
        const mid = horizontal ? ob.y + ob.height / 2 : ob.x + ob.width / 2;
        const lo = horizontal ? tb.y + tb.height * 0.2 : tb.x + tb.width * 0.2, hi = horizontal ? tb.y + tb.height * 0.8 : tb.x + tb.width * 0.8;
        const along = horizontal ? Math.min(ob.x + ob.width, tb.x + tb.width) - Math.max(ob.x, tb.x) : Math.min(ob.y + ob.height, tb.y + tb.height) - Math.max(ob.y, tb.y);
        if (mid < lo || mid > hi || along < 0.3 * (horizontal ? tb.width : tb.height)) continue;
      } else if (covered < 0.1) continue;                                    // (a box over ALL of the text is the worst case, not a backdrop: a backdrop is drawn under it)
      const word = kind === 'image' || kind === 'video' ? kind : 'shape';
      issues.push(`text layer "${t.path}" and ${word} layer "${o.path}" overlap: it covers ${Math.round(covered * 100)}% of the text (drawn ${over ? 'over' : 'under'} it)`);
    }
  }
  const mode = opts.layers ?? 'all';
  const listed = mode === 'none' ? [] : mode === 'visible' ? layers.filter(l => l.visible) : layers;
  return { frame, time, canvas, summary: { layers: layers.length, visible: layers.filter(l => l.visible).length }, issues, layers: listed };
}
