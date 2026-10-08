/** The times an onion skin samples: `count` of them from `from` to `to`, both included. */
export function onionTimes(from: number, to: number, count: number): number[] {
  if (count <= 1) return [from];
  return Array.from({ length: count }, (_, i) => Math.round((from + ((to - from) * i) / (count - 1)) * 1e6) / 1e6);
}

/**
 * Alphas to draw `count` frames one over the other so that the result is the weighted mean of them (weights from `ramp` up to 1):
 * the picture that stays still stays itself, a moving thing leaves a trail that is strongest where it ends.
 */
export function onionAlphas(count: number, ramp = 0.25): number[] {
  const weights = Array.from({ length: count }, (_, i) => (count === 1 ? 1 : ramp + (1 - ramp) * (i / (count - 1))));
  let sum = 0;
  return weights.map((w) => { sum += w; return w / sum; });
}
