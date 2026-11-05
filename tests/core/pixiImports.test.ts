import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// An app that bundles pixi-effects (Vite, webpack, esbuild) keeps only the parts of pixi.js the library names. `import * as PIXI from 'pixi.js'`
// read with a string (`PIXI[name]`) makes the bundler keep ALL of pixi.js: measured on a Vite app that only plays, 366.6 KB gzipped, the
// renderers and @xmldom/xmldom included; with the classes imported by name, 266.4 KB (WebGPU) / 270.5 KB (WebGL), the renderer loaded on demand
// and no @xmldom/xmldom (reported by an app whose play-only bundle went over its 400 KB budget). So: no namespace import of pixi.js in src.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('pixi.js imports stay tree-shakeable', () => {
  it('no file in src imports pixi.js as a namespace (import * as X from \'pixi.js\')', () => {
    const offenders = sources(join(__dirname, '../../src')).filter((file) => /import\s+\*\s+as\s+\w+\s+from\s+['"]pixi\.js['"]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
