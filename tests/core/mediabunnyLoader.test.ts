import { describe, it, expect, beforeEach, vi } from 'vitest';

// src/core/mediabunny.ts: where mediabunny comes from, loaded once, on demand. The real browser side is tests/films/export-mediabunny-on-demand.
const fresh = async () => { vi.resetModules(); return await import('../../src/core/mediabunny'); };
const fake = () => ({ Output: class {}, id: Math.random() }) as never;

describe('loadMediabunny / useMediabunny', () => {
  beforeEach(() => vi.resetModules());

  it('the module itself is used as it is, and every call shares one load', async () => {
    const { useMediabunny, loadMediabunny } = await fresh();
    const mod = fake();
    useMediabunny(mod);
    const [a, b] = await Promise.all([loadMediabunny(), loadMediabunny()]);
    expect(a).toBe(mod);
    expect(b).toBe(mod);
  });

  it('a function is called once, on the first load, not when it is given', async () => {
    const { useMediabunny, loadMediabunny } = await fresh();
    const mod = fake();
    const from = vi.fn(async () => mod);
    useMediabunny(from);
    expect(from).not.toHaveBeenCalled();
    await loadMediabunny(); await loadMediabunny();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('a failed load says what to write, and the next call tries again', async () => {
    const { useMediabunny, loadMediabunny } = await fresh();
    const mod = fake();
    let fail = true;
    useMediabunny(async () => { if (fail) throw new Error('offline'); return mod; });
    await expect(loadMediabunny()).rejects.toThrow(/could not load mediabunny from the function given to useMediabunny\(\) \(offline\).*import map.*useMediabunny\(/s);
    fail = false;
    await expect(loadMediabunny()).resolves.toBe(mod);
  });

  it('something that is not mediabunny is refused with a sentence', async () => {
    const { useMediabunny, loadMediabunny } = await fresh();
    useMediabunny({ default: {} } as never);
    await expect(loadMediabunny()).rejects.toThrow(/did not give the mediabunny module \(no Output in it\)/);
    expect(() => useMediabunny(undefined as never)).toThrow(/takes the mediabunny module, a URL or a function/);
    expect(() => useMediabunny(3 as never)).toThrow(/takes the mediabunny module/);
  });

  it('giving a new source replaces the old one for the next load', async () => {
    const { useMediabunny, loadMediabunny } = await fresh();
    const one = fake(), two = fake();
    useMediabunny(one);
    expect(await loadMediabunny()).toBe(one);
    useMediabunny(two);
    expect(await loadMediabunny()).toBe(two);
  });

  it('with nothing given, the bare name is imported (a bundler or the import map resolves it)', async () => {
    const { loadMediabunny } = await fresh();
    const mod = await loadMediabunny();
    expect(typeof mod.Output).toBe('function');
  });
});
