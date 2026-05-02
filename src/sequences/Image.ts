import { Sprite, Assets, type Texture } from 'pixi.js';
import { Sequence } from './Base';
import type { ImageSequenceSpec } from '../types';

export class ImageSequence extends Sequence {
  declare spec: ImageSequenceSpec;

  async build(): Promise<void> {
    const texture = await Assets.get<Texture>(this.spec.asset);
    const sprite = new Sprite({ texture, label: this.spec.name });
    sprite.cullable = true;
    this.target = sprite;
    this.intrinsicWidth = texture.width;
    this.intrinsicHeight = texture.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    this.buildFilters();
  }
}
