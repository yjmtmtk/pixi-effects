import { gsap } from 'gsap';
import { suggestName } from './options';

const FAMILIES = ['power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'];
/** The ease names to suggest from (`steps(n)` and parameters such as `back.out(1.7)` are valid too). */
export const EASE_NAMES: readonly string[] = ['none', ...FAMILIES.flatMap((f) => [`${f}.in`, `${f}.out`, `${f}.inOut`])];

const warned = new Set<string>();
export const __resetEaseWarnings = (): void => warned.clear();

/**
 * GSAP silently runs an unknown ease as its default (`power1.out`), so a typo in `ease` changed the motion and nothing said so.
 * Warn once per name, with a guess.
 */
export function checkEase(ease: string, where: string): void {
  if (typeof ease !== 'string' || gsap.parseEase(ease)) return;
  if (warned.has(ease)) return;
  warned.add(ease);
  const guess = suggestName(ease, EASE_NAMES);
  console.warn(`pixi-effects: ${where}: unknown ease "${ease}"${guess ? ` — did you mean "${guess}"?` : ''} (GSAP would run it as its default ease, power1.out). Examples: ${EASE_NAMES.slice(0, 7).join(', ')}, back.out(1.7), elastic.out(1, 0.3), steps(8)`);
}
