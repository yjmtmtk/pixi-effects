import { warnUnknownOptions } from '../core/options';
import { random } from '../expr/random';
import { parseEase } from './_ease';

const STAGGER_KEYS = ['each', 'amount', 'from', 'grid', 'ease', 'seed'] as const;
const FROM_NAMES = ['start', 'end', 'center', 'edges', 'random'] as const;

export interface StaggerOptions {
  /** Seconds between neighbours (the farthest one waits `each` × its distance). Default 0.1. Not together with `amount`. */
  each?: number;
  /** Seconds from the first to the last, however many there are. Not together with `each`. */
  amount?: number;
  /**
   * Where the wave starts: `'start'` (default), `'end'`, `'center'` (outward), `'edges'` (inward), `'random'` (a seeded
   * shuffle of the same delays), or the index of one item.
   */
  from?: 'start' | 'end' | 'center' | 'edges' | 'random' | number;
  /** `[columns, rows]`: the items fill a grid row by row and the wave travels by straight-line distance across it. */
  grid?: [number, number];
  /** Ease that reshapes the spread (default `'none'`: even steps). The first stays at 0, the last at the full spread. */
  ease?: string;
  /** For `from: 'random'`: another seed is another order. Default 0. */
  seed?: number;
}

/**
 * Delays for a wave of items, in seconds, in the style of GSAP's `stagger` (its names, with thanks).
 *
 *   stagger(6, { each: 0.08 })                        // [0, 0.08, 0.16, …]            use: `at: 1 + d[i]`
 *   stagger(letters, { each: 0.05, from: 'center' })  // the same layers with their `at` pushed back
 *
 * Given a layer array it returns new layers whose `at` is shifted by their delay; the originals are not touched.
 * Everything is a pure function of the options (`from: 'random'` is seeded), so playback and export agree.
 */
export function stagger(count: number, options?: StaggerOptions): number[];
export function stagger<T extends { at?: number }>(layers: readonly T[], options?: StaggerOptions): T[];
export function stagger<T extends { at?: number }>(items: number | readonly T[], options: StaggerOptions = {}): number[] | T[] {
  const isCount = typeof items === 'number';
  const n = isCount ? items : items.length;
  if (!Number.isInteger(n) || n < 0) throw new Error(`stagger(): count must be a whole number of items, got ${n}`);
  warnUnknownOptions('stagger()', options, STAGGER_KEYS);
  const { each, amount, from = 'start', grid, ease = 'none', seed = 0 } = options;
  if (each !== undefined && amount !== undefined) throw new Error('stagger(): give `each` (seconds between neighbours) or `amount` (seconds in total), not both');
  if (each !== undefined && !(Number.isFinite(each) && each >= 0)) throw new Error(`stagger(): each must be a number of seconds >= 0, got ${each}`);
  if (amount !== undefined && !(Number.isFinite(amount) && amount >= 0)) throw new Error(`stagger(): amount must be a number of seconds >= 0, got ${amount}`);
  if (typeof from === 'string' && !(FROM_NAMES as readonly string[]).includes(from)) {
    throw new Error(`stagger(): from "${from}" is not one of ${FROM_NAMES.map(f => `"${f}"`).join(', ')} or an item index`);
  }
  if (typeof from === 'number' && !(Number.isInteger(from) && from >= 0 && from < Math.max(n, 1))) throw new Error(`stagger(): from ${from} is not an index of the ${n} items`);
  if (grid && !(Array.isArray(grid) && grid.length === 2 && grid.every(g => Number.isInteger(g) && g > 0) && grid[0]! * grid[1]! >= n)) {
    throw new Error(`stagger(): grid must be [columns, rows] and hold all ${n} items, got ${JSON.stringify(grid)}`);
  }

  const dist = distances(n, from, grid, seed);
  const max = dist.reduce((m, d) => Math.max(m, d), 0);
  const total = amount !== undefined ? amount : (each ?? 0.1) * max;
  const shape = parseEase(ease);
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));                // a spring (or any overshooting ease) must not push a delay past the spread, or below 0
  const delays = dist.map(d => (max === 0 ? 0 : Math.round(total * clamp01(shape(d / max)) * 1e6) / 1e6));
  if (isCount) return delays;
  return (items as readonly T[]).map((layer, i) => ({ ...layer, at: Math.round(((layer.at ?? 0) + delays[i]!) * 1e6) / 1e6 }));
}

/** How far each item is from where the wave starts, in item steps (a straight line across a grid). */
function distances(n: number, from: NonNullable<StaggerOptions['from']>, grid: [number, number] | undefined, seed: number): number[] {
  if (n === 0) return [];
  if (from === 'random') {
    const order = Array.from({ length: n }, (_, i) => i);
    const r = random(seed);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
    return order;
  }
  if (!grid) {
    const mid = (n - 1) / 2;
    return Array.from({ length: n }, (_, i) => {
      switch (from) {
        case 'start': return i;
        case 'end': return n - 1 - i;
        case 'center': return Math.abs(i - mid);
        case 'edges': return mid - Math.abs(i - mid);
        default: return Math.abs(i - from);
      }
    });
  }
  const [cols, rows] = grid;
  const at = (i: number) => ({ x: i % cols, y: Math.floor(i / cols) });
  const origin = from === 'start' ? { x: 0, y: 0 }
    : from === 'end' ? { x: cols - 1, y: rows - 1 }
    : from === 'center' || from === 'edges' ? { x: (cols - 1) / 2, y: (rows - 1) / 2 }
    : at(from);
  const d = Array.from({ length: n }, (_, i) => Math.hypot(at(i).x - origin.x, at(i).y - origin.y));
  if (from !== 'edges') return d;
  const far = Math.max(...d);
  return d.map(v => far - v);
}
