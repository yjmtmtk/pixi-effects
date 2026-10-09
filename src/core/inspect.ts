import type { Container } from 'pixi.js';
import type { Sequence } from '../sequences/Base';
import { CompositionSequence } from '../sequences/Composition';
import { collectPropKeys } from '../space/specKeys';
import { transitionWindowsOf } from './Transitions';

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

  const walk = (comp: CompositionSequence, prefix: string, insideThreeD: boolean, parentVisible: boolean, parentScene?: string, parentMoving = false, parentZero = false): void => {
    const blending = new Set<string>();
    const now = comp.childTime(time);                                   // the time its children live in (local when it is remapped)
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
      const keys = collectPropKeys(seq.spec);
      // moved by its own keyframes, or carried along by a parent that is (a panned timeline)
      const carried = carriers.some(c => { const k = collectPropKeys(c.spec); return (c.spec.keyframes ?? []).length > 0 && (k.has('x') || k.has('y') || k.has('rotation') || k.has('scale')); });
      const moving = parentMoving || carried || ((seq.spec.keyframes ?? []).length > 0 && (keys.has('x') || keys.has('y')));
      const zeroScale = (o: unknown): boolean => { const s = (o as { scale?: { x: number; y: number } } | null)?.scale; return !!s && (s.x === 0 || s.y === 0); };
      const zero = parentZero || zeroScale(t) || carriers.some(c => zeroScale(c.target));
      const info: LayerInfo = { path: prefix + label, name, type: seq.spec.type, threeD, visible, alpha, moving, bounds, onCanvas };
      if (threeD) info.depthBlur = Number(depthBlur.toFixed(2));
      if (threeD && light !== undefined) info.light = Number(light.toFixed(2));
      layers.push(info);
      let shown = bounds ? clip(bounds, view) : null;
      const maskTarget = seq.maskSequence?.target as Container | null | undefined;
      if (shown && maskTarget && !(seq.spec as { maskInverted?: boolean }).maskInverted) {
        const m = maskTarget.getBounds();
        shown = clip(shown, { x: m.x, y: m.y, width: m.width, height: m.height });
      }
      seen.set(info, shown);
      const group = parentScene ?? (name !== undefined && blending.has(name) ? name : undefined);
      if (group) scene.set(info, group);
      if (zero || (seq as { showsNothingYet?: boolean }).showsNothingYet) scaledToNothing.add(info);
      if (seq instanceof CompositionSequence) walk(seq, prefix + label + '/', insideThreeD || threeD, visible, group, moving, zero);
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
  const mode = opts.layers ?? 'all';
  const listed = mode === 'none' ? [] : mode === 'visible' ? layers.filter(l => l.visible) : layers;
  return { frame, time, canvas, summary: { layers: layers.length, visible: layers.filter(l => l.visible).length }, issues, layers: listed };
}
