import { vi } from 'vitest';

export class MockScene {
  isMockScene = true;
  children: unknown[] = [];
  add(...objs: unknown[]) { this.children.push(...objs); }
}

export class MockPerspectiveCamera {
  isMockCamera = true;
  fov: number; aspect: number; near: number; far: number;
  position = { x: 0, y: 0, z: 0 };
  rotation = { x: 0, y: 0, z: 0 };
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
  }
}

export class MockWebGLRenderer {
  domElement: HTMLCanvasElement;
  renderCalls: Array<{ scene: unknown; camera: unknown }> = [];
  setSizeCalls: Array<[number, number, boolean | undefined]> = [];
  clearColor: [unknown, number] | null = null;
  disposed = false;
  contextLost = false;
  constructor(opts: { canvas: HTMLCanvasElement }) { this.domElement = opts.canvas; }
  setSize(w: number, h: number, updateStyle?: boolean) {
    this.setSizeCalls.push([w, h, updateStyle]);
    this.domElement.width = w;
    this.domElement.height = h;
  }
  setClearColor(color: unknown, alpha: number) { this.clearColor = [color, alpha]; }
  render(scene: unknown, camera: unknown) { this.renderCalls.push({ scene, camera }); }
  dispose() { this.disposed = true; }
  forceContextLoss() { this.contextLost = true; }
}

/** What `three/webgpu`'s WebGPURenderer looks like to the layer: async init, async render, a dispose. */
export class MockWebGPURenderer {
  domElement: HTMLCanvasElement;
  opts: Record<string, unknown>;
  initCalls = 0;
  renderCalls: Array<{ scene: unknown; camera: unknown }> = [];
  setSizeCalls: Array<[number, number, boolean | undefined]> = [];
  clearColor: [unknown, number] | null = null;
  disposed = false;
  /** the order things happened in, to check that init comes before the first render */
  log: string[] = [];
  constructor(opts: { canvas: HTMLCanvasElement }) { this.opts = opts; this.domElement = opts.canvas; }
  async init() { this.initCalls++; this.log.push('init'); }
  setSize(w: number, h: number, updateStyle?: boolean) {
    this.setSizeCalls.push([w, h, updateStyle]);
    this.domElement.width = w; this.domElement.height = h;
  }
  setClearColor(color: unknown, alpha: number) { this.clearColor = [color, alpha]; }
  render(scene: unknown, camera: unknown) { this.log.push('render'); this.renderCalls.push({ scene, camera }); }
  /** deprecated in three (it warns on every use): the layer must not call it */
  async renderAsync() { throw new Error('renderAsync is deprecated: use render() after init()'); }
  dispose() { this.disposed = true; }
}

/** Call at the top of every three test file, BEFORE importing ThreeSequence. */
export function mockThreeModule() {
  vi.mock('three', () => ({
    Scene: MockScene,
    PerspectiveCamera: MockPerspectiveCamera,
    WebGLRenderer: MockWebGLRenderer,
  }));
  vi.mock('three/webgpu', () => ({ WebGPURenderer: MockWebGPURenderer }));
}
