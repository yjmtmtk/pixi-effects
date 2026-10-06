import type { Container } from 'pixi.js';
import type { Sequence } from '../sequences/Base';
import { CompositionSequence } from '../sequences/Composition';

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
  /** Where it is drawn, in canvas pixels. `null` inside a `threeD` layer (it is rendered into that layer's texture). */
  bounds: Rect | null;
  onCanvas: 'full' | 'partial' | 'none' | null;
}

export interface InspectReport {
  frame: number;
  time: number;
  canvas: { width: number; height: number };
  layers: LayerInfo[];
  /** Human-readable problems worth a look: text off-canvas / cut off / empty / overlapping text. */
  issues: string[];
}

const intersection = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * Describe where every layer is drawn at the CURRENT timeline position, and flag layout problems an AI
 * cannot see without looking: text that is off the canvas or cut by an edge, empty text, and text layers
 * that overlap each other. Call after seeking (Movie.inspect does).
 */
export function inspectScene(root: CompositionSequence, frame: number, time: number, canvas: { width: number; height: number }): InspectReport {
  const layers: LayerInfo[] = [];
  const view: Rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };

  const walk = (comp: CompositionSequence, prefix: string, insideThreeD: boolean, parentVisible: boolean): void => {
    comp.layers().forEach(({ seq, display, threeD }, i) => {
      const t = seq.target as (Container & { renderable: boolean; alpha: number }) | null;
      const name = seq.spec.name;
      const label = name ?? `${seq.spec.type}#${i}`;
      const alpha = t?.alpha ?? 1;
      const alive = threeD ? display.visible : (t?.renderable ?? true);
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
      layers.push({ path: prefix + label, name, type: seq.spec.type, threeD, visible, alpha, bounds, onCanvas });
      if (seq instanceof CompositionSequence) walk(seq, prefix + label + '/', insideThreeD || threeD, visible);
    });
  };
  walk(root, '', false, true);

  const issues: string[] = [];
  const texts = layers.filter(l => l.type === 'text' && l.visible && l.bounds);
  for (const l of texts) {
    const b = l.bounds!;
    const who = `text layer "${l.path}"`;
    if (b.width < 1 || b.height < 1) {
      issues.push(`${who} has no size (empty text, or not drawn yet)`);
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
      const a = texts[i]!.bounds!, b = texts[j]!.bounds!;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (smaller <= 0) continue;
      const share = intersection(a, b) / smaller;
      if (share > 0.25) issues.push(`text layers "${texts[i]!.path}" and "${texts[j]!.path}" overlap by ${Math.round(share * 100)}% of the smaller one`);
    }
  }
  return { frame, time, canvas, layers, issues };
}
