// @vitest-environment node
// `probe file --expect "size=3840x2160 fps=30 frames=300 bitrate>=35M audio=none"`: the file's own numbers against what a platform or a brief asks, one line each,
// exit 1 when one does not hold. The numbers come from the packets of the file (not from a header that says what the encoder meant).
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const fx = (n: string) => join(root, 'tests/fixtures/media', n);
const run = async (argv: string[]) => { const out: string[] = [], err: string[] = []; const code = await media.runMedia(argv, { log: (s: string) => out.push(s), err: (s: string) => err.push(s) }); return { code, out: out.join('\n'), err: err.join('\n') }; };

describe('parseExpect: the words of an expectation', () => {
  it('reads name, operator and value, separated by spaces or commas; units for bitrate (k, M) and duration (s)', () => {
    expect(media.parseExpect('size=3840x2160 fps=30,frames=300 bitrate>=35M duration<=60s audio=none')).toEqual([
      { key: 'size', op: '=', raw: '3840x2160' }, { key: 'fps', op: '=', raw: '30' }, { key: 'frames', op: '=', raw: '300' },
      { key: 'bitrate', op: '>=', raw: '35M' }, { key: 'duration', op: '<=', raw: '60s' }, { key: 'audio', op: '=', raw: 'none' }]);
    expect(media.parseExpect('frames>299 frames<301 fps!=25 video=avc container=mp4').map((e: any) => e.op)).toEqual(['>', '<', '!=', '=', '=']);
    expect(media.parseExpect('matrix=bt709 transfer!=bt709').map((e: any) => [e.key, e.op, e.raw])).toEqual([['matrix', '=', 'bt709'], ['transfer', '!=', 'bt709']]);
  });
  it('refuses what it cannot read, with the names it knows', () => {
    expect(() => media.parseExpect('bitrat>=35M')).toThrow(/unknown "bitrat".*did you mean "bitrate"/);
    expect(() => media.parseExpect('speed=2')).toThrow(/unknown "speed".*size.*fps.*frames/);
    expect(() => media.parseExpect('frames')).toThrow(/frames: write a comparison/);
    expect(() => media.parseExpect('')).toThrow(/nothing to check/);
    expect(() => media.parseExpect('size>=100x100')).toThrow(/size.*only = or !=/);
    expect(() => media.parseExpect('matrix>1')).toThrow(/matrix.*only = or !=/);
    expect(() => media.parseExpect('frames=lots')).toThrow(/frames.*number.*lots/);
  });
});

describe('checkExpect: each expectation against the file\'s numbers', () => {
  const report = { container: 'MP4', duration: 10.033, video: [{ codec: 'avc', width: 3840, height: 2160, fps: 30, end: 10, frameGap: 1 / 30, frames: 300, bitrate: 20_000_000, bitrateAll: 17_800_000, color: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'bt709', fullRange: false } }], audio: [] };
  const check = (text: string) => media.checkExpect(report, media.parseExpect(text));
  it('passes and fails by the real numbers, and says both the number it found and the one it wanted', () => {
    const r = check('size=3840x2160 fps=30 frames=300 duration=10 video=avc audio=none container=mp4 width=3840 height=2160');
    expect(r.every((x: any) => x.ok), JSON.stringify(r.filter((x: any) => !x.ok))).toBe(true);
    const bad = check('frames=301 size=1920x1080 audio=any bitrate>=35M video=hevc container=mov');
    expect(bad.map((x: any) => x.ok)).toEqual([false, false, false, false, false, false]);
    expect(bad[0].line).toMatch(/FAIL\s+frames\s+300 .*wanted =301/);
    expect(bad[3].line).toMatch(/FAIL\s+bitrate\s+17\.8 Mbps .*wanted >=35 Mbps/);          // the whole file's bitrate, not the first frames'
  });
  it('the colour tags: matrix and transfer are read from the file (an sRGB-tagged file has the Rec.709 matrix and the sRGB transfer, and says so)', () => {
    expect(check('matrix=bt709 transfer=iec61966-2-1').every((x: any) => x.ok)).toBe(true);
    const bad = check('transfer=bt709');
    expect(bad[0].ok).toBe(false);
    expect(bad[0].line).toMatch(/FAIL\s+transfer\s+iec61966-2-1\s+\(wanted =bt709\)/);
    expect(media.checkExpect({ container: 'MP4', duration: 1, video: [{ codec: 'avc', width: 2, height: 2, fps: 30, end: 1 }], audio: [] }, media.parseExpect('matrix=bt709'))[0].line).toMatch(/not tagged/);
  });
  it('a length is right to half a frame, a frame rate to 0.01; > < >= <= != work', () => {
    expect(check('duration=10.01')[0].ok).toBe(true);
    expect(check('duration=10.1')[0].ok).toBe(false);
    expect(check('fps=29.995')[0].ok).toBe(true);
    expect(check('fps=29.97')[0].ok).toBe(false);
    expect(check('frames>299 frames<=300 frames!=299').every((x: any) => x.ok)).toBe(true);
    expect(check('bitrate<20M')[0].ok).toBe(true);
  });
  it('a file with no picture fails what asks about the picture, and says so', () => {
    const r = media.checkExpect({ container: 'M4A', duration: 3, video: [], audio: [{ codec: 'aac' }] }, media.parseExpect('size=320x180 audio=aac'));
    expect(r[0].ok).toBe(false); expect(r[0].line).toMatch(/no video/);
    expect(r[1].ok).toBe(true);
  });
});

describe('probe --expect, on a real file', () => {
  it('colors.mp4 is 320x180, 30 fps, 181 frames, with sound: all hold, exit 0, one line each', async () => {
    const r = await run(['probe', fx('colors.mp4'), '--expect', 'size=320x180 fps=30 frames=181 audio=aac video=avc container=mp4 duration=6.03']);
    expect(r.code, r.out + r.err).toBe(0);
    expect(r.out).toMatch(/ok\s+frames\s+181/);
    expect(r.out).toMatch(/RESULT: all 7 expectations hold/);
  });
  it('one that does not hold: exit 1, the line says what the file has, the others are still listed', async () => {
    const r = await run(['probe', fx('colors.mp4'), '--expect', 'frames=180 audio=none size=320x180']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/FAIL\s+frames\s+181 .*wanted =180/);
    expect(r.out).toMatch(/FAIL\s+audio\s+aac/);
    expect(r.out).toMatch(/ok\s+size\s+320x180/);
    expect(r.out).toMatch(/RESULT: 2 of 3 expectations do not hold/);
  });
  it('the plain report names the colour tags, and --expect can ask for the matrix (a platform that wants Rec.709)', async () => {
    const t = await run(['probe', fx('colors.mp4')]);
    expect(t.out).toMatch(/colour bt709 .*transfer iec61966-2-1.*limited/);
    const r = await run(['probe', fx('colors.mp4'), '--expect', 'matrix=bt709']);
    expect(r.code, r.out).toBe(0);
    expect(JSON.parse((await run(['probe', fx('colors.mp4'), '--json'])).out).video[0].color).toEqual({ primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'bt709', fullRange: false });
  });
  it('--json carries the results; a bad expectation is a usage error (exit 2) before the file is read', async () => {
    const j = JSON.parse((await run(['probe', fx('colors.mp4'), '--expect', 'frames=181', '--json'])).out);
    expect(j.expect).toEqual([expect.objectContaining({ key: 'frames', op: '=', ok: true, got: 181 })]);
    const bad = await run(['probe', fx('colors.mp4'), '--expect', 'bitrat>=1M']);
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/did you mean "bitrate"/);
  });
  it('without --expect the report is what it was (no frame count is paid for)', async () => {
    const r = JSON.parse((await run(['probe', fx('colors.mp4'), '--json'])).out);
    expect(r.video[0].frames).toBeUndefined();
    expect(r.expect).toBeUndefined();
  });
});
