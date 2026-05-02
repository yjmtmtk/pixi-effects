import type { CompositionShape } from '../types';

/** Sequence-shaped input expected by buildScope. */
export interface ScopeSequence {
  intrinsicWidth: number;
  intrinsicHeight: number;
  at?: number;
  duration?: number;
}

/** Variables available to expr-eval evaluation. */
export interface Scope {
  w: number; h: number;
  W: number; H: number;
  GW: number; GH: number;
  contain: number; cover: number;
  t: number; d: number; T: number;
}

export function buildScope(
  sequence: ScopeSequence,
  parent: CompositionShape | null,
  root: CompositionShape,
): Scope {
  const w = sequence.intrinsicWidth || 0;
  const h = sequence.intrinsicHeight || 0;
  const W = parent?.width ?? root.width;
  const H = parent?.height ?? root.height;
  const GW = root.width;
  const GH = root.height;
  const contain = (w === 0 || h === 0) ? 1 : Math.min(W / w, H / h);
  const cover   = (w === 0 || h === 0) ? 1 : Math.max(W / w, H / h);
  return {
    w, h, W, H, GW, GH,
    contain, cover,
    t: sequence.at ?? 0,
    d: sequence.duration ?? parent?.duration ?? root.duration,
    T: parent?.duration ?? root.duration,
  };
}
