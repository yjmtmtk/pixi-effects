import { parseEase as engineParseEase } from '../core/timelineEngine';
import { checkEase } from '../core/ease';

/** Resolve an ease name to a function (0–1 → 0–1). An unknown name warns once and runs as the default ease, `power1.out`. */
export function parseEase(name: string): (p: number) => number {
  checkEase(name, 'a preset');
  return engineParseEase(name);
}
