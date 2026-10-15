// @vitest-environment node
// A run that is killed, or whose watchman never got to do its work (a sandboxed agent's command, a harness that ended), can leave a headless
// Chrome behind: on 2026-10-14 264 of them (5.7 GB) piled up from one working day. Whatever the cause, the NEXT start of a tool sweeps them:
// every private profile folder (`pixi-effects-*` in the temp folder) carries its owner's process id (`pixi-owner.pid`); when that owner is
// gone, everything started with the profile is stopped (by process id, no pkill) and the folder is removed. These tests use plain processes
// as stand-ins, so they need no Chrome.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const posix = process.platform !== 'win32';

const made: string[] = [];
const kids: ChildProcess[] = [];
afterEach(() => {
  for (const k of kids.splice(0)) { try { k.kill('SIGKILL'); } catch { /* gone */ } }
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A temp folder standing in for the system temp folder. */
const fakeTmp = (): string => { const d = mkdtempSync(join(tmpdir(), 'reap-tmp-')); made.push(d); return d; };
/** A profile folder with an optional owner file. */
const profile = (tmp: string, name: string, owner?: number): string => {
  const d = join(tmp, name);
  mkdirSync(d);
  if (owner !== undefined) writeFileSync(join(d, 'pixi-owner.pid'), String(owner));
  return d;
};
/** A long-running stand-in for "a Chrome started with this profile": its command line carries the flag. */
const standIn = (dir: string): ChildProcess => {
  const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', `--user-data-dir=${dir}`], { stdio: 'ignore' });
  kids.push(p);
  return p;
};
const running = (p: ChildProcess): boolean => { try { process.kill(p.pid!, 0); return p.exitCode === null && p.signalCode === null; } catch { return false; } };
/** A process id that is certainly not running. */
const deadPid = (): number => { const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']); return Number(r.stdout.toString()); };
/** A process that was just killed still answers signal 0 until its exit is collected: judge "still running" only after a moment. */
const settle = () => new Promise((r) => setTimeout(r, 600));
const waitGone = async (p: ChildProcess, ms = 5000): Promise<boolean> => {
  for (let t = 0; t < ms && running(p); t += 100) await new Promise((r) => setTimeout(r, 100));
  return !running(p);
};

describe.skipIf(!posix)('reapStaleChrome: a start of a tool sweeps what a dead owner left', () => {
  it('stops everything started with a profile whose owner is gone, and removes the folder', async () => {
    const tmp = fakeTmp();
    const dir = profile(tmp, 'pixi-effects-media-AAAAAA', deadPid());
    const orphan = standIn(dir);
    await new Promise((r) => setTimeout(r, 300));
    expect(running(orphan)).toBe(true);
    const r = check.reapStaleChrome(tmp);
    expect(await waitGone(orphan), 'the stand-in is still running').toBe(true);
    expect(existsSync(dir)).toBe(false);
    expect(r.removed).toEqual([dir]);
  });

  it('leaves a profile alone while its owner is alive (another tool is running right now)', async () => {
    const tmp = fakeTmp();
    const dir = profile(tmp, 'pixi-effects-check-BBBBBB', process.pid);     // this test process is the live owner
    const busy = standIn(dir);
    await new Promise((r) => setTimeout(r, 300));
    const r = check.reapStaleChrome(tmp);
    await settle();
    expect(running(busy)).toBe(true);
    expect(existsSync(dir)).toBe(true);
    expect(r.removed).toEqual([]);
  });

  it('leaves a profile with no owner file alone (a tool that is just starting has not written it yet)', async () => {
    const tmp = fakeTmp();
    const dir = profile(tmp, 'pixi-effects-render-CCCCCC');
    const starting = standIn(dir);
    await new Promise((r) => setTimeout(r, 300));
    check.reapStaleChrome(tmp);
    await settle();
    expect(running(starting)).toBe(true);
    expect(existsSync(dir)).toBe(true);
  });

  it('never touches a folder that is not one of ours, even with a dead owner file', async () => {
    const tmp = fakeTmp();
    const dir = profile(tmp, 'somebody-elses-DDDDDD', deadPid());
    const other = standIn(dir);
    await new Promise((r) => setTimeout(r, 300));
    check.reapStaleChrome(tmp);
    await settle();
    expect(running(other)).toBe(true);
    expect(existsSync(dir)).toBe(true);
  });

  it('does not take a profile whose name only starts like another (…-AAAAAA vs …-AAAAAAB) for the stale one', async () => {
    const tmp = fakeTmp();
    const stale = profile(tmp, 'pixi-effects-media-EEEEEE', deadPid());
    const livingDir = profile(tmp, 'pixi-effects-media-EEEEEEB', process.pid);
    const living = standIn(livingDir);
    await new Promise((r) => setTimeout(r, 300));
    check.reapStaleChrome(tmp);
    await settle();
    expect(existsSync(stale)).toBe(false);
    expect(running(living)).toBe(true);
    expect(existsSync(livingDir)).toBe(true);
  });

  it('a missing or empty temp folder is not an error', () => {
    expect(() => check.reapStaleChrome(join(tmpdir(), 'reap-no-such-folder'))).not.toThrow();
    expect(check.reapStaleChrome(fakeTmp()).removed).toEqual([]);
  });
});

describe.skipIf(!posix || !check.findChrome() || process.env.SKIP_BROWSER_TESTS)('launchChrome records its owner', () => {
  it('writes the owner file into the profile, and sweeps stale profiles before it starts', async () => {
    const chromePath = check.findChrome();
    const stale = mkdtempSync(join(tmpdir(), 'pixi-effects-reaptest-'));
    writeFileSync(join(stale, 'pixi-owner.pid'), String(deadPid()));
    const dir = mkdtempSync(join(tmpdir(), 'pixi-effects-reaptest-'));
    const { proc } = await check.launchChrome(chromePath, dir);
    try {
      expect(existsSync(join(dir, 'pixi-owner.pid'))).toBe(true);
      expect(Number(readFileSync(join(dir, 'pixi-owner.pid'), 'utf8'))).toBe(process.pid);
      expect(existsSync(stale), 'the stale profile was not swept').toBe(false);
    } finally {
      proc.kill();
      rmSync(dir, { recursive: true, force: true });
      rmSync(stale, { recursive: true, force: true });
    }
  }, 60000);
});
