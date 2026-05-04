import { ImageSequence } from '../sequences/Image';
import { TextSequence } from '../sequences/Text';
import { AudioSequence } from '../sequences/Audio';
import { VideoSequence } from '../sequences/Video';
import { ShapeSequence } from '../sequences/Shape';
import type { Sequence } from '../sequences/Base';
import type { SequenceSpec, CompositionShape } from '../types';

let _CompositionSequence: typeof import('../sequences/Composition').CompositionSequence | null = null;
async function getCompositionSequence() {
  if (!_CompositionSequence) {
    _CompositionSequence = (await import('../sequences/Composition')).CompositionSequence;
  }
  return _CompositionSequence;
}

type SequenceCtor = { new (spec: SequenceSpec, parent: CompositionShape | null, root: CompositionShape): Sequence };

const staticTypes: Partial<Record<SequenceSpec['type'], SequenceCtor>> = {
  image: ImageSequence as unknown as SequenceCtor,
  text: TextSequence as unknown as SequenceCtor,
  audio: AudioSequence as unknown as SequenceCtor,
  video: VideoSequence as unknown as SequenceCtor,
  shape: ShapeSequence as unknown as SequenceCtor,
};

export async function buildSequenceTree(
  specs: SequenceSpec[],
  parent: CompositionShape | null,
  root: CompositionShape,
): Promise<Sequence[]> {
  const out: Sequence[] = [];
  for (const spec of specs) {
    let Cls: SequenceCtor | undefined = staticTypes[spec.type];
    if (!Cls && spec.type === 'composition') {
      Cls = (await getCompositionSequence()) as unknown as SequenceCtor;
    }
    if (!Cls) {
      console.warn(`pixi-effects: unknown sequence type "${(spec as { type: string }).type}"`);
      continue;
    }
    const seq = new Cls(spec, parent, root);
    await seq.build();
    if (seq.duration === undefined) {
      seq.duration = parent?.duration ?? root.duration;
    }
    out.push(seq);
  }
  return out;
}
