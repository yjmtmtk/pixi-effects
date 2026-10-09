/** Edit distance, small inputs only. */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      // swapping two neighbouring letters (sacle / scale) counts as one slip
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
    }
  }
  return dp[a.length]![b.length]!;
}

const isSubsequence = (small: string, big: string): boolean => {
  let i = 0;
  for (const ch of big) if (i < small.length && ch === small[i]) i++;
  return i === small.length;
};

/** Names AI authors commonly guess, mapped to the real option (only suggested when the real option exists here). */
const COMMON_ALIASES: Record<string, string> = {
  fps: 'frameRate', framerate: 'frameRate', frame_rate: 'frameRate',
  bg: 'background', backgroundcolor: 'background', bgcolor: 'background',
  seconds: 'duration', length: 'duration', time: 'duration',
  w: 'width', h: 'height', cols: 'columns', sweep: 'degrees', angle: 'degrees',
  playbackrate: 'speed', timescale: 'speed', rate: 'speed',
  // blend modes by the names other programs use
  'linear-dodge': 'add', 'linear dodge': 'add', lineardodge: 'add', linear_dodge: 'add', 'plus-lighter': 'add', pluslighter: 'add', plus_lighter: 'add',
  luminance: 'luminosity', exclude: 'exclusion',
};

/** The valid name an author most likely meant by `name` (alias, typo, abbreviation or case slip), or null. */
export function suggestName(name: string, valid: readonly string[]): string | null {
  const n = name.toLowerCase();
  const alias = COMMON_ALIASES[n];
  if (alias && valid.includes(alias)) return alias;
  let best: { v: string; score: number } | null = null;
  for (const v of valid) {
    const lv = v.toLowerCase();
    const d = distance(n, lv);
    const close = d <= Math.max(1, Math.floor(Math.min(n.length, lv.length) / 3));
    // an abbreviation (cols → columns) or a longer phrase containing the name (fadeIn → in)
    const abbreviation = (n.length >= 3 && isSubsequence(n, lv)) || (lv.length >= 2 && n.length > lv.length && n.includes(lv));
    if (!close && !abbreviation) continue;
    const score = close ? d : 3 + (lv.length - n.length) / 100;   // typos first, then abbreviations
    if (!best || score < best.score) best = { v, score };
  }
  return best ? best.v : null;
}

/**
 * Unknown option keys are silently ignored by JavaScript, which is how a guessed name like `cols`
 * or `fps` quietly does nothing. Say so, and say what was probably meant.
 */
export function warnUnknownOptions(where: string, opts: object | undefined | null, valid: readonly string[]): void {
  if (!opts || typeof opts !== 'object') return;
  for (const key of Object.keys(opts)) {
    if (valid.includes(key)) continue;
    const guess = suggestName(key, valid);
    console.warn(`pixi-effects: ${where}: unknown option "${key}"${guess ? ` — did you mean "${guess}"?` : ''} (valid: ${valid.join(', ')})`);
  }
}
