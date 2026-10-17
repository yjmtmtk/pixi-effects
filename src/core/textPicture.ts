/**
 * The picture of a text layer's letters, for `movie.pick(x, y, { alpha })`: PixiJS draws a `Text` into a canvas, uploads it and gives the canvas back to a pool (blank by the time anyone looks),
 * so the letters are drawn again with PixiJS's own generator, once per text and style, into a canvas of ours. Same generator, same picture as the one on screen.
 */
import { CanvasPool, CanvasTextGenerator, Text } from 'pixi.js';
import type { PictureOf } from './pick';

const cache = new WeakMap<object, { key: string; picture: PictureOf }>();

export function textPictureOf(display: unknown): PictureOf | null {
  if (!(display instanceof Text)) return null;
  const style = display.style as unknown as { styleKey?: string };
  const key = `${display.text}|${display.resolution}|${style.styleKey ?? ''}`;
  const kept = cache.get(display);
  if (kept?.key === key) return kept.picture;
  try {
    const { canvasAndContext, frame } = CanvasTextGenerator.getCanvasAndContext({ text: display.text, style: display.style, resolution: display.resolution });
    const copy = document.createElement('canvas');
    copy.width = canvasAndContext.canvas.width; copy.height = canvasAndContext.canvas.height;
    copy.getContext('2d')!.drawImage(canvasAndContext.canvas as CanvasImageSource, 0, 0);
    CanvasPool.returnCanvasAndContext(canvasAndContext);
    const picture: PictureOf = { frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height }, source: { resolution: display.resolution, resource: copy } };
    cache.set(display, { key, picture });
    return picture;
  } catch { return null; }                                               // a PixiJS that draws text another way: the box stays the picture
}
