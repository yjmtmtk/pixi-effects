// @vitest-environment node
// The Playground's WebMCP tools on a real Chrome (154+, started with --enable-features=WebMCP).
// What that Chrome does, measured with a probe page: getTools() items have { name, title, description, inputSchema (a JSON string),
// annotations { readOnlyHint, consequentialHint, untrustedContentHint }, origin, window }; executeTool(tool, argsAsJsonString) returns
// the result as a JSON string; image content { type: 'image', data, mimeType } passes through; a tool that throws reaches the agent with
// no message; parallel executeTool calls run in parallel; arguments are not validated against the schema.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const FLAGS = ['--enable-features=WebMCP'];

async function open<T>(fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'mcp-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir, FLAGS);
  try {
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/playground.html` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('!!(window.__playground && window.__playground.last && window.__playground.last.status)').catch(() => false)) break; await check.sleep(200); }
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

// does this Chrome have WebMCP? (document.modelContext exists on a secure page, not on about:blank)
const hasWebMcp: boolean = chrome ? await (async () => {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'mcp-has-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir, FLAGS);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/ai/chat-template.html` });
    await check.sleep(800);
    return !!(await cdp.eval('!!document.modelContext'));
  } catch { return false; } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
})() : false;

/** executeTool by name, with the arguments as the JSON string Chrome wants; the result parsed. */
const exec = (cdp: any, name: string, args: unknown = {}) => cdp.eval(`(async () => {
  const mc = document.modelContext, tool = (await mc.getTools()).find(t => t.name === ${JSON.stringify(name)});
  if (!tool) return { missing: true };
  return JSON.parse(await mc.executeTool(tool, ${JSON.stringify(JSON.stringify(args))}));
})()`);
const body = (r: any) => JSON.parse(r.content.find((c: any) => c.type === 'text').text);

describe.skipIf(!chrome || !built || !hasWebMcp || process.env.SKIP_BROWSER_TESTS)('the Playground\'s WebMCP tools, on a real Chrome', () => {
  it('registers the ten tools, with schemas and hints, and the page says so', async () => {
    await open(async (cdp) => {
      const tools = await cdp.eval(`(async () => (await document.modelContext.getTools()).map(t => ({ name: t.name, desc: t.description.length, schema: JSON.parse(t.inputSchema).type, ro: t.annotations ? t.annotations.readOnlyHint : null, untrusted: t.annotations ? t.annotations.untrustedContentHint : null })))()`);
      expect(tools.map((t: any) => t.name).sort()).toEqual(['check', 'get_code', 'get_docs', 'list_examples', 'load_example', 'look', 'onion', 'render_draft', 'run', 'set_code']);
      for (const t of tools) { expect(t.desc).toBeGreaterThan(20); expect(t.schema).toBe('object'); }
      expect(tools.find((t: any) => t.name === 'check').ro).toBe(true);
      expect(tools.find((t: any) => t.name === 'set_code').ro).not.toBe(true);
      expect(tools.find((t: any) => t.name === 'get_code').untrusted).toBe(true);
      expect(await cdp.eval(`document.getElementById('agent').textContent`)).toMatch(/AI agent tools: 10/);
    });
  }, 120000);

  it('an agent can write, run, check, look, draw onion skin and render a draft', async () => {
    await open(async (cdp) => {
      const code = await cdp.eval(`window.__playground.presets[0].code`);
      const set = body(await exec(cdp, 'set_code', { code }));
      expect(set).toMatchObject({ ready: true, duration: 4, width: 1280 });
      expect(set.logs).toEqual([]);
      expect(await cdp.eval(`window.__playground.editor.get() === ${JSON.stringify(code)}`)).toBe(true);        // the editor really changed
      const got = await exec(cdp, 'get_code');
      expect(got.content[0].text).toBe(code);

      const review = body(await exec(cdp, 'check'));
      expect(review.problems).toEqual([]);
      expect(review.frames).toBeGreaterThanOrEqual(10);
      expect(review.audio).toBeNull();

      const look = await exec(cdp, 'look', { count: 3 });
      const pic = look.content.find((c: any) => c.type === 'image');
      expect(pic.mimeType).toBe('image/png');
      expect(Buffer.from(pic.data, 'base64').subarray(0, 4).toString('hex')).toBe('89504e47');                  // a real PNG, not a data URL
      const at = await exec(cdp, 'look', { at: '1, 50%' });
      expect(body(at).at.map((x: any) => x.frame)).toEqual([30, 60]);

      const onion = await exec(cdp, 'onion', { from: 0, to: 2, count: 3 });
      expect(onion.content.find((c: any) => c.type === 'image').data.length).toBeGreaterThan(500);

      const draft = body(await exec(cdp, 'render_draft', { range: [0, 2] }));
      expect(draft.bytes).toBeGreaterThan(1000);
    });
  }, 300000);

  it('broken code comes back as warnings to read, and the next check does not fail', async () => {
    await open(async (cdp) => {
      const code = await cdp.eval(`window.__playground.presets[0].code.replace("type: 'text',", "type: 'nope',")`);
      const set = body(await exec(cdp, 'set_code', { code }));
      expect(set.logs.join('\n')).toMatch(/unknown sequence type "nope"/);
      const r = await exec(cdp, 'check');
      expect(r.isError).not.toBe(true);
    });
  }, 120000);

  it('a mistake in the arguments is an error result with the words, not a failed invocation', async () => {
    await open(async (cdp) => {
      const r = await exec(cdp, 'set_code', { code: 5 });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/code must be a string/);
      const r2 = await exec(cdp, 'look', { at: 'nonsense' });
      expect(r2.isError).toBe(true);
      expect(r2.content[0].text).toMatch(/cannot read "nonsense"/);
    });
  }, 120000);

  it('two tools called at the same moment are handled one after the other: a run is not replaced under a check', async () => {
    await open(async (cdp) => {
      const r = await cdp.eval(`(async () => {
        const mc = document.modelContext, tools = await mc.getTools(), by = n => tools.find(t => t.name === n);
        const [run, check] = await Promise.all([mc.executeTool(by('run'), '{}'), mc.executeTool(by('check'), '{}')]);
        return { run: JSON.parse(run), check: JSON.parse(check), frames: document.querySelectorAll('iframe').length };
      })()`);
      expect(body(r.run).ready).toBe(true);
      expect(r.check.isError, 'the check ran on the movie the run built').not.toBe(true);
      expect(body(r.check).frames).toBeGreaterThanOrEqual(10);
      expect(r.frames).toBe(1);
    });
  }, 180000);

  it('examples and docs: list, load one (it runs), read the cheatsheet of the same site', async () => {
    await open(async (cdp) => {
      const list = body(await exec(cdp, 'list_examples'));
      expect(list.map((e: any) => e.id)).toContain('13-sfx');
      const loaded = body(await exec(cdp, 'load_example', { id: '13-sfx' }));
      expect(loaded).toMatchObject({ ready: true, duration: 14 });
      expect(await cdp.eval(`window.__playground.editor.get().includes("PRESETS = ['click'")`)).toBe(true);
      const sound = body(await exec(cdp, 'check'));
      expect(sound.audio.cues).toBeUndefined();                                                                  // the sound curve is left out of what an agent reads
      expect(sound.audio.windows).toBeUndefined();
      expect(sound.audio.loudness).toBeTruthy();
      const bad = await exec(cdp, 'load_example', { id: 'nope' });
      expect(bad.isError).toBe(true);
      const docs = await exec(cdp, 'get_docs', { part: 'cheatsheet' });
      expect(docs.content[0].text).toContain('movie.render');
    });
  }, 300000);
});
