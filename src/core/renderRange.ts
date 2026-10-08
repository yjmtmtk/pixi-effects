/** Which frames an export covers, and the audio for them. Pure: the Renderer calls these. */
export interface RangeContext {
  frameRate: number;
  totalFrames: number;
  duration: number;
  /** The movie's timeline rows (`movie.timelineData().rows`): a range may name a top-level layer. */
  rows?: Array<{ name: string; start: number; end: number; depth: number; parts?: Array<{ start: number; end: number }>; partNames?: string[]; local?: string }>;
}
export interface ResolvedRange { fromFrame: number; toFrame: number; fromSec: number; toSec: number; partial: boolean }

export function resolveRange(range: [number, number] | string | undefined, ctx: RangeContext): ResolvedRange {
  const { frameRate: fps, totalFrames, duration } = ctx;
  if (range === undefined) return { fromFrame: 0, toFrame: totalFrames, fromSec: 0, toSec: duration, partial: false };
  let from: number, to: number;
  if (typeof range === 'string') {
    // top-level layers by their own names (a family the timeline folds into one row, `pop-# ×4`, gives its members back)
    const rows = (ctx.rows ?? []).filter((r) => r.depth === 0 && !r.local).flatMap((r) => (r.parts && r.partNames ? r.partNames.map((name, i) => ({ name, start: r.parts![i]!.start, end: r.parts![i]!.end })) : [r]));
    const row = rows.find((r) => r.name === range);
    if (!row) throw new Error(`pixi-effects: render({ range: "${range}" }): no layer named "${range}" at the top level (names: ${rows.slice(0, 40).map((r) => r.name).join(', ') || 'none'}${rows.length > 40 ? ', …' : ''})`);
    from = row.start; to = row.end;
  } else {
    if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new Error('pixi-effects: render({ range }) must be [from, to] in seconds (numbers) or the name of a top-level layer');
    }
    [from, to] = range;
  }
  if (from < 0 || to <= from) throw new Error(`pixi-effects: render({ range: [${from}, ${to}] }): a range must start before it ends (from >= 0, from < to)`);
  if (to > duration + 0.5 / fps) throw new Error(`pixi-effects: render({ range: [${from}, ${to}] }) goes past the end: the movie is ${duration} s long`);
  const fromFrame = Math.round(from * fps);
  const toFrame = Math.min(Math.round(to * fps), totalFrames);
  if (toFrame <= fromFrame) throw new Error(`pixi-effects: render({ range: [${from}, ${to}] }) is shorter than one frame (${(1 / fps).toFixed(4)} s at ${fps} fps)`);
  const partial = fromFrame > 0 || toFrame < totalFrames;
  return { fromFrame, toFrame, fromSec: fromFrame / fps, toSec: toFrame / fps, partial };
}

/** The samples of `channels` between two times (silence past the end), with a short fade on an edge that was cut. */
export function sliceChannels(
  channels: Float32Array[], sampleRate: number, fromSec: number, toSec: number,
  opts: { fade?: number; fadeIn?: boolean; fadeOut?: boolean } = {},
): Float32Array[] {
  const fade = Math.max(0, Math.round((opts.fade ?? 0.01) * sampleRate));
  const from = Math.round(fromSec * sampleRate), len = Math.max(1, Math.round(toSec * sampleRate) - from);
  return channels.map((src) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) { const j = from + i; if (j >= 0 && j < src.length) out[i] = src[j]!; }
    const f = Math.min(fade, len >> 1);
    if (opts.fadeIn !== false) for (let i = 0; i < f; i++) out[i] = out[i]! * (i / f);
    if (opts.fadeOut !== false) for (let i = 0; i < f; i++) out[len - 1 - i] = out[len - 1 - i]! * (i / f);
    return out;
  });
}

/**
 * What `draft` stands for, and the checks on `scale`: a draft is half size, low quality and no motion blur (for looking, not for
 * delivering); anything the caller sets itself wins.
 */
export function resolveRenderOptions(o: { scale?: number; draft?: boolean; video?: { bitrate?: string }; motionBlur?: unknown }): { scale: number; bitrate: string | undefined; motionBlur: unknown } {
  const draft = !!o.draft;
  const scale = o.scale ?? (draft ? 0.5 : 1);
  if (!(typeof scale === 'number' && scale > 0 && scale <= 1)) throw new Error(`pixi-effects: render({ scale }): scale must be above 0 and at most 1 (got ${scale})`);
  return {
    scale,
    bitrate: o.video?.bitrate ?? (draft ? 'low' : undefined),
    motionBlur: o.motionBlur !== undefined ? o.motionBlur : (draft ? false : undefined),
  };
}
