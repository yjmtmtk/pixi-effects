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

describe('the documented loudest moment and level are what the presets really do', () => {
  const dsl = read('docs/dsl.md');
  const loudest = new Map([...dsl.matchAll(/^\| `(\w+)` \| [\d.]+ s \| ([^|]+?) \| ≈ \d+ Hz \|/gm)].map(m => [m[1]!, m[2]!.trim()]));
  const measure = (name: (typeof SFX_PRESETS)[number]) => {
    const [l, r] = renderSfx({ preset: name, pitch: 0, brightness: 0, seed: 0, length: sfxDefaultLength(name) }, SR);
    let peak = 0, at = 0;
    for (let i = 0; i < l.length; i++) {
      const x = Math.max(Math.abs(l[i]!), Math.abs(r[i]!));
      if (x > peak) { peak = x; at = i; }
    }
    return { peak, at: at / SR, length: l.length / SR };
  };
  for (const name of SFX_PRESETS) {
    it(`${name}: "loudest at" in docs/dsl.md matches the measured peak`, () => {
      const doc = loudest.get(name);
      expect(doc, `no row for ${name}`).toBeDefined();
      const m = measure(name);
      if (doc === 'start') expect(m.at).toBeLessThan(0.05);
      else if (doc === 'its end') expect(m.at).toBeGreaterThan(m.length * 0.9);
      else if (doc === 'flat') return;                                   // a held tone has no single loudest moment
      else expect(Math.abs(m.at - parseFloat(doc!))).toBeLessThan(0.03);   // e.g. "0.16 s"
    });
  }
  it('volume 1 peaks between −12 and −18 dBFS (the docs say so, not "−12")', () => {
    const peaks = SFX_PRESETS.map(n => 20 * Math.log10(measure(n).peak));
    expect(Math.max(...peaks)).toBeCloseTo(-12, 0);
    expect(Math.min(...peaks)).toBeGreaterThan(-18.6);
    expect(dsl).toContain('−12 … −18 dBFS');
    expect(read('ai/reference/cheatsheet.md')).toContain('−12 … −18 dBFS');
  });
});
