import { CompositionSequence } from '../sequences/Composition';
import type { Sequence } from '../sequences/Base';
import { describeLayer } from './lint';

interface Checkable extends Sequence { checkDeterminism(times: number[]): number[] }
const isCanvas = (s: Sequence): s is Checkable => typeof (s as Partial<Checkable>).checkDeterminism === 'function';

/**
 * The canvas layers of a movie whose same frame is not the same picture: each is drawn twice at a few moments of its life and the pictures are compared (a `draw` that uses
 * Math.random, the clock or state that outlives the call). One sentence per layer, naming the moments. Run by `check` and the Playground through `movie.review()`.
 */
export function canvasProblems(root: CompositionSequence): string[] {
  const out: string[] = [];
  const visit = (seq: Sequence): void => {
    if (isCanvas(seq)) {
      const length = seq.duration ?? 0;
      const times = [0.15, 0.4, 0.65, 0.9].map(f => Math.round(f * length * 1000) / 1000);
      const bad = seq.checkDeterminism(times);
      if (bad.length) out.push(`${describeLayer(seq.spec)} does not draw the same picture for the same time (checked at ${bad.map(t => `${t} s`).join(', ')}: drawn twice, in two orders): its draw uses Math.random, Date.now or state that outlives the call (a value it keeps from the last call), so playback, a seek and an export would not agree. Use info.random() (seeded) and derive everything from t`);
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
