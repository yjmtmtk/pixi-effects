import { FillGradient, Texture } from 'pixi.js';
import { gradientOptions, paintRadial, type RadialCtx } from './gradient';
import type { GradientSpec } from '../types';

const RADIAL_SIZE = 256;

/** What to hand to `Graphics.fill(...)` for a `fillGradient`: a FillGradient (linear) or a local-space texture (radial). */
export function makeGradientFill(g: GradientSpec): FillGradient | { texture: Texture; textureSpace: 'local' } {
  if (g.type === 'radial') {
    const canvas = document.createElement('canvas');
    canvas.width = RADIAL_SIZE;
    canvas.height = RADIAL_SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      paintRadial(ctx as unknown as RadialCtx, RADIAL_SIZE, g);
      return { texture: Texture.from(canvas), textureSpace: 'local' };
    }
  }
  return new FillGradient(gradientOptions(g) as never);
}
