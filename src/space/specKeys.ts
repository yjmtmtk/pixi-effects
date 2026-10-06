import type { Keyframe } from '../types';

/** Every prop key a spec touches in `initial` and in keyframe `set` / `to` / `from`. */
export function collectPropKeys(spec: {
  initial?: Record<string, unknown>;
  keyframes?: Keyframe[];
}): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(spec.initial ?? {})) out.add(k);
  for (const kf of spec.keyframes ?? []) {
    for (const bag of [kf.set, kf.to, kf.from]) {
      for (const k of Object.keys(bag ?? {})) out.add(k);
    }
  }
  return out;
}
