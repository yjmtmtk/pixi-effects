// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const run = (tool: string, page: string, args: string[]) => promisify(execFile)('node', [join(root, 'ai/tools', tool), join(root, page), ...args, '--timeout', '150'], { timeout: 170_000 });

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the cookbook\'s batch recipe: one page, words from --query', () => {
  it('two --query values give two different pictures and two different video files (names with spaces and non-Latin letters work when encoded)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'batch-'));
    try {
      const rows = [['Aiko', '92'], ['Zoë Ng', '85']];
      const frames: Buffer[] = [], videos: Buffer[] = [];
      for (const [i, [name, score]] of rows.entries()) {
        const query = `name=${encodeURIComponent(name!)}&score=${score}`;
        const out = join(dir, `video-${i}.mp4`);
        await run('render.mjs', 'examples/_checks/batch.html', ['--query', query, '--draft', '--quiet', '-o', out]);
        expect(statSync(out).size).toBeGreaterThan(1000);
        videos.push(readFileSync(out));
        const ck = join(dir, `ck-${i}`);
        await run('check.mjs', 'examples/_checks/batch.html', ['--query', query, '--no-export', '--at', '0.5', '--out', ck]);
        frames.push(readFileSync(join(ck, 'frames/0.50s.png')));
      }
      expect(frames[0]!.equals(frames[1]!)).toBe(false);          // the words differ
      expect(videos[0]!.equals(videos[1]!)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 400_000);
});
