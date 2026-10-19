// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

describe('check: a file the page could not load is named, not waited for', () => {
  it('says which address failed and how, in a sentence', () => {
    expect(check.describeLoadFailure({ url: 'http://127.0.0.1:5000/dist/index.js', status: 404, type: 'Script' })).toMatch(/dist\/index\.js.*404.*not found/i);
    expect(check.describeLoadFailure({ url: 'https://esm.sh/pixi.js@8', error: 'net::ERR_CONNECTION_RESET', type: 'Script' })).toMatch(/esm\.sh.*could not be fetched.*ERR_CONNECTION_RESET/s);
  });

  it('a network failure of another site, or a 5xx, may be a hiccup worth one more try; a 404 of the page\'s own files never is', () => {
    const own = 'http://127.0.0.1:5000';
    expect(check.isTransientLoadFailure({ url: 'https://esm.sh/x.js', error: 'net::ERR_CONNECTION_RESET' }, own)).toBe(true);
    expect(check.isTransientLoadFailure({ url: 'https://cdn.jsdelivr.net/x.js', status: 503 }, own)).toBe(true);
    expect(check.isTransientLoadFailure({ url: 'https://esm.sh/x.js', status: 404 }, own)).toBe(false);
    expect(check.isTransientLoadFailure({ url: `${own}/dist/index.js`, status: 404 }, own)).toBe(false);
  });
});

async function run(page: string): Promise<{ code: number; stdout: string; report: any; seconds: number }> {
  const out = mkdtempSync(join(tmpdir(), 'check-lf-'));
  const from = Date.now();
  let stdout = '';
  const code = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films', page), '--no-export', '--out', out, '--timeout', '90'], { timeout: 120_000 })
    .then((r) => { stdout = r.stdout; return 0; }, (e: any) => { stdout = e.stdout ?? ''; return e.code as number; });
  return { code, stdout, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')), seconds: (Date.now() - from) / 1000 };
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check on a page whose module cannot be loaded', () => {
  it("a missing file of the page's own folder: said within seconds, with the address and 404, not after 60 s of silence", async () => {
    const r = await run('check-load-fail.html');
    expect(r.code).toBe(1);
    expect(r.seconds, 'it did not wait for the 60 s').toBeLessThan(30);
    const said = r.report.problems.join('\n');
    expect(said).toMatch(/no-such-module\.js/);
    expect(said).toMatch(/404/);
    expect(said).toMatch(/not ready|did not become ready/);
    expect(r.report.loadFailures[0]).toMatchObject({ status: 404 });
    expect(r.report.retried, 'a 404 of our own file is not retried').toBeFalsy();
  }, 150_000);

  it('a favicon.ico 404 is not a failed load: a page that starts slowly is waited for, and the favicon is not named', async () => {
    const r = await run('check-favicon-slow.html');
    expect(r.report.ready, 'the page became ready after its 5 s of waiting').toBe(true);
    expect(r.report.problems.join('\n')).not.toMatch(/favicon|could not be loaded/i);
    expect(JSON.stringify(r.report.loadFailures ?? [])).not.toMatch(/favicon/);
  }, 150_000);

  it('a network failure is tried once more (a hiccup of a CDN), then said, naming the address and that it tried twice', async () => {
    const r = await run('check-load-fail-net.html');
    expect(r.code).toBe(1);
    expect(r.seconds).toBeLessThan(45);
    expect(r.report.retried).toBe(true);
    const said = r.report.problems.join('\n');
    expect(said).toMatch(/127\.0\.0\.1:9\/never\.js/);
    expect(said).toMatch(/twice|2 times|tried again/i);
  }, 150_000);
});
