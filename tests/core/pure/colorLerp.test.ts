import { describe, it, expect } from 'vitest';
import { gsap } from 'gsap';
import { rgbInterp } from '../../../src/core/pure/colorLerp';

const PAIRS: [string, string][] = [
  ['#ff0000', '#00ff00'], ['#102030', '#f08060'], ['#f00', '#0f0'], ['#ff000080', '#00ff00ff'], ['#fff', '#000000'],
  ['rgb(10,20,30)', 'rgb(200,100,50)'], ['rgba(10,20,30,0.2)', 'rgba(200,100,50,0.9)'], ['#ffffff', 'rgba(0,0,0,0)'],
  ['#336699', '#ffcc00'], ['#0a0a0a', '#fafafa'],
];

describe('the colour interpolation is gsap.utils.interpolate\'s', () => {
  for (const [a, b] of PAIRS) {
    it(`${a} -> ${b}`, () => {
      const g = gsap.utils.interpolate(a, b) as (p: number) => string;
      const mine = rgbInterp(a, b, () => { throw new Error('should be read'); });
      for (let i = 0; i <= 200; i++) expect(mine(i / 200)).toBe(g(i / 200));
      for (const p of [-0.2, 1.2, 1.5]) expect(mine(p)).toBe(g(p));
    });
  }
});
