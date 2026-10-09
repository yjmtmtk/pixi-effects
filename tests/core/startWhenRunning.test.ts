import { describe, it, expect } from 'vitest';
import { startWhenRunning, audioIsBlocked } from '../../src/core/startWhenRunning';

function fakeCtx(state: string) {
  const target = new EventTarget();
  const ctx = {
    state,
    resumeCalls: 0,
    resume() { this.resumeCalls++; return new Promise<void>(() => { /* pending until a gesture */ }); },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    setState(s: string) { this.state = s; target.dispatchEvent(new Event('statechange')); },
  };
  return ctx;
}

describe('startWhenRunning — audio that the browser has not allowed yet', () => {
  it('starts at once when the context is already running', () => {
    const ctx = fakeCtx('running');
    let started = 0;
    startWhenRunning(ctx, () => { started++; });
    expect(started).toBe(1);
    expect(ctx.resumeCalls).toBe(0);
  });

  it('waits while suspended, asks the browser to resume, and starts once it runs (a late click)', () => {
    const ctx = fakeCtx('suspended');
    let started = 0;
    startWhenRunning(ctx, () => { started++; });
    expect(started).toBe(0);
    expect(ctx.resumeCalls).toBe(1);
    ctx.setState('running');
    expect(started).toBe(1);
    ctx.setState('suspended'); ctx.setState('running');
    expect(started).toBe(1);   // only once
  });

  it('the returned cancel stops a pending start (pause before the browser allowed the sound)', () => {
    const ctx = fakeCtx('suspended');
    let started = 0;
    const cancel = startWhenRunning(ctx, () => { started++; });
    cancel();
    ctx.setState('running');
    expect(started).toBe(0);
  });

  it('asks to resume again on the first user gesture (Chrome does not grant an earlier request by itself)', () => {
    const ctx = fakeCtx('suspended');
    const page = new EventTarget();
    startWhenRunning(ctx, () => {}, page);
    expect(ctx.resumeCalls).toBe(1);
    page.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resumeCalls).toBe(2);
    page.dispatchEvent(new Event('keydown'));
    expect(ctx.resumeCalls).toBe(3);
  });

  it('stops listening for gestures once it started or was cancelled', () => {
    const ctx = fakeCtx('suspended');
    const page = new EventTarget();
    const cancel = startWhenRunning(ctx, () => {}, page);
    cancel();
    page.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resumeCalls).toBe(1);
  });
});

describe('audioIsBlocked — a player can tell the viewer "tap for sound"', () => {
  it('is true only when the movie has sound and its context is not running', () => {
    expect(audioIsBlocked(fakeCtx('suspended'), true)).toBe(true);
    expect(audioIsBlocked(fakeCtx('interrupted'), true)).toBe(true);   // iOS Safari after a call or a lock
    expect(audioIsBlocked(fakeCtx('running'), true)).toBe(false);
    expect(audioIsBlocked(fakeCtx('suspended'), false)).toBe(false);   // a silent movie has nothing to wait for
    expect(audioIsBlocked(null, true)).toBe(false);                    // no context made yet: nothing is waiting
  });
});
