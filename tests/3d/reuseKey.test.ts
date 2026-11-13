import { describe, it, expect } from 'vitest';
import { reuseKeyOf } from '../../src/3d/Scene3DSequence';

describe('the key a rebuild matches a scene3d layer by', () => {
  const setup = () => {};
  it('is its own kind: it can never equal a three layer\'s key, whatever the arrays hold', () => {
    expect(reuseKeyOf({ type: 'scene3d', name: 'w', setup }, 320, 180)!.startsWith('["scene3d",')).toBe(true);
  });
  it('follows the name, the setup, the size and the plain options; view options that cannot be written as JSON (a cycle) make the layer one that is built again', () => {
    const a = reuseKeyOf({ type: 'scene3d', name: 'w', setup, view: { exposure: 1 } }, 320, 180);
    expect(reuseKeyOf({ type: 'scene3d', name: 'w', setup, view: { exposure: 1 } }, 320, 180)).toBe(a);
    expect(reuseKeyOf({ type: 'scene3d', name: 'w', setup, view: { exposure: 2 } }, 320, 180)).not.toBe(a);
    expect(reuseKeyOf({ type: 'scene3d', name: 'w', setup: () => {}, view: { exposure: 1 } }, 320, 180)).not.toBe(a);
    expect(reuseKeyOf({ type: 'scene3d', name: 'w', setup, view: { exposure: 1 } }, 200, 180)).not.toBe(a);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(reuseKeyOf({ type: 'scene3d', name: 'w', setup, view: cyclic as never }, 320, 180)).toBeNull();
  });
});
