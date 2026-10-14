// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as mb from 'mediabunny';
import { colorsAt, chrome } from '../support/videoColors';

const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const fx = (n: string) => join(root, 'tests/fixtures/media', n);
const run = async (argv: string[]) => { const out: string[] = [], err: string[] = []; const code = await media.runMedia(argv, { log: (s: string) => out.push(s), err: (s: string) => err.push(s) }); return { code, out: out.join('\n'), err: err.join('\n') }; };
const tmp = () => mkdtempSync(join(tmpdir(), 'media-join-'));

/** Packets of one kind of track as byte strings, and the track's first timestamp and end (what a player gets). */
async function look(file: string, kind: 'video' | 'audio') {
  const input = new mb.Input({ source: new mb.FilePathSource(file), formats: mb.ALL_FORMATS });
  const track = kind === 'video' ? await input.getPrimaryVideoTrack() : await input.getPrimaryAudioTrack();
  if (!track) return null;
  const packets: string[] = [];
  for await (const p of new mb.EncodedPacketSink(track).packets()) packets.push(Buffer.from(p.data).toString('base64'));
  return { packets, first: await track.getFirstTimestamp(), end: await track.computeDuration(), codec: track.codec };
}

describe('audio: the sound of a file, copied out', () => {
  it('colors.mp4 → .m4a is the source\'s own AAC packets, byte for byte, as long as its sound; the report says what it is', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'sound.m4a');
      const r = await media.audioFile({ input: fx('colors.mp4'), out });
      expect(r).toMatchObject({ mode: 'copy', reencoded: false, codec: 'aac' });
      expect(Math.abs(r.duration - 6)).toBeLessThan(0.1);
      const src = (await look(fx('colors.mp4'), 'audio'))!, got = (await look(out, 'audio'))!;
      // the source's own packets, byte for byte (mediabunny leaves out the first one, AAC's encoder-delay packet that starts before 0 and that no player plays)
      expect(got.packets.length).toBeGreaterThanOrEqual(src.packets.length - 1);
      expect(got.packets).toEqual(src.packets.slice(src.packets.length - got.packets.length));
      expect(await look(out, 'video')).toBeNull();
      const t = await run(['audio', fx('colors.mp4'), '-o', join(dir, 'b.m4a'), '--json']);
      expect(t.code, t.err).toBe(0);
      expect(JSON.parse(t.out)).toMatchObject({ codec: 'aac', reencoded: false });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('the Opus of a webm goes into a .webm; a codec the output type cannot hold is refused naming both and a type that can; a file with no sound is refused', async () => {
    const dir = tmp();
    try {
      const ok = await media.audioFile({ input: fx('colors.webm'), out: join(dir, 'o.webm') });
      expect(ok.codec).toBe('opus');
      const bad = await run(['audio', fx('colors.mp4'), '-o', join(dir, 'a.webm')]);                // AAC cannot go into webm
      expect(bad.code).toBe(1);
      expect(bad.err).toMatch(/aac/);
      expect(bad.err).toMatch(/\.webm/);
      expect(bad.err).toMatch(/\.m4a|\.mka/);
      expect(existsSync(join(dir, 'a.webm'))).toBe(false);
      const none = await run(['audio', fx('video-only.mp4'), '-o', join(dir, 'n.m4a')]);
      expect(none.code).toBe(1);
      expect(none.err).toMatch(/no audio track/);
      expect(readdirSync(dir).sort()).toEqual(['o.webm']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('an existing output is only replaced with --force and a refused one is never emptied; the input cannot be the output', async () => {
    const dir = tmp();
    try {
      const keep = join(dir, 'keep.webm'); copyFileSync(fx('colors.webm'), keep);
      const before = readFileSync(keep);
      expect((await run(['audio', fx('colors.mp4'), '-o', keep, '--force'])).code).toBe(1);
      expect(readFileSync(keep).equals(before)).toBe(true);
      const out = join(dir, 'a.m4a');
      expect((await run(['audio', fx('colors.mp4'), '-o', out])).code).toBe(0);
      expect((await run(['audio', fx('colors.mp4'), '-o', out])).err).toMatch(/already exists.*--force/);
      expect((await run(['audio', fx('colors.mp4'), '-o', out, '--force'])).code).toBe(0);
      expect((await run(['audio', out, '-o', out, '--force'])).err).toMatch(/would overwrite the input/);
      expect(readdirSync(dir).filter(n => n.startsWith('.'))).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('concat: clips joined by copy', () => {
  it('colors.mp4 + colors-rev.mp4: 12 s, the picture and the sound end together, no packet is re-encoded (the bytes are the sources\' own), and the seam is reported', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'both.mp4');
      const r = await media.concatFiles({ inputs: [fx('colors.mp4'), fx('colors-rev.mp4')], out });
      expect(r).toMatchObject({ mode: 'copy', reencoded: false });
      expect(r.clips).toHaveLength(2);
      expect(Math.abs(r.clips[1].from - 6.03)).toBeLessThan(0.08);                       // the second clip starts where the first ends
      expect(Math.abs(r.duration - 12.07)).toBeLessThan(0.12);
      const a = (await look(fx('colors.mp4'), 'video'))!, b = (await look(fx('colors-rev.mp4'), 'video'))!, c = (await look(out, 'video'))!;
      expect(c.packets).toEqual([...a.packets, ...b.packets]);
      const sa = (await look(fx('colors.mp4'), 'audio'))!, sb = (await look(fx('colors-rev.mp4'), 'audio'))!, sc = (await look(out, 'audio'))!;
      expect(sc.packets).toEqual([...sa.packets, ...sb.packets]);
      expect(c.first).toBeLessThan(0.05);
      expect(Math.abs(sc.end - c.end)).toBeLessThan(0.08);                                // no drift between picture and sound
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.skipIf(!chrome || process.env.SKIP_BROWSER_TESTS)('a real browser plays the join: red … cyan (the first clip), then cyan … red (the second), with no gap at the seam', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'both.mp4');
      await media.concatFiles({ inputs: [fx('colors.mp4'), fx('colors-rev.mp4')], out });
      const r = await colorsAt(out, [0.5, 1.5, 5.5, 6.5, 7.5, 11.5]);
      expect(r.at).toEqual({ 0.5: 'red', 1.5: 'green', 5.5: 'cyan', 6.5: 'cyan', 7.5: 'magenta', 11.5: 'red' });
      expect(Math.abs(r.duration - 12.07)).toBeLessThan(0.12);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);

  it('six clips joined: picture and sound still end together (the sound runs 36 ms longer than the picture in each clip, and that must not add up)', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'six.mp4');
      const a = fx('colors.mp4');
      const r = await media.concatFiles({ inputs: [a, a, a, a, a, a], out });
      const v = (await look(out, 'video'))!, s = (await look(out, 'audio'))!;
      expect(Math.abs(s.end - v.end)).toBeLessThan(0.08);
      expect(Math.abs(r.duration - 36.2)).toBeLessThan(0.3);
      expect(r.clips[5].from).toBeGreaterThan(30);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('three clips, one of them a cut, in the order given; the report has each clip\'s place in the output; the time of a clip is where it starts', async () => {
    const dir = tmp();
    try {
      const cut = join(dir, 'cut.mp4');
      await media.trimFile({ input: fx('colors.mp4'), start: 2, end: 4, out: cut });
      const out = join(dir, 'three.mp4');
      const j = JSON.parse((await run(['concat', fx('colors.mp4'), cut, fx('colors-rev.mp4'), '-o', out, '--json'])).out);
      expect(j.clips.map((c: any) => c.file)).toEqual([fx('colors.mp4'), cut, fx('colors-rev.mp4')]);
      expect(j.clips[0].from).toBe(0);
      expect(j.clips[1].from).toBeGreaterThan(5.9);
      expect(j.clips[2].from).toBeGreaterThan(7.9);
      expect(Math.abs(j.duration - 14.1)).toBeLessThan(0.2);
      const text = (await run(['concat', fx('colors.mp4'), cut, '-o', join(dir, 'two.mp4')])).out;
      expect(text.split('\n').length).toBeLessThanOrEqual(8);
      expect(text).toMatch(/joined by copy/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('clips that cannot be joined by copy are refused with what differs: another video codec, another rotation or shown size, sound in one and not the other; nothing is written; one clip is usage', async () => {
    const dir = tmp();
    try {
      const out = join(dir, 'x.mp4');
      const codec = await run(['concat', fx('colors.mp4'), fx('colors.webm'), '-o', out]);
      expect(codec.code).toBe(1);
      expect(codec.err).toMatch(/video codec.*avc.*vp9|vp9.*avc/s);
      const rot = await run(['concat', fx('colors.mp4'), fx('rotated.mp4'), '-o', out]);
      expect(rot.code).toBe(1);
      expect(rot.err).toMatch(/rotat|shown size|180×320/);
      const snd = await run(['concat', fx('colors.mp4'), fx('video-only.mp4'), '-o', out]);
      expect(snd.code).toBe(1);
      expect(snd.err).toMatch(/sound|audio/);
      for (const r of [codec, rot, snd]) { expect(r.err).toMatch(/ffmpeg|same/i); expect(r.err.trim().split('\n')).toHaveLength(1); }
      expect(existsSync(out)).toBe(false);
      expect((await run(['concat', fx('colors.mp4'), '-o', out])).code).toBe(2);
      expect(readdirSync(dir)).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('an existing output is only replaced with --force and a refused join never empties it; the output cannot be one of the inputs; a bad input is one sentence naming it', async () => {
    const dir = tmp();
    try {
      const keep = join(dir, 'keep.mp4'); copyFileSync(fx('colors.mp4'), keep);
      const before = readFileSync(keep);
      expect((await run(['concat', fx('colors.mp4'), fx('colors.webm'), '-o', keep, '--force'])).code).toBe(1);
      expect(readFileSync(keep).equals(before)).toBe(true);
      expect((await run(['concat', fx('colors.mp4'), fx('colors-rev.mp4'), '-o', keep])).err).toMatch(/already exists.*--force/);
      expect((await run(['concat', keep, fx('colors-rev.mp4'), '-o', keep, '--force'])).err).toMatch(/would overwrite the input/);
      const bad = await run(['concat', fx('colors.mp4'), join(dir, 'nope.mp4'), '-o', join(dir, 'o.mp4')]);
      expect(bad.code).toBe(1);
      expect(bad.err).toMatch(/no such file.*nope\.mp4/);
      expect(readdirSync(dir).sort()).toEqual(['keep.mp4']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('works for names with spaces and non-Latin letters, and for mov and webm outputs', async () => {
    const dir = tmp();
    try {
      const a = join(dir, 'été café.mp4'); copyFileSync(fx('colors.mp4'), a);
      const r = await run(['concat', a, fx('colors-rev.mp4'), '-o', join(dir, 'sortie 日本', 'joint.mov')]);
      expect(r.code, r.err).toBe(0);
      expect(existsSync(join(dir, 'sortie 日本', 'joint.mov'))).toBe(true);
      const w = await run(['concat', fx('colors.webm'), fx('colors.webm'), '-o', join(dir, 'w.webm')]);
      expect(w.code, w.err).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
