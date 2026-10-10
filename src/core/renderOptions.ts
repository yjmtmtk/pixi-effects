/** Pure parts of the render options: a bitrate, which video codec to write, and the audio-only formats. */

export const QUALITY_NAMES = ['very-low', 'low', 'medium', 'high', 'very-high'] as const;
export type QualityName = (typeof QUALITY_NAMES)[number];

/** A bitrate is a quality name or a number of bits a second (`8000000`, `'8M'`, `'800k'`). */
export function parseBitrate(v: unknown): { quality?: QualityName; bps?: number } {
  if (v === undefined || v === null) return {};
  if (typeof v === 'string' && (QUALITY_NAMES as readonly string[]).includes(v)) return { quality: v as QualityName };
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return { bps: Math.round(v) };
  const m = typeof v === 'string' ? /^\s*(\d+(?:\.\d+)?)\s*([kKmM]?)\s*$/.exec(v) : null;
  if (m) {
    const n = Number(m[1]) * ({ '': 1, k: 1e3, m: 1e6 } as Record<string, number>)[m[2]!.toLowerCase()]!;
    if (n > 0) return { bps: Math.round(n) };
  }
  throw new Error(`pixi-effects: bitrate ${JSON.stringify(v)}: use a quality (${QUALITY_NAMES.join(', ')}) or bits a second (8000000, '8M', '800k')`);
}

export const AUDIO_FORMATS = ['wav', 'ogg'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];
export const isAudioFormat = (f: unknown): f is AudioFormat => (AUDIO_FORMATS as readonly unknown[]).includes(f);

export type VideoFormat = 'mp4' | 'mov' | 'webm' | 'mkv';

/** The video codecs each container is asked to hold, the usual one first. */
export const VIDEO_CODEC_PREFERENCE: Record<VideoFormat, readonly string[]> = {
  mp4: ['avc', 'hevc', 'vp9', 'av1'],
  mov: ['avc', 'hevc'],
  webm: ['vp9', 'av1', 'vp8'],
  mkv: ['vp9', 'avc', 'hevc', 'av1', 'vp8'],
};

const CODEC_ALIASES: Record<string, string> = {
  h264: 'avc', 'h.264': 'avc', x264: 'avc', avc1: 'avc', h265: 'hevc', 'h.265': 'hevc', x265: 'hevc', hvc1: 'hevc', hev1: 'hevc',
  vp09: 'vp9', 'vp-9': 'vp9', av01: 'av1', vp80: 'vp8', 'vp-8': 'vp8',
};

/**
 * The video codec to write. The usual one for the container is used when this browser can encode it; when it cannot, the next that works (and
 * `fellBackFrom` says so). A codec the caller names is never swapped: it is used, or the error says which one would work.
 */
export async function chooseVideoCodec(a: {
  fmt: VideoFormat; requested?: string; canEncode: (codec: string) => Promise<boolean>; supported?: readonly string[];
}): Promise<{ codec: string; fellBackFrom?: string }> {
  const held = a.supported ?? VIDEO_CODEC_PREFERENCE[a.fmt];
  const order = VIDEO_CODEC_PREFERENCE[a.fmt].filter(c => held.includes(c));
  const firstThatWorks = async (list: readonly string[]): Promise<string | null> => { for (const c of list) if (await a.canEncode(c)) return c; return null; };
  if (a.requested) {
    const alias = CODEC_ALIASES[a.requested.toLowerCase()];
    if (alias) throw new Error(`pixi-effects: render({ video: { codec: "${a.requested}" } }): "${a.requested}" is not a codec name here; did you mean "${alias}"?`);
    if (!order.includes(a.requested)) throw new Error(`pixi-effects: render(): "${a.requested}" cannot go in ${a.fmt} (${a.fmt} holds ${order.join(', ')})`);
    if (await a.canEncode(a.requested)) return { codec: a.requested };
    const alt = await firstThatWorks(order.filter(c => c !== a.requested));
    throw new Error(`pixi-effects: this browser cannot encode "${a.requested}" video for ${a.fmt}` +
      (alt ? `; "${alt}" would work: render({ format: '${a.fmt}', video: { codec: '${alt}' } }), or leave video.codec out and the best one is chosen.` : '; it can encode none of ' + order.join(', ') + '.'));
  }
  const chosen = await firstThatWorks(order);
  if (!chosen) throw new Error(`pixi-effects: this browser has no video encoder for ${a.fmt} (it tried ${order.join(', ')}): try another browser, or another format`);
  return chosen === order[0] ? { codec: chosen } : { codec: chosen, fellBackFrom: order[0]! };
}
