import { Container } from 'pixi.js';
import { Sequence } from './Base';
import type { NullSequenceSpec } from '../types';

/**
 * `type: 'null'`: a layer that draws nothing, only moves. Other layers name it as their `parent`; the
 * composition then draws them inside this container, so its transform and alpha carry them along.
 */
export class NullSequence extends Sequence {
  declare spec: NullSequenceSpec;

  async build(): Promise<void> {
    this.target = new Container();
    this.buildFilters();
  }
}
