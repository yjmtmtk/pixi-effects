import { vi } from 'vitest';
export { MockWebGLRenderer, MockWebGPURenderer } from './mockRenderers';

export class MockScene {
  isMockScene = true;
  children: unknown[] = [];
  add(...objs: unknown[]) { this.children.push(...objs); }
  traverse(cb: (o: unknown) => void) { for (const c of this.children) cb(c); }
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

/** Call at the top of every three test file, BEFORE importing ThreeSequence. */
export function mockThreeModule() {
  // vi.mock is hoisted above the imports: the renderer classes are taken from their file inside the factory
  vi.mock('three', async () => ({
    Scene: MockScene,
    PerspectiveCamera: MockPerspectiveCamera,
    WebGLRenderer: (await import('./mockRenderers')).MockWebGLRenderer,
  }));
  vi.mock('three/webgpu', async () => ({ WebGPURenderer: (await import('./mockRenderers')).MockWebGPURenderer }));
}
