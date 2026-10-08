import { gsap } from 'gsap';
import { checkEase } from '../core/ease';

/** Resolve a GSAP ease name to a function (0–1 → 0–1). An unknown name warns once (GSAP would run it as its default ease). */
export function parseEase(name: string): (p: number) => number {
  checkEase(name, 'a preset');
  return gsap.parseEase(name) as (p: number) => number;
}
