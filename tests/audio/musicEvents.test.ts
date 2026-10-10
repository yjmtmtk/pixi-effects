import { describe, it, expect, vi } from 'vitest';
import { musicEvents } from '../../src/audio/musicEvents';
import { resolveMusic } from '../../src/audio/music';
import { summarizeMusic, describeEvents } from '../../src/audio/music/events';
import { musicBeatTimes } from '../../src/audio/music/render';
import { TempoMap } from '../../src/audio/music/notation';

const score = {
  bpm: 120,
  tracks: [
    { inst: 'keys' as const, notes: 'Am7:4 Dm7:2 G7:2' },
    { inst: 'bass' as const, notes: 'a1:4 d2:2 g1:2' },
  ],
};

describe('musicEvents()', () => {
  it('lists every note: when (beats and seconds), how long, which pitches, which bar, and what it was called in the score', async () => {
    const ev = await musicEvents(score);
    expect(ev.bpm).toBe(120);
    expect(ev.meter).toBe(4);
    expect(ev.beats).toBe(8);
    expect(ev.bars).toBe(2);
    expect(ev.seconds).toBe(4);
    const keys = ev.tracks[0]!;
    expect(keys.inst).toBe('keys');
    expect(keys.beats).toBe(8);
    expect(keys.bars).toBe(2);
    expect(keys.notes[0]).toMatchObject({ beat: 0, time: 0, duration: 4, seconds: 2, bar: 1, beatInBar: 1, name: 'Am7', chord: true, midi: [57, 60, 64, 67], velocity: 0.8 });
    expect(keys.notes[1]).toMatchObject({ beat: 4, time: 2, bar: 2, beatInBar: 1, name: 'Dm7' });
    expect(keys.notes[2]).toMatchObject({ beat: 6, time: 3, bar: 2, beatInBar: 3, name: 'G7' });
    expect(ev.tracks[1]!.notes[0]).toMatchObject({ name: 'a1', chord: false, midi: [33] });
  });

  it('the pitches are the audible ones: music.transpose and a track\'s transpose are in', async () => {
    const ev = await musicEvents({ bpm: 100, transpose: 2, tracks: [{ inst: 'lead', transpose: 12, notes: 'c4' }] });
    expect(ev.tracks[0]!.notes[0]!.midi).toEqual([60 + 2 + 12]);
  });

  it('meter is the beats in a bar: it moves the bar numbers and nothing else', async () => {
    const waltz = await musicEvents({ ...score, meter: 3, tracks: [{ inst: 'keys', notes: 'c4:3 e4:3 g4:3 c5:3' }] });
    expect(waltz.meter).toBe(3);
    expect(waltz.bars).toBe(4);
    expect(waltz.tracks[0]!.notes.map(n => [n.bar, n.beatInBar])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1]]);
    expect(waltz.seconds).toBe(6);
  });

  it('a tempo change moves the seconds (the beats stay)', async () => {
    const ev = await musicEvents({ bpm: [[0, 120], [4, 60]], tracks: [{ inst: 'keys', notes: 'c4:4 e4:2 g4:2' }] });
    const t = ev.tracks[0]!.notes;
    expect(t.map(n => n.beat)).toEqual([0, 4, 6]);
    const map = new TempoMap([[0, 120], [4, 60]]);                                   // the tempo glides from 120 at beat 0 to 60 at beat 4
    t.forEach(n => expect(n.time).toBeCloseTo(map.seconds(n.beat), 5));
    expect(t[1]!.time).toBeGreaterThan(2);
  });

  it('keeps what is written: a hold lengthens the note before, a rest leaves a gap, an accent is velocity 1, [c4 e4 g4] is a chord', async () => {
    const ev = await musicEvents({ bpm: 60, tracks: [{ inst: 'keys', notes: 'c4:1 ~:1 _:1 [c4 e4 g4]:2! d4,:1' }] });
    const n = ev.tracks[0]!.notes;
    expect(n.map(x => [x.beat, x.duration])).toEqual([[0, 2], [3, 2], [5, 1]]);
    expect(n[1]).toMatchObject({ chord: true, velocity: 1, name: '[c4 e4 g4]' });
    expect(n[2]!.velocity).toBe(0.55);
  });

  it('drums: every hit with its beat and time, the pattern repeating inside from / to (beats), swing and humanize not applied', async () => {
    const ev = await musicEvents({
      bpm: 120, swing: 0.3, tracks: [{ inst: 'keys', notes: '_:8' }],
      drums: [{ kick: 'x...x...', hat: '..x...x.' }, { from: 4, to: 6, snare: '....' }],
    });
    const kick = ev.drums.find(d => d.kind === 'kick')!;
    expect(kick.hits.map(h => h.beat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(kick.hits[2]).toMatchObject({ time: 1, bar: 1, beatInBar: 3, velocity: 1 });
    const hat = ev.drums.find(d => d.kind === 'hat')!;
    expect(hat.hits.map(h => h.beat)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
    const only = await musicEvents({ bpm: 120, tracks: [{ inst: 'keys', notes: '_:8' }], drums: { from: 4, to: 6, kick: 'x...' } });
    expect(only.drums[0]!.hits.map(h => h.beat)).toEqual([4, 5]);
  });

  it('says what is wrong, like musicEnvelope(): a score that cannot play throws', async () => {
    await expect(musicEvents({ tracks: [] } as never)).rejects.toThrow(/musicEvents\(\).*bpm/);
  });

  it('warns about what it could not use but still answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ev = await musicEvents({ bpm: 90, tracks: [{ inst: 'keys', notes: 'c4:2' }, { inst: 'nope' as never, notes: 'c4' }] });
    expect(ev.tracks).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('the meter option and the summary', () => {
  const warnings = (m: unknown) => { const w: string[] = []; resolveMusic(m, 'score', x => w.push(x)); return w; };

  it('meter is a number of beats from 1 to 16 (default 4); a number outside that is clamped, a non-number falls back to 4, and either is said once', () => {
    expect(warnings({ ...score, meter: 3 })).toEqual([]);
    expect(warnings({ ...score, meter: 0 }).join()).toMatch(/music\.meter 0 is outside 1–16; using 1/);
    expect(warnings({ ...score, meter: '3/4' }).join()).toMatch(/music\.meter must be a number/);
    expect(resolveMusic({ ...score }, 'x', () => {})!.meter).toBe(4);
    const resolved = (m: unknown) => resolveMusic(m, 'x', () => {})!;
    expect(resolved({ ...score }).meterSet).toBe(false);
    expect(resolved({ ...score, meter: 3 }).meterSet).toBe(true);
    expect(resolved({ ...score, meter: '3/4' })).toMatchObject({ meter: 4, meterSet: false });      // 4 is only assumed: the read-back must not call it the author's
  });

  it('summarizeMusic: the length of every track in bars (so a short track shows), what starts in each bar, and the drum spans', () => {
    const m = resolveMusic({
      bpm: 90, meter: 4,
      tracks: [{ inst: 'pad', notes: 'C:4 Am:4 F:4 G:4' }, { inst: 'bass', notes: 'c2:4 a1:4' }, { inst: 'lead', notes: '_:8 e4:1 g4:1 a4:2 ' }],
      drums: { from: 8, kick: 'x...x...', snare: '....x...' },
    }, 'x', () => {})!;
    const s = summarizeMusic(m);
    expect(s).toMatchObject({ bpm: 90, meter: 4, meterSet: true, beats: 16, bars: 4 });
    expect(summarizeMusic(resolveMusic({ bpm: 90, tracks: [{ inst: 'pad', notes: 'C:4' }] }, 'x', () => {})!).meterSet).toBe(false);
    expect(s.tracks.map(t => [t.inst, t.beats, t.bars])).toEqual([['pad', 16, 4], ['bass', 8, 2], ['lead', 12, 3]]);
    expect(s.tracks[0]!.perBar).toEqual(['C', 'Am', 'F', 'G']);
    expect(s.tracks[2]!.perBar).toEqual(['', '', 'e4 g4(2) a4(3)']);                  // a name carries its beat in the bar unless it is on the downbeat
    expect(summarizeMusic(resolveMusic({ bpm: 90, meter: 3, tracks: [{ inst: 'keys', notes: '_:1 Am:2 | _:1 Am:1 Am:1 | c4:1.5 e4:1.5' }] }, 'x', () => {})!).tracks[0]!.perBar).toEqual(['Am(2)', 'Am(2) Am(3)', 'c4 e4(2.5)']);
    // `@` already means "octave" in a chord name (C@4), so the beat mark is a bracket
    expect(summarizeMusic(resolveMusic({ bpm: 90, tracks: [{ inst: 'pad', notes: 'C@4:4 _:1 G@4:3' }] }, 'x', () => {})!).tracks[0]!.perBar).toEqual(['C@4', 'G@4(2)']);
    expect(s.drums).toEqual([{ from: 8, to: 16, kinds: ['kick', 'snare'] }]);
  });

  it('a drum section that never plays (it starts at or after the end, or ends before it starts) is left out', () => {
    const sum = (drums: unknown) => summarizeMusic(resolveMusic({ bpm: 90, tracks: [{ inst: 'pad', notes: 'C:8' }], drums }, 'x', () => {})!).drums;
    expect(sum([{ kick: 'x...' }, { from: 12, snare: 'x...' }])).toEqual([{ from: 0, to: 8, kinds: ['kick'] }]);
    expect(sum([{ from: 6, to: 4, kick: 'x...' }])).toEqual([]);
    expect(sum([{ from: 8, kick: 'x...' }])).toEqual([]);
  });

  it('the kick hits of musicEvents are the beats react() pulses on (one schedule, not two)', () => {
    const m = resolveMusic({ bpm: [[0, 120], [8, 90]], tracks: [{ inst: 'pad', notes: 'C:16' }], drums: [{ kick: 'x...x.x.' }, { from: 8, to: 14, kick: 'x...' }] }, 'x', () => {})!;
    const kick = describeEvents(m).drums.find(d => d.kind === 'kick')!;
    const beats = musicBeatTimes(m, Infinity);
    expect(kick.hits.map(h => h.time)).toHaveLength(beats.length);
    kick.hits.forEach((h, i) => expect(h.time).toBeCloseTo(beats[i]!, 5));
  });
});
