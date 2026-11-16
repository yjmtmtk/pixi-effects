// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { isPlain } from '../../src/core/isPlain';
import { normalizeVars } from '../../src/core/vars';

// An object made in another window (a page calling movie.setVars() on a movie in its iframe, or the other way round) is a plain object too:
// its prototype is that window's Object.prototype, not this one's. 1.0.0 ignored it ("vars must be an object") without saying why.
const other = (src: string) => runInNewContext(`(${src})`);

describe('isPlain: a plain object, from this window or another', () => {
  it('takes {…}, Object.create(null) and a plain object made in another realm', () => {
    expect(isPlain({ a: 1 })).toBe(true);
    expect(isPlain(Object.create(null))).toBe(true);
    expect(isPlain(other('{ title: "NORD" }'))).toBe(true);
  });

  it('refuses arrays, class instances, Maps, Dates, null and primitives, from either realm', () => {
    class Box { x = 1; }
    for (const v of [[1], new Box(), new Map(), new Date(), null, undefined, 3, 'a', other('[1]'), other('new Map()'), other('new Date()')]) {
      expect(isPlain(v), String(v)).toBe(false);
    }
  });

  it('normalizeVars takes variables made in another realm (setVars across an iframe)', () => {
    const said: string[] = [];
    expect(normalizeVars(other('{ title: "NORD", shift: 40 }'), 'setVars', (m) => said.push(m))).toEqual({ title: 'NORD', shift: 40 });
    expect(said).toEqual([]);
  });
});
