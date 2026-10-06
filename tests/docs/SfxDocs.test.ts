import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRESETS, SFX_PRESETS } from '../../src/audio/presets';
import { renderSfx, sfxDefaultLength } from '../../src/audio/sfx';
import { spectralCentroid } from '../../src/core/spectrum';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const SR = 48000;

describe('every sfx preset is documented with its real length and brightness', () => {
  const cheat = read('ai/reference/cheatsheet.md');
  const rows = new Map([...read('docs/dsl.md').matchAll(/^\| `(\w+)` \| ([\d.]+) s \| [^|]+ \| ≈ (\d+) Hz \|/gm)]
    .map(m => [m[1]!, { length: Number(m[2]), hz: Number(m[3]) }]));
  for (const name of SFX_PRESETS) {
    it(name, () => {
      expect(cheat).toContain(`\`${name}\` ${PRESETS[name].length}`);
      const row = rows.get(name);
      expect(row, `docs/dsl.md has no preset row for ${name}`).toBeDefined();
      expect(row!.length).toBe(PRESETS[name].length);
      const [l, r] = renderSfx({ preset: name, pitch: 0, brightness: 0, seed: 0, length: sfxDefaultLength(name) }, SR);
      const hz = spectralCentroid(l.map((x, i) => (x + r[i]!) / 2), SR);
      expect(Math.abs(hz - row!.hz) / hz).toBeLessThan(0.25);
    });
  }
});
