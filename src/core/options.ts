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
const COMMON_ALIASES: Record<string, string | readonly string[]> = {
  // a frame rate is the movie's or a composition's; in a preset that bakes keyframes it is how often it samples
  fps: ['frameRate', 'samplesPerSecond'], framerate: ['frameRate', 'samplesPerSecond'], frame_rate: ['frameRate', 'samplesPerSecond'],
  samplerate: 'samplesPerSecond', stepspersecond: 'samplesPerSecond', samples: 'samplesPerSecond',
  bg: 'background', backgroundcolor: 'background', bgcolor: 'background',
  seconds: 'duration', length: 'duration', time: 'duration',
  w: 'width', h: 'height', cols: 'columns', sweep: 'degrees', angle: 'degrees',
  playbackrate: 'speed', timescale: 'speed', rate: 'speed',
  // the colour of a text: style.fill (a trial film found `style.colour` got no guess)
  colour: 'fill', color: 'fill', fontcolor: 'fill', textcolor: 'fill',
  // blend modes by the names other programs use
  'linear-dodge': 'add', 'linear dodge': 'add', lineardodge: 'add', linear_dodge: 'add', 'plus-lighter': 'add', pluslighter: 'add', plus_lighter: 'add',
  luminance: 'luminosity', exclude: 'exclusion',
  // distortion filters by the names other programs use
  // a composition cut to its rectangle, by the names CSS, Flutter, UIKit and design tools use
  overflow: 'clip', clipchildren: 'clip', cliptobounds: 'clip', maskstobounds: 'clip', clipcontent: 'clip', cliptopadding: 'clip',
  // a layer in 3D space (After Effects: the 3D switch)
  is3d: 'threeD', '3d': 'threeD', three3d: 'threeD', layer3d: 'threeD', threedimensional: 'threeD', enable3d: 'threeD', use3d: 'threeD', in3d: 'threeD', three_d: 'threeD', '3dlayer': 'threeD',
  // a component placed by name, and its values, by the words React, Vue and design tools use
  posterize: 'frameRate', posterizetime: 'frameRate', stepped: 'frameRate', looping: 'loop', loops: 'loop', cycle: 'loop',
  // named moments of a composition, by the words video editors, players and After Effects use
  cues: 'markers', cuepoints: 'markers', cuepoint: 'markers', marks: 'markers', timemarkers: 'markers', chaptermarkers: 'markers', compmarkers: 'markers', marker: 'markers',
  dispose: 'destroy', cleanup: 'destroy', teardown: 'destroy', unmount: 'destroy',
  component: 'use', instanceof: 'use', instance: 'use', ref: 'use', props: 'params', properties: 'params', args: 'params', inputs: 'params',
  // the words of CSS, HTML media and canvas
  opacity: 'alpha', src: 'asset', url: 'asset', href: 'asset', file: 'asset', path: 'asset', repeat: 'loop', muted: 'audio', mute: 'audio',
  linewidth: 'strokeWidth', borderwidth: 'strokeWidth', strokewidth: 'strokeWidth', thickness: 'strokeWidth',
  distort: 'warp', distortion: 'warp', displace: 'warp', displacement: 'warp', ripple: 'warp', wavy: 'warp', heathaze: 'warp', haze: 'warp',
};

/** The real name another tool's word stands for (`opacity` → `alpha`), whatever is valid where it was written; null when it is not such a word. */
export function aliasOf(name: string): string | null {
  const a = COMMON_ALIASES[name.toLowerCase()];
  return (typeof a === 'string' ? a : a?.[0]) ?? null;
}

/** The valid name an author most likely meant by `name` (alias, typo, abbreviation or case slip), or null. */
export function suggestName(name: string, valid: readonly string[]): string | null {
  const n = name.toLowerCase();
  const aliases = COMMON_ALIASES[n];
  for (const alias of typeof aliases === 'string' ? [aliases] : aliases ?? []) if (valid.includes(alias)) return alias;
  let best: { v: string; score: number } | null = null;
  for (const v of valid) {
    const lv = v.toLowerCase();
    const d = distance(n, lv);
    const close = d <= Math.max(1, Math.floor(Math.min(n.length, lv.length) / 3));
    // an abbreviation (cols → columns) or a longer phrase containing the name (fadeIn → in)
    // a two-letter key only as a whole word of the name (fadeIn → in), not as any two letters inside it (repeat, pixelated → at)
    const words = name.split(/(?=[A-Z])|[-_ ]/).map(w => w.toLowerCase());
    const abbreviation = (n.length >= 3 && isSubsequence(n, lv)) || (n.length > lv.length && (lv.length >= 3 ? n.includes(lv) : lv.length === 2 && words.includes(lv)));
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
