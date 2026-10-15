// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chrome } from '../support/videoColors';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const cli = (args: string[]) => spawnSync(process.execPath, [join(root, 'ai/tools/pixi-effects.mjs'), ...args], { encoding: 'utf8', cwd: root });
const built = existsSync(join(root, 'dist/sound.js'));

describe('the media tools in the docs an agent reads', () => {
  it('help media, probe, trim, frames and sound each print the media reference', () => {
    for (const word of ['media', 'probe', 'trim', 'frames', 'sound', 'concat']) {            // (`help audio` is the DSL's audio layer: the audio command is found by `help media`)
      const r = cli(['help', word]);
      expect(r.status, word).toBe(0);
      expect(r.stdout, word).toMatch(/pixi-effects (probe|trim|frames|sound)/);
    }
    expect(cli(['help', 'frames']).stdout).toMatch(/contact sheet/i);
  });

  it('help media opens with the four commands (one line each, pointing to help probe | trim | frames | sound), not with a section of another document', () => {
    const out = cli(['help', 'media']).stdout;
    const first = out.split('\n').slice(0, 45).join('\n');
    for (const c of ['probe', 'trim', 'frames', 'sound', 'concat', 'audio']) expect(first, c).toMatch(new RegExp(`pixi-effects ${c}\\b`));
    expect(first).toMatch(/help (probe|frames|sound|trim)/);
    expect(out).not.toMatch(/Composition/);
  });

  it('docs/media.md says to use ffmpeg for a long transcode, names the limits and the measured numbers with where they came from, and ships in the package', () => {
    const md = read('docs/media.md');
    expect(md).toMatch(/if ffmpeg is installed and the job is a long transcode, use ffmpeg/i);
    expect(md).toMatch(/one file, one machine|one machine/i);
    expect(md).toMatch(/next key frame/);
    expect(md).toMatch(/−24 LUFS/);                                           // where the notes of `sound` start (LOUDNESS_NOTES), so an empty note is not read as "fine for the web"
    expect(md).toMatch(/every:2s/);
    expect(md).toMatch(/Exit code/i);
    expect(JSON.parse(read('package.json')).files).toContain('docs/media.md');
  });

  it('SKILL.md has the rule "look at footage before you use it", README and llms-full mention the commands', () => {
    expect(read('skills/pixi-effects/SKILL.md')).toMatch(/Look at footage before you use it/);
    expect(read('skills/pixi-effects/SKILL.md')).toMatch(/pixi-effects frames/);
    expect(read('README.md')).toMatch(/pixi-effects (probe|frames)/);
    expect(read('README.md')).toMatch(/if ffmpeg is installed and the job is a long transcode, use ffmpeg/i);
    expect(read('llms-full.txt')).toMatch(/Media tools/);
    expect(read('llms.txt')).toMatch(/media\.md/);
  });

  it('every example command in docs/media.md runs on a fixture and exits 0 (so the docs cannot lie)', async () => {
    const md = read('docs/media.md');
    const lines = [...md.matchAll(/^```sh\n([\s\S]*?)```/gm)].flatMap(m => m[1]!.split('\n')).map(l => l.trim()).filter(l => /^npx pixi-effects (probe|trim|frames|sound|concat|audio) /.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(lines.some(l => /concat /.test(l))).toBe(true);
    expect(lines.some(l => /audio /.test(l))).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'media-docs-'));
    try {
      for (const line of lines) {
        const needsChrome = /^npx pixi-effects (frames|sound) /.test(line) || /--exact/.test(line);
        if (needsChrome && (!chrome || !built || process.env.SKIP_BROWSER_TESTS)) continue;
        const raw = (line.replace(/^npx pixi-effects /, '').match(/"[^"]*"|\S+/g) ?? []).map(w => w.replace(/^"|"$/g, ''));          // a quoted argument is one word, as a shell would give it
        const args = raw.map((w, i) => w === 'footage.mp4' ? join(root, 'tests/fixtures/media/colors.mp4') : raw[i - 1] === '-o' ? join(dir, w) : w);        // the input is the fixture, every -o goes to a temp folder
        const r = await promisify(execFile)(process.execPath, [join(root, 'ai/tools/pixi-effects.mjs'), ...args], { cwd: root, timeout: 120_000 }).then(() => 0, (e: any) => ({ code: e.code, err: String(e.stderr) }));
        expect(r, line).toBe(0);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 600_000);
});
