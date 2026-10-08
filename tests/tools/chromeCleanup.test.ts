// @vitest-environment node
// A test (or `pixi-effects-check`) that starts a private Chrome must not leave it running: a Chrome whose page is stuck in an endless loop
// ignored the polite stop and went on burning a CPU core (and holding the audio device) for hours.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const alive = (dir: string): number => {
  try { return execFileSync('pgrep', ['-f', '--', `--user-data-dir=${dir}`]).toString().trim().split('\n').filter(Boolean).length; } catch { return 0; }   // pgrep exits 1 for none
};

describe.skipIf(!chrome || process.env.SKIP_BROWSER_TESTS)('launchChrome: stopping it stops all of it', () => {
  it('kill() ends the browser and every helper, even while a page spins in an endless loop', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cleanup-'));
    const { proc, cdp } = await check.launchChrome(chrome, dir);
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      expect(alive(dir)).toBeGreaterThan(0);
      cdp.send('Page.navigate', { url: 'data:text/html,<script>for(;;){}</script>' }).catch(() => {});
      await check.sleep(1500);                                              // the renderer is now spinning
      proc.kill();
      let n = alive(dir);
      for (let i = 0; i < 40 && n > 0; i++) { await check.sleep(250); n = alive(dir); }
      expect(n, 'processes still running with the browser\'s profile directory').toBe(0);
    } finally {
      try { execFileSync('pkill', ['-KILL', '-f', '--', `--user-data-dir=${dir}`]); } catch { /* none left */ }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('a browser whose owner dies without cleaning up (a test run that timed out, a killed script) is stopped too', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cleanup-orphan-'));
    // a throw-away node process starts the browser and is then killed hard (SIGKILL: no handler can run)
    const owner = spawn(process.execPath, ['--input-type=module', '-e', `
      const check = await import(${JSON.stringify(pathToFileURL(join(root, 'ai/tools/check.mjs')).href)});
      await check.launchChrome(${JSON.stringify(chrome)}, ${JSON.stringify(dir)});
      console.log('started');
      setInterval(() => {}, 1000);
    `], { stdio: ['ignore', 'pipe', 'inherit'] });
    try {
      await new Promise<void>((ok, bad) => { owner.stdout.on('data', (d) => String(d).includes('started') && ok()); owner.on('exit', () => bad(new Error('the owner exited early'))); setTimeout(() => bad(new Error('the owner did not start the browser')), 30000); });
      expect(alive(dir)).toBeGreaterThan(0);
      owner.kill('SIGKILL');
      let n = alive(dir);
      for (let i = 0; i < 60 && n > 0; i++) { await check.sleep(250); n = alive(dir); }        // up to 15 s
      expect(n, 'processes still running after their owner was killed').toBe(0);
    } finally {
      try { execFileSync('pkill', ['-KILL', '-f', '--', `--user-data-dir=${dir}`]); } catch { /* none left */ }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90000);

  it('a call that is waiting when the browser is killed ends with an error, it does not hang', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cleanup-wait-'));
    const { proc, cdp } = await check.launchChrome(chrome, dir);
    try {
      await cdp.send('Runtime.enable');
      const waiting = cdp.eval('new Promise(() => {})').then(() => 'answered', (e: Error) => e.message);       // a promise that never settles
      await check.sleep(500);
      proc.kill();
      const result = await Promise.race([waiting, check.sleep(8000).then(() => 'still waiting after 8 s')]);
      expect(result).toMatch(/connection to Chrome closed/);
    } finally {
      try { execFileSync('pkill', ['-KILL', '-f', '--', `--user-data-dir=${dir}`]); } catch { /* none left */ }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
