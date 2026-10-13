// Makes the fixtures of the media-tool tests (tests/fixtures/media): the commands are tested on files whose contents are known.
//
//   node scripts/make-media-fixtures.mjs
//
// colors.{mp4,webm,mov}: 320x180, 30 fps, 6 s, second k is ONE flat colour (red green blue yellow magenta cyan) with a 440 Hz tone, made by our own renderer.
// rotated.mp4, video-only.mp4, audio-only.m4a: colors.mp4 copied packet by packet with mediabunny (a rotation flag; one kind of track).
// (the tones of the loudness tests are not committed: tests/support/tone.ts writes them into a temp folder when a test needs one.)
// The outputs are committed (each under 200 KB); run this again only when a fixture has to change.
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Input, ALL_FORMATS, FilePathSource, Output, Mp4OutputFormat, FilePathTarget, Conversion } from 'mediabunny';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tests/fixtures/media');

for (const ext of ['mp4', 'webm', 'mov']) {
  const r = spawnSync(process.execPath, [join(root, 'ai/tools/render.mjs'), join(dir, 'colors.html'), '-o', join(dir, `colors.${ext}`), '--root', root], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`rendering colors.${ext} failed`);
}

/** colors.mp4 → `out`, by copy, with the given conversion options. */
async function derive(out, options) {
  const input = new Input({ source: new FilePathSource(join(dir, 'colors.mp4')), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(join(dir, out)) });
  const conversion = await Conversion.init({ input, output, ...options });
  if (!conversion.isValid) throw new Error(`${out}: ${conversion.discardedTracks.map(d => d.reason).join(', ')}`);
  await conversion.execute();
}
await derive('rotated.mp4', { video: { rotate: 90 } });
await derive('video-only.mp4', { audio: { discard: true } });
await derive('audio-only.m4a', { video: { discard: true } });

for (const f of ['colors.mp4', 'colors.webm', 'colors.mov', 'rotated.mp4', 'video-only.mp4', 'audio-only.m4a']) {
  console.log(`${f.padEnd(16)} ${existsSync(join(dir, f)) ? `${(statSync(join(dir, f)).size / 1024).toFixed(0)} KB` : 'MISSING'}`);
}
