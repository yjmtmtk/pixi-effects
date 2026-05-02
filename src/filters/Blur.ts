import { BlurFilter } from 'pixi.js';

export interface BlurOptions {
  strength?: number;
  quality?: number;
  repeatEdgePixels?: boolean;
}

export class Blur extends BlurFilter {
  constructor(options: BlurOptions = {}) {
    const { strength = 8, quality = 4, repeatEdgePixels = false } = options;
    super({ strength, quality });
    this.repeatEdgePixels = repeatEdgePixels;
  }
}
