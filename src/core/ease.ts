import { isEaseName } from './pure/ease';
import { suggestName } from './options';
import { springProblem } from './spring';
import { cubicBezierProblem } from './cubicBezier';

const FAMILIES = ['power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'];
/** The ease names to suggest from (`steps(n)` and parameters such as `back.out(1.7)` are valid too). */
export const EASE_NAMES: readonly string[] = ['none', ...FAMILIES.flatMap((f) => [`${f}.in`, `${f}.out`, `${f}.inOut`])];

const warned = new Set<string>();
export const __resetEaseWarnings = (): void => warned.clear();

/**
 * An unknown ease runs as the default (`power1.out`), so a typo in `ease` changes the motion; nothing else would say so.
 * Warn once per name, with a guess.
 */
export function checkEase(ease: string, where: string): void {
  if (typeof ease !== 'string') return;
  if (/^\s*spring/.test(ease)) {                                   // a malformed spring must be said, once
    const problem = springProblem(ease);
    if (!problem || warned.has(ease)) return;
    warned.add(ease);
    console.warn(`pixi-effects: ${where}: unknown ease "${ease}" — ${problem}. It runs as its default ease, power1.out.`);
    return;
  }
  if (/^\s*cubic-bezier/i.test(ease)) {                            // a malformed one is said once, with what it runs as
    const problem = cubicBezierProblem(ease);
    if (!problem || warned.has(ease)) return;
    warned.add(ease);
    console.warn(`pixi-effects: ${where}: unknown ease "${ease}" — ${problem}. It runs as 'none' (a straight line).`);
    return;
  }
  if (isEaseName(ease)) return;
  if (warned.has(ease)) return;
  warned.add(ease);
  if (ease === '') {
    console.warn(`pixi-effects: ${where}: an empty ease (it would run as power1.out): write 'none' for no easing, or a name such as 'power2.out'`);
    return;
  }
  if (/^(power[1-4]|quad|cubic|quart|quint|strong|back|elastic|bounce|circ|expo|sine)$/i.test(ease)) {
    console.warn(`pixi-effects: ${where}: "${ease}" is a family, not an ease — write ${ease.toLowerCase()}.out, ${ease.toLowerCase()}.in or ${ease.toLowerCase()}.inOut`);
    return;
  }
  const guess = suggestName(ease, EASE_NAMES);
  console.warn(`pixi-effects: ${where}: unknown ease "${ease}"${guess ? ` — did you mean "${guess}"?` : ''} (it runs as its default ease, power1.out). Examples: ${EASE_NAMES.slice(0, 7).join(', ')}, back.out(1.7), elastic.out(1, 0.3), steps(8)`);
}
