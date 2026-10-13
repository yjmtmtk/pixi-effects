import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** A minimal PNG reader for tests: 8-bit RGB or RGBA, not interlaced (what a canvas writes). `pixel(x, y)` is [r, g, b, a]. */
export function readPng(file: string): { width: number; height: number; pixel(x: number, y: number): number[] } {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  let pos = 8, width = 0, height = 0, channels = 4;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); const depth = data[8], color = data[9], interlace = data[12]; if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour ${color}, interlace ${interlace})`); channels = color === 6 ? 4 : 3; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!, line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels]! : 0, b = y ? out[(y - 1) * stride + i]! : 0, c = i >= channels && y ? out[(y - 1) * stride + i - channels]! : 0;
      let v = line[i]!;
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = v & 255;
    }
  }
  return { width, height, pixel: (x, y) => { const o = y * stride + x * channels; return [out[o]!, out[o + 1]!, out[o + 2]!, channels === 4 ? out[o + 3]! : 255]; } };
}

/** 'red' | 'green' | … for a flat-colour pixel of the colors.* fixtures. */
export function colourName([r, g, b]: number[]): string {
  const near = (v: number, t: number) => Math.abs(v - t) <= 40;
  const rgb = (cr: number, cg: number, cb: number) => near(r!, cr) && near(g!, cg) && near(b!, cb);
  return rgb(255, 0, 0) ? 'red' : rgb(0, 255, 0) ? 'green' : rgb(0, 0, 255) ? 'blue' : rgb(255, 255, 0) ? 'yellow' : rgb(255, 0, 255) ? 'magenta' : rgb(0, 255, 255) ? 'cyan' : `other(${[r, g, b]})`;
}
