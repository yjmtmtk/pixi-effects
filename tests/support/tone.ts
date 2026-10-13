import { writeFileSync } from 'node:fs';

/** A 16-bit PCM stereo WAV of a 997 Hz sine at `dbfs` (peak), `seconds` long, with `gapAt`..`gapAt + gapFor` seconds of silence if asked. Tests write these into a temp folder. */
export function writeTone(file: string, dbfs: number, seconds = 4, gap?: { at: number; for: number }): void {
  const sr = 48000, n = Math.round(sr * seconds), amp = 10 ** (dbfs / 20) * 32767;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / sr, silent = gap && t >= gap.at && t < gap.at + gap.for;
    const v = silent ? 0 : Math.max(-32768, Math.min(32767, Math.round(amp * Math.sin(2 * Math.PI * 997 * t))));
    data.writeInt16LE(v, i * 4); data.writeInt16LE(v, i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}
