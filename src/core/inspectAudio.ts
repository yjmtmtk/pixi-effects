import type { AudioDescriptor } from '../types';
import type { MixStats } from './AudioMixer';
import { spectralCentroid } from './spectrum';
import { findSilences, LOUDNESS_NOTES, measureLoudness } from '../audio/loudness';

export interface AudioInspectOptions {
  /** Width of each loudness window in seconds. Default 0.1. */
  window?: number;
  /** The scenes to measure one by one (`movie.inspectAudio()` fills this from the movie's named top-level layers). Default: the whole movie as one. */
  scenes?: Array<{ name: string; start: number; end: number }>;
}

/** One sound measured ON ITS OWN (not mixed), so overlapping layers do not blur it. */
export interface SoundMeasure {
  /** Seconds of audio the source has (an sfx: its length; a file: the file's length). */
  length: number;
  /** Its own loudest sample, dBFS (before the layer's volume). */
  peakDb: number;
  /** Seconds from its start to its loudest sample — the moment to line up with the picture. */
  loudestAt: number;
  /** Spectral centroid in Hz: < 500 dark / boomy, 1–4 k mid, > 8 k airy / hissy. */
  brightnessHz: number;
}

export interface AudioSourceReport {
  /** `layer "pop-1"` (or `unnamed audio layer`). */
  layer: string;
  /** `sfx "pop"`, `asset "bgm"`, `video "green"`. */
  source: string;
  /** Movie time, seconds. */
  start: number;
  end: number;
  /** Loudest sample of the MIX while this source plays, dBFS (−120 = silence). */
  peakDb: number;
  sound: SoundMeasure;
}

export interface AudioReport {
  duration: number;
  sampleRate: number;
  /** Loudest sample of the mix before limiting, dBFS. Above 0 the mix was limited. */
  peakDb: number;
  peakAt: number;
  /** Every audio layer / video soundtrack in the mix, in start order. */
  sources: AudioSourceReport[];
  /** The mix over time: one row per window, `t` = window start. */
  windows: Array<{ t: number; rmsDb: number; peakDb: number; brightnessHz: number }>;
  /** Problems worth fixing: limiting, clipping, a true peak above 0 dBTP, inaudible layers, sounds cut off by the end of the movie. Read this first. */
  issues: string[];
  /** The mix as a whole (ITU-R BS.1770 loudness; `integratedLufs` is null for a mix shorter than 0.4 s or with nothing above −70 LUFS). */
  loudness: { integratedLufs: number | null; truePeakDb: number; clippedSamples: number; silences: Array<{ from: number; to: number }> };
  /** The same measure for each scene (`silent`: nothing above −60 dBFS). */
  scenes: Array<{ name: string; from: number; to: number; lufs: number | null; peakDb: number; silent: boolean }>;
  /** When each sound starts: what a waveform marks. */
  cues: Array<{ t: number; name: string }>;
  /** Advice, not faults: a mix that is quiet or loud for web video, little headroom, silent stretches. */
  notes: string[];
}

interface PcmLike {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(ch: number): Float32Array;
}

/** Below this a source counts as inaudible. */
const INAUDIBLE_DB = -50;

const db = (x: number): number => Math.round(10 * Math.max(-120, 20 * Math.log10(x))) / 10;
const mono = (chans: Float32Array[]): Float32Array => {
  if (chans.length === 1) return chans[0]!;
  const out = new Float32Array(chans[0]!.length);
  for (const d of chans) for (let i = 0; i < out.length; i++) out[i] = out[i]! + d[i]! / chans.length;
  return out;
};

function measure(chans: Float32Array[], sampleRate: number): SoundMeasure {
  let peak = 0;
  let at = 0;
  for (const d of chans) for (let i = 0; i < d.length; i++) if (Math.abs(d[i]!) > peak) { peak = Math.abs(d[i]!); at = i; }
  return {
    length: Math.round((chans[0]!.length / sampleRate) * 1000) / 1000,
    peakDb: db(peak),
    loudestAt: Math.round((at / sampleRate) * 1000) / 1000,
    brightnessHz: spectralCentroid(mono(chans), sampleRate),
  };
}

/**
 * Measure the soundtrack so an author who cannot listen can still check it: every sound on its own
 * (length, level, loudest moment, brightness), when it plays and how loud the mix is there, the mix over
 * time, and issues. Pure: takes the mix and the list of sources that went into it.
 */
export function analyzeAudio(
  mix: PcmLike | null, sources: AudioDescriptor[], stats: MixStats | null, movieDuration: number, opts: AudioInspectOptions = {},
): AudioReport {
  if (!mix) {
    return { duration: movieDuration, sampleRate: 0, peakDb: -120, peakAt: 0, sources: [], windows: [],
      loudness: { integratedLufs: null, truePeakDb: -120, clippedSamples: 0, silences: [] }, scenes: [], cues: [], notes: [], issues: ['no audio: the movie has no audio layers (sound effects need no files: { type: "audio", sfx: "pop", at: 1 })'] };
  }
  const sr = mix.sampleRate;
  const chans = Array.from({ length: mix.numberOfChannels }, (_, c) => mix.getChannelData(c));
  const mixMono = mono(chans);
  const peakIn = (t0: number, t1: number): number => {
    let p = 0;
    const i1 = Math.min(mix.length, Math.ceil(t1 * sr));
    for (const d of chans) for (let i = Math.max(0, Math.floor(t0 * sr)); i < i1; i++) p = Math.max(p, Math.abs(d[i]!));
    return p;
  };

  // at least 10 ms: a smaller window would ask for a spectrum per sample
  const win = opts.window && opts.window > 0 ? Math.max(0.01, opts.window) : 0.1;
  const windows: AudioReport['windows'] = [];
  for (let t = 0; t < movieDuration - 1e-9; t += win) {
    const i0 = Math.floor(t * sr);
    const i1 = Math.min(mix.length, Math.floor((t + win) * sr));
    let sum = 0;
    let peak = 0;
    for (const d of chans) {
      for (let i = i0; i < i1; i++) {
        sum += d[i]! * d[i]!;
        peak = Math.max(peak, Math.abs(d[i]!));
      }
    }
    const n = Math.max(1, (i1 - i0) * chans.length);
    windows.push({ t: Math.round(t * 1000) / 1000, rmsDb: db(Math.sqrt(sum / n)), peakDb: db(peak), brightnessHz: spectralCentroid(mixMono, sr, i0, i1) });
  }

  const issues: string[] = [];
  if (stats && stats.peak > 1) {
    issues.push(`the mix peaks at ${db(stats.peak)} dBFS at ${stats.peakAt.toFixed(2)}s and was limited — lower the volume of the layers playing there`);
  }
  const rendered = new Map<string, SoundMeasure>();
  const soundOf = (s: AudioDescriptor): SoundMeasure => {
    if (s.synth) {
      let m = rendered.get(s.synth.key);
      if (!m) rendered.set(s.synth.key, (m = measure(s.synth.render(sr), sr)));
      return m;
    }
    const b = s.buffer!;
    return measure(Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), b.sampleRate);
  };
  const list = [...sources].sort((a, b) => a.start - b.start).map(s => {
    const layer = s.layer ?? 'an audio layer';
    const source = s.source ?? 'audio';
    const peakDb = db(peakIn(s.start, Math.min(s.end, movieDuration)));
    const sound = soundOf(s);
    // The layer's OWN level: the sound's peak at the loudest volume it ever has. Judging the mix instead would
    // hide a nearly silent layer under a loud one.
    const topVolume = Math.max(s.initialVolume ?? 1, ...(s.volumeKeyframes ?? []).map(k => k.value));
    const ownDb = db(Math.pow(10, sound.peakDb / 20) * Math.max(0, topVolume));
    if (s.start >= movieDuration) {
      issues.push(`${layer} (${source}) starts at ${s.start.toFixed(2)}s, after the movie ends (${movieDuration}s)`);
    } else if (ownDb < INAUDIBLE_DB || peakDb < INAUDIBLE_DB) {
      issues.push(`${layer} (${source}) is inaudible from ${s.start.toFixed(2)}s to ${s.end.toFixed(2)}s (its own peak ${ownDb} dBFS at volume ${topVolume}; mix peak there ${peakDb} dBFS) — check its volume`);
    }
    if (s.synth && s.end > movieDuration + 1e-6 && s.start < movieDuration) {
      issues.push(`${layer} (${source}) is cut off by the end of the movie at ${movieDuration}s (it runs to ${s.end.toFixed(2)}s)`);
    }
    return { layer, source, start: s.start, end: s.end, peakDb, sound };
  });

  // the mix as a whole, scene by scene, and the advice
  const whole = measureLoudness(chans, sr);
  const silences = findSilences(chans, sr, { minLength: 1 });
  if (whole.clippedSamples > 0) issues.push(`${whole.clippedSamples} sample(s) of the mix are at full scale (clipped) — lower the volume of the layers that play loudest`);
  if (whole.truePeakDb > 0) issues.push(`the mix's true peak is ${whole.truePeakDb} dBTP: it will distort when the video is encoded — lower the volume`);
  const notes: string[] = [];
  if (whole.integratedLufs !== null) {
    if (whole.integratedLufs < LOUDNESS_NOTES.quietBelow) notes.push(`the mix is quiet for web video: ${whole.integratedLufs} LUFS (typical −14 to −16); raise the volume if that is not on purpose`);
    else if (whole.integratedLufs > LOUDNESS_NOTES.loudAbove) notes.push(`the mix is loud: ${whole.integratedLufs} LUFS (typical web video −14 to −16)`);
  }
  if (whole.truePeakDb > LOUDNESS_NOTES.headroomDb && whole.truePeakDb <= 0) notes.push(`the true peak is ${whole.truePeakDb} dBTP: little headroom left for encoding (keep it below ${LOUDNESS_NOTES.headroomDb} dBTP)`);
  for (const q of silences.slice(0, 3)) notes.push(`the mix is silent from ${q.from} s to ${q.to} s (${Math.round((q.to - q.from) * 10) / 10} s)`);
  if (silences.length > 3) notes.push(`and ${silences.length - 3} more silent stretch(es) (loudness.silences lists them all)`);
  const sceneList = (opts.scenes && opts.scenes.length ? opts.scenes : [{ name: 'movie', start: 0, end: movieDuration }]).map(sc => {
    const a = Math.max(0, Math.round(sc.start * sr)), b = Math.min(mix.length, Math.round(sc.end * sr));
    const part = chans.map(c => c.subarray(a, Math.max(a, b)));
    const m = measureLoudness(part, sr);
    return { name: sc.name, from: sc.start, to: sc.end, lufs: m.integratedLufs, peakDb: m.samplePeakDb, silent: m.samplePeakDb < -60 };
  });

  return {
    duration: movieDuration,
    sampleRate: sr,
    peakDb: db(stats?.peak ?? peakIn(0, movieDuration)),
    peakAt: stats?.peakAt ?? 0,
    sources: list,
    windows,
    issues,
    loudness: { integratedLufs: whole.integratedLufs, truePeakDb: whole.truePeakDb, clippedSamples: whole.clippedSamples, silences },
    scenes: sceneList,
    cues: list.map(s => ({ t: s.start, name: `${s.layer} (${s.source})` })),
    notes,
  };
}
