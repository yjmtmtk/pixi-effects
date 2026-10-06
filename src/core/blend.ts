import { describeLayer } from './lint';

const MODES = ['normal', 'add', 'screen', 'multiply'];

/** Apply a layer's `blendMode` to its display object; an unknown mode warns and is ignored. */
export function applyBlendMode(spec: { blendMode?: string; name?: string; type: string }, display: { blendMode?: unknown }): void {
  const mode = spec.blendMode;
  if (mode === undefined) return;
  if (!MODES.includes(mode)) {
    console.warn(`pixi-effects: ${describeLayer(spec)}: blendMode "${mode}" is not supported (use ${MODES.join(', ')})`);
    return;
  }
  display.blendMode = mode;
}
