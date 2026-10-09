import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
// the chunk with the blend filters fails to load (a page that serves dist/index.js alone, a CDN hiccup)
vi.mock('../../src/filters/blendModes', () => { throw new Error('Failed to fetch dynamically imported module'); });
import { enableAdvancedBlend, blendFilterFor } from '../../src/core/blend';

describe('enableAdvancedBlend when the blend filters cannot be loaded', () => {
  it('does not reject (the movie still plays): it warns once, says what happens, and leaves no filter maker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = { backBuffer: { useBackBuffer: false } };
    await expect(enableAdvancedBlend(renderer)).resolves.toBeUndefined();
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('blend'));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/could not be loaded/);
    expect(said[0]).toMatch(/could not be loaded \(.+\)/);                  // the reason the loader gave is in the brackets
    expect(said[0]).toMatch(/drawn normal/);
    expect(blendFilterFor('overlay')).toBeNull();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
  });
});
