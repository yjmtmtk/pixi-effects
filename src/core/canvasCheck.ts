import { CompositionSequence } from '../sequences/Composition';
import type { Sequence } from '../sequences/Base';
import type { CanvasCheck } from '../sequences/Canvas';
import { describeLayer } from './lint';

interface Checkable extends Sequence { checkDeterminism(times: number[]): CanvasCheck }
const isCanvas = (s: Sequence): s is Checkable => typeof (s as Partial<Checkable>).checkDeterminism === 'function';

/** One canvas layer as the check saw it. */
export interface CanvasRow {
  name: string;
  /** The moments (seconds of the layer's own time) it was drawn at, in two orders. */
  moments: number[];
  /** The usual time of one draw on the CPU canvas of the check (the browser's GPU may be faster or slower). */
  drawMs: number;
  ok: boolean;
  /** Why not, in a sentence (empty when ok). */
  problem: string;
}

const describeDiff = (d: CanvasCheck['differs'][number]): string =>
  `${d.t} s${d.pixels >= 0 ? ` (${d.pixels} channel values differ, by up to ${d.maxDiff} of 255)` : ''}`;

/**
 * Every canvas layer of a movie, drawn in two orders at a few moments of its life with one draw thrown away first, the pictures compared. A layer whose same frame is not the
 * same picture is `ok: false` with a sentence that names the moments and how much differs. Run by `check` and the Playground through `movie.review()`.
 */
export function canvasReport(root: CompositionSequence): CanvasRow[] {
  const out: CanvasRow[] = [];
  const visit = (seq: Sequence): void => {
    if (isCanvas(seq)) {
      const length = seq.duration ?? 0;
      const moments = [0.15, 0.4, 0.65, 0.9].map(f => Math.round(f * length * 1000) / 1000);
      const { differs, drawMs } = seq.checkDeterminism(moments);
      const name = describeLayer(seq.spec);
      const problem = differs.length
        ? `${name} does not draw the same picture for the same time (checked at ${differs.map(describeDiff).join(', ')}; drawn in two orders after one draw that was thrown away): ` +
          'usually its draw uses Math.random, Date.now or state that outlives the call (a value it keeps from the last call), so playback, a seek and an export would not agree: use info.random() (seeded) and derive everything from t. ' +
          'If it uses none of these, look at the canvases it draws from: make sprites and masks with info.canvas(w, h) (not document.createElement) and draw them into the picture before the strokes that depend on them'
        : '';
      out.push({ name: seq.spec.name ?? name, moments, drawMs, ok: !differs.length, problem });
    }
    if (seq instanceof CompositionSequence) walk(seq);
  };
  const walk = (comp: CompositionSequence): void => {
    for (const { seq } of comp.layers()) {
      visit(seq);
      const mask = (seq as { maskSequence?: Sequence | null }).maskSequence;                // an inline mask is a layer too
      if (mask) visit(mask);
    }
  };
  walk(root);
  return out;
}

/** The sentences of the canvas layers whose same frame is not the same picture (what `check` reports as a problem). */
export const canvasProblems = (root: CompositionSequence): string[] => canvasReport(root).filter(r => !r.ok).map(r => r.problem);
