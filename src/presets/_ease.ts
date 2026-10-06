import { gsap } from 'gsap';

/** Resolve a GSAP ease name to a function (0–1 → 0–1). */
export function parseEase(name: string): (p: number) => number {
  return gsap.parseEase(name) as (p: number) => number;
}
