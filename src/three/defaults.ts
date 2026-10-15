/** The page-level default renderer of the three layers: `registerThree({ renderer })` sets it, a layer's own `renderer` wins. */
export type ThreeRendererKind = 'webgl' | 'webgpu';

let pageRenderer: ThreeRendererKind = 'webgl';

export function checkRendererKind(kind: unknown, where: string): asserts kind is ThreeRendererKind {
  if (kind !== 'webgl' && kind !== 'webgpu') throw new Error(`pixi-effects: ${where} must be 'webgl' or 'webgpu' (got ${JSON.stringify(kind)})`);
}
export function setPageRenderer(kind: ThreeRendererKind): void { pageRenderer = kind; }
export function getPageRenderer(): ThreeRendererKind { return pageRenderer; }
