import { describe, it, expect } from 'vitest';
import { gsap } from 'gsap';
import { springEase, SPRING_PRESETS } from '../../../src/core/spring';
import { cubicBezierEase } from '../../../src/core/cubicBezier';
import { pureEase } from '../../../src/core/pure/ease';

const FAMILIES = ['power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'];
const NAMES = [
  'none', 'linear', 'power2', 'power4', 'back', 'expo', 'sine', 'quad', 'elastic', 'bounce', 'circ',
  ...FAMILIES.flatMap(f => [`${f}.in`, `${f}.out`, `${f}.inOut`]),
  'Power2.easeOut', 'Power3.easeInOut', 'Back.easeOut', 'Elastic.easeIn', 'Bounce.easeOut', 'Sine.easeIn', 'Circ.easeOut',
  'back.out(1.7)', 'back.in(3)', 'back.inOut(0.5)', 'back.out(0)', 'back.inOut(4)',
  'elastic.out(1,0.5)', 'elastic.in(2,0.2)', 'elastic.inOut(1.5,0.4)', 'elastic.out(1, 0.3)', 'elastic.out(0.5,0.3)', 'elastic.in(1)', 'elastic.inOut(1)', 'elastic.inOut(1,0.3)',
  'steps(1)', 'steps(5)', 'steps(12)', 'steps(30)',
];

describe('pure eases are GSAP\'s eases: every name, 2001 points, the same numbers', () => {
  for (const name of NAMES) {
    it(name, () => {
      const g = gsap.parseEase(name) as (p: number) => number;
      expect(typeof g).toBe('function');
      const mine = pureEase(name);
      let worst = 0, at = 0;
      for (let i = 0; i <= 2000; i++) {
        const p = i / 2000;
        const d = Math.abs(mine(p) - g(p));
        if (d > worst) { worst = d; at = p; }
      }
      expect(worst, `${name}: differs by ${worst} at p=${at}`).toBeLessThan(1e-12);
    });
  }

  it('an unknown name runs as power1.out, which is what GSAP does (checkEase says so once)', () => {
    const g = gsap.parseEase('power1.out') as (p: number) => number;      // parseEase('wobble.out') is undefined; a tween with it runs as power1.out
    const mine = pureEase('wobble.out');
    for (let i = 0; i <= 20; i++) expect(mine(i / 20)).toBeCloseTo(g(i / 20), 12);
  });
});

describe('the ends are exact: a colour is cut towards zero, so an ease that returns 2e-16 for 0 would change it', () => {
  for (const name of NAMES) {
    it(name, () => {
      const g = gsap.parseEase(name) as (p: number) => number;
      const mine = pureEase(name);
      expect(mine(0)).toBe(g(0));
      expect(mine(1)).toBe(g(1));
    });
  }
});

describe('spring and cubic-bezier are ours (GSAP has neither)', () => {
  it('the names run the functions of the library', () => {
    for (const p of [0, 0.1, 0.37, 0.8, 1]) {
      expect(pureEase('spring(1,170,12)')(p)).toBe(springEase({ mass: 1, stiffness: 170, damping: 12 })(p));
      expect(pureEase('spring.bouncy')(p)).toBe(springEase(SPRING_PRESETS.bouncy)(p));
      expect(pureEase('spring')(p)).toBe(springEase()(p));
      expect(pureEase('cubic-bezier(.4,0,.2,1)')(p)).toBe(cubicBezierEase(0.4, 0, 0.2, 1)(p));
      expect(pureEase('cubic-bezier(0.4, 0, 0.2, 1)')(p)).toBe(cubicBezierEase(0.4, 0, 0.2, 1)(p));
    }
  });
});
