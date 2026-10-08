// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const bridge: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/bridge.js')).href);

describe('bridge: what the page may ask the sandboxed movie to do', () => {
  it('knows its commands: status, review, look, onion, render, seek, play, pause', () => {
    expect(Object.keys(bridge.COMMANDS).sort()).toEqual(['look', 'onion', 'pause', 'play', 'render', 'review', 'seek', 'status']);
  });
  it.each([
    [{ id: 1, cmd: 'status' }], [{ id: 2, cmd: 'review', args: { at: 'title@end', strict: false } }], [{ id: 3, cmd: 'look', args: { at: '3.5,50%' } }],
    [{ id: 4, cmd: 'look', args: { count: 6 } }], [{ id: 5, cmd: 'onion', args: { from: 1, to: 3, count: 8 } }],
    [{ id: 6, cmd: 'render', args: { range: [1, 2], draft: true } }], [{ id: 7, cmd: 'render', args: { range: 'title' } }], [{ id: 8, cmd: 'seek', args: { frame: 12 } }],
  ])('accepts %j', (msg) => { expect(bridge.validateCommand(msg)).toEqual({ ok: true }); });
  it.each([
    [{ cmd: 'status' }, /id/], [{ id: 1, cmd: 'eval', args: { code: 'x' } }, /unknown command "eval"/], [{ id: 1 }, /unknown command/],
    [{ id: 1, cmd: 'seek', args: { frame: 'a' } }, /frame must be a whole number/], [{ id: 1, cmd: 'review', args: { at: 5 } }, /at must be a string/],
    [{ id: 1, cmd: 'look', args: { count: 999 } }, /count must be 1 to 24/], [{ id: 1, cmd: 'render', args: { range: [3, 1] } }, /range/],
    [{ id: 1, cmd: 'onion', args: { from: -1 } }, /from/], [null, /message/], ['status', /message/],
    [{ id: 1, cmd: 'constructor' }, /unknown command "constructor"/], [{ id: 1, cmd: 'status', args: [] }, /args must be an object/],
  ])('rejects %j: %s', (msg, why) => {
    const r = bridge.validateCommand(msg);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(why);
  });
  it('the iframe side is one classic script that names its guard (only messages from the parent window are obeyed)', () => {
    expect(bridge.BRIDGE_SOURCE).toContain('__pixiEffectsBridge');
    expect(bridge.BRIDGE_SOURCE).toContain('event.source !== parent');
    expect(() => new Function(bridge.BRIDGE_SOURCE)).not.toThrow();        // it parses
  });
});
