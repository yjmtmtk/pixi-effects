import { Sequence } from '../sequences/Base';

/** A `scene3d` layer (filled in by the next step of the plan). */
export class Scene3DSequence extends Sequence {
  async build(): Promise<void> {
    throw new Error('pixi-effects: scene3d layer: not built yet');
  }
}
